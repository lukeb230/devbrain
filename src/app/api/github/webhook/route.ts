import { NextResponse } from "next/server";
import { alert } from "@/lib/alerts";
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
    const message = String((err as Error)?.message || err).slice(0, 300);
    await alert({ scope: "ops", key: `webhook.${where.split(":")[0]}`, title: `GitHub webhook handler failing (${where})`, detail: message });
    if (orgId) await alert({ scope: { orgId }, key: `webhook.${where.split(":")[0]}`, severity: "warn", title: `GitHub sync hiccup (${where.split(":")[0]})`, detail: message });
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
          // App uninstalled → keep history: soft-unlink its repos, mark the
          // installation suspended. (Deleting the row would cascade-delete
          // every task, journal and PR record for those repos.)
          const now = new Date().toISOString();
          await admin.from("linked_repos").update({ unlinked_at: now }).eq("installation_id", inst.id).is("unlinked_at", null);
          await admin.from("installations").update({ suspended: true }).eq("id", inst.id);
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
          // Removed from the installation on GitHub → soft unlink (history kept).
          const { data: gone } = await admin.from("linked_repos").update({ unlinked_at: new Date().toISOString() }).eq("github_repo_id", r.id).select("org_id, full_name").maybeSingle();
          if (gone) await alert({ scope: { orgId: gone.org_id }, key: `repo.removed.${gone.full_name}`, severity: "warn", title: `${gone.full_name} was removed from the GitHub App`, detail: "DevBrain unlinked it (history kept). Reinstall the app on the repo to relink." });
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

        // Record default-branch pushes as history entries — the rollback
        // timeline. Commit messages + files come free on the push payload.
        if (branch === repo.default_branch && payload.after !== "0000000000000000000000000000000000000000") {
          const commits = (payload.commits ?? []) as {
            id: string; message: string; added?: string[]; modified?: string[]; removed?: string[];
          }[];
          const head = payload.head_commit ?? commits[commits.length - 1];
          const files = [
            ...new Set(
              commits.flatMap((c) => [...(c.added ?? []), ...(c.modified ?? []), ...(c.removed ?? [])]),
            ),
          ].slice(0, 40);
          await admin.from("events").insert({
            org_id: repo.org_id,
            repo_id: repo.id,
            kind: "main_push",
            payload: {
              sha: payload.after,
              before: payload.before,
              message: String(head?.message ?? "").split("\n")[0].slice(0, 160),
              pusher: payload.pusher?.name ?? null,
              commit_count: commits.length,
              files,
            },
          });
        }

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
          head_sha: pr.head.sha,
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

          // ---- Auto-complete on merge -----------------------------------
          // Layer 1 (deterministic): "DevBrain-Task: <uuid>" trailers in the
          // PR body, plus open handoffs whose branch matches — both close
          // their tasks instantly, no AI involved. Anything unlabeled queues
          // for the AI matcher on the agent tick.
          const trailerIds = [
            ...String(pr.body ?? "").matchAll(/DevBrain-Task:\s*([0-9a-f-]{36})/gi),
          ].map((m) => m[1].toLowerCase());
          const { data: branchHandoffs } = await admin
            .from("handoffs")
            .select("task_id")
            .eq("repo_id", repo.id)
            .eq("branch", pr.head.ref)
            .not("task_id", "is", null);
          const taskIds = [
            ...new Set([...trailerIds, ...(branchHandoffs ?? []).map((h) => String(h.task_id))]),
          ];

          let closed = 0;
          if (taskIds.length > 0) {
            const { data: closedRows } = await admin
              .from("tasks")
              .update({
                status: "done",
                done_by: `${pr.user?.login ?? "someone"} · PR #${pr.number}`,
                done_at: new Date().toISOString(),
                maybe_done_pr: null,
              })
              .eq("repo_id", repo.id)
              .eq("status", "open")
              .in("id", taskIds)
              .select("id, title");
            closed = (closedRows ?? []).length;
            for (const t of closedRows ?? []) {
              await admin.from("events").insert({
                org_id: repo.org_id,
                repo_id: repo.id,
                kind: "task_auto",
                payload: { task: t.title, pr: pr.number, by: pr.user?.login ?? null, via: "trailer" },
              });
            }
          }
          await admin
            .from("prs")
            .update({
              task_ids: taskIds,
              // Only unlabeled merges queue for the AI matcher.
              automatch: closed > 0 ? "done" : "pending",
            })
            .eq("repo_id", repo.id)
            .eq("number", pr.number);
        }
        break;
      }

      case "pull_request_review": {
        const repo = await repoByGithubId(admin, payload.repository.id);
        if (!repo) break;
        // GitHub sends a review state on every action, but only two of them
        // bear on whether a PR is cleared to land. Writing the state verbatim
        // let a comment-only review overwrite an approval: a green PR would
        // silently drop to "waiting on a teammate's review" because somebody
        // replied in a thread. GitHub itself keeps the approval.
        const action = String(payload.action ?? "");
        const state = String(payload.review?.state ?? "").toLowerCase();
        let next: string | null | undefined;
        if (action === "submitted" && (state === "approved" || state === "changes_requested")) {
          next = state;
        } else if (action === "dismissed") {
          next = null; // approval withdrawn — back to waiting
        }
        if (next === undefined) break; // commented, edited: no bearing on the light
        await admin
          .from("prs")
          .update({ review_state: next, updated_at: new Date().toISOString() })
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
