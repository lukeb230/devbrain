import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { changedFiles, prChangedFiles, prMergeableState, verifyWebhook } from "@/lib/github";

/** Log a diagnostic into the events table so failures are visible, not silent. */
async function logError(admin: Admin, orgId: string | null, repoId: string | null, where: string, err: unknown) {
  try {
    await admin.from("events").insert({
      org_id: orgId,
      repo_id: repoId,
      kind: "error",
      payload: { where, message: String((err as Error)?.message || err) },
    });
  } catch { /* last resort: swallow */ }
}

// ============================================================================
// GitHub App webhook receiver.
// Handles: installation lifecycle, installation_repositories, push,
// pull_request, pull_request_review. Everything else is 204-acknowledged.
//
// Auth: X-Hub-Signature-256 HMAC verification against the raw body — this
// route is excluded from cookie middleware and uses the service role.
// ============================================================================

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!(await verifyWebhook(rawBody, signature))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const event = request.headers.get("x-github-event") || "unknown";
  const payload = JSON.parse(rawBody);
  const admin = supabaseAdmin();

  try {
    switch (event) {
      case "installation": {
        const inst = payload.installation;
        if (payload.action === "created") {
          await admin.from("installations").upsert({
            id: inst.id,
            account_login: inst.account.login,
            account_type: inst.account.type,
          });
          // Repos selected during install arrive on this same payload.
          for (const r of payload.repositories ?? []) {
            await upsertRepo(admin, inst.id, r);
          }
        } else if (payload.action === "deleted") {
          await admin.from("installations").delete().eq("id", inst.id);
        } else if (
          payload.action === "suspend" ||
          payload.action === "unsuspend"
        ) {
          await admin
            .from("installations")
            .update({ suspended: payload.action === "suspend" })
            .eq("id", inst.id);
        }
        break;
      }

      case "installation_repositories": {
        const instId = payload.installation.id;
        for (const r of payload.repositories_added ?? []) {
          await upsertRepo(admin, instId, r);
        }
        for (const r of payload.repositories_removed ?? []) {
          await admin.from("linked_repos").delete().eq("github_repo_id", r.id);
        }
        break;
      }

      case "push": {
        const repo = await repoByGithubId(admin, payload.repository.id);
        if (!repo) break;
        const branch = (payload.ref as string).replace("refs/heads/", "");
        let files: string[] = [];
        if (branch !== repo.default_branch) {
          try {
            files = await changedFiles(
              payload.installation.id,
              payload.repository.full_name,
              repo.default_branch,
              branch,
            );
          } catch (err) {
            await logError(admin, repo.org_id, repo.id, `push:compare:${branch}`, err);
          }
        }
        await admin.from("branches").upsert({
          repo_id: repo.id,
          org_id: repo.org_id,
          name: branch,
          head_sha: payload.after,
          changed_files: files,
          last_push_at: new Date().toISOString(),
        });

        // Main moved → conflict status of every open PR may have changed.
        if (branch === repo.default_branch) {
          const { data: openPrs } = await admin
            .from("prs")
            .select("number")
            .eq("repo_id", repo.id)
            .eq("state", "open");
          for (const p of openPrs ?? []) {
            try {
              const state = await prMergeableState(
                payload.installation.id,
                payload.repository.full_name,
                p.number,
              );
              await admin
                .from("prs")
                .update({ mergeable_state: state })
                .eq("repo_id", repo.id)
                .eq("number", p.number);
            } catch (err) {
              await logError(admin, repo.org_id, repo.id, `push:mergeable:#${p.number}`, err);
            }
          }
        }
        break;
      }

      case "delete": {
        // Branch deleted on GitHub → drop it from the dashboard immediately.
        if (payload.ref_type === "branch") {
          const repo = await repoByGithubId(admin, payload.repository.id);
          if (repo) {
            await admin
              .from("branches")
              .delete()
              .eq("repo_id", repo.id)
              .eq("name", payload.ref);
          }
        }
        break;
      }

      case "pull_request": {
        const repo = await repoByGithubId(admin, payload.repository.id);
        if (!repo) break;
        const pr = payload.pull_request;
        let files: string[] = [];
        try {
          files = await prChangedFiles(
            payload.installation.id,
            payload.repository.full_name,
            pr.number,
          );
        } catch (err) {
          await logError(admin, repo.org_id, repo.id, `pr:files:#${pr.number}`, err);
        }
        let mergeable = "unknown";
        if (pr.state === "open") {
          try {
            mergeable = await prMergeableState(
              payload.installation.id,
              payload.repository.full_name,
              pr.number,
            );
          } catch (err) {
            await logError(admin, repo.org_id, repo.id, `pr:mergeable:#${pr.number}`, err);
          }
        }
        await admin.from("prs").upsert({
          repo_id: repo.id,
          org_id: repo.org_id,
          number: pr.number,
          title: pr.title,
          author: pr.user?.login,
          head_branch: pr.head.ref,
          base_branch: pr.base.ref,
          state: pr.merged ? "merged" : pr.state,
          draft: pr.draft ?? false,
          changed_files: files,
          mergeable_state: mergeable,
          html_url: pr.html_url,
          updated_at: new Date().toISOString(),
        });

        // Merge landed → stamp the head branch so it shows "merged" for 48h.
        if (payload.action === "closed" && pr.merged) {
          await admin
            .from("branches")
            .update({ merged_at: new Date().toISOString() })
            .eq("repo_id", repo.id)
            .eq("name", pr.head.ref);
        }
        break;
      }

      case "pull_request_review": {
        const repo = await repoByGithubId(admin, payload.repository.id);
        if (!repo) break;
        await admin
          .from("prs")
          .update({
            review_state: payload.review.state, // approved | changes_requested | commented
            updated_at: new Date().toISOString(),
          })
          .eq("repo_id", repo.id)
          .eq("number", payload.pull_request.number);
        break;
      }
    }
  } catch (err) {
    console.error(`webhook ${event} failed:`, err);
    // 200 anyway — GitHub retries on 5xx and we don't want poison-pill loops;
    // failures are visible in logs.
  }

  return NextResponse.json({ ok: true });
}

// ----------------------------------------------------------------------------

type Admin = ReturnType<typeof supabaseAdmin>;

async function upsertRepo(
  admin: Admin,
  installationId: number,
  r: { id: number; full_name: string },
) {
  // Attach the repo to the org of whoever owns this installation. Phase 0
  // heuristic: installation → org via the installations row; if the
  // installation has no org yet (webhook raced the setup redirect), the
  // /api/github/setup route claims it for the signed-in user's org.
  const { data: inst } = await admin
    .from("installations")
    .select("org_id")
    .eq("id", installationId)
    .single();
  if (!inst?.org_id) return; // claimed later by setup redirect

  await admin.from("linked_repos").upsert(
    {
      org_id: inst.org_id,
      installation_id: installationId,
      github_repo_id: r.id,
      full_name: r.full_name,
    },
    { onConflict: "github_repo_id" },
  );
}

async function repoByGithubId(admin: Admin, githubRepoId: number) {
  const { data } = await admin
    .from("linked_repos")
    .select("id, org_id, default_branch")
    .eq("github_repo_id", githubRepoId)
    .single();
  return data;
}
