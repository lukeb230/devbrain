import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { changedFiles, verifyWebhook } from "@/lib/github";

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
          } catch {
            /* branch may be gone or compare too large — keep [] */
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
        break;
      }

      case "pull_request": {
        const repo = await repoByGithubId(admin, payload.repository.id);
        if (!repo) break;
        const pr = payload.pull_request;
        let files: string[] = [];
        try {
          files = await changedFiles(
            payload.installation.id,
            payload.repository.full_name,
            pr.base.ref,
            pr.head.ref,
          );
        } catch {
          /* keep [] */
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
          html_url: pr.html_url,
          updated_at: new Date().toISOString(),
        });
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
