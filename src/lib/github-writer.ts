import { App } from "@octokit/app";

// ============================================================================
// The WRITER GitHub App — Direction 2 ("Copilot"), kept deliberately caged:
//
//   - A SEPARATE app from the read-only one, with its own credentials, so
//     write capability exists only where this app is explicitly installed.
//   - Every write goes through a branch + pull request. There is no code
//     path here that pushes to a default branch — reverts, brain updates,
//     everything lands as a PR a human reviews under the normal team rules.
//   - Callers must check the per-repo writer policy toggles before invoking.
//   - Every successful write should be recorded as an events row
//     (kind 'bot_write') by the caller — that's the audit trail.
// ============================================================================

function normalizePrivateKey(raw: string): string {
  let key = (raw || "").replace(/\\n/g, "\n").trim();
  if (key.includes("BEGIN")) return key;
  const body = key.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) || [];
  return `-----BEGIN RSA PRIVATE KEY-----\n${lines.join("\n")}\n-----END RSA PRIVATE KEY-----\n`;
}

export function writerConfigured(): boolean {
  return Boolean(process.env.DEVBRAIN_GHW_APP_ID && process.env.DEVBRAIN_GHW_PRIVATE_KEY);
}

function writerApp() {
  return new App({
    appId: process.env.DEVBRAIN_GHW_APP_ID!,
    privateKey: normalizePrivateKey(process.env.DEVBRAIN_GHW_PRIVATE_KEY || ""),
  });
}

export async function writerOctokit(installationId: number) {
  return writerApp().getInstallationOctokit(installationId);
}

/** Look up the writer app's installation on a repo (null if not installed). */
export async function findWriterInstallation(fullName: string): Promise<number | null> {
  if (!writerConfigured()) return null;
  const [owner, repo] = fullName.split("/");
  try {
    const res = await writerApp().octokit.request("GET /repos/{owner}/{repo}/installation", {
      owner,
      repo,
    });
    return res.data.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Auto-merge a green-lit PR as the writer app. Only ever called when the
 * per-repo writer_auto_merge policy is ON and the light is green. Squash by
 * default (clean one-commit-per-PR history), falling back to a merge commit
 * if the repo disallows squash. GitHub branch protection is the hard
 * backstop — if requirements aren't actually met, the API refuses.
 */
export async function mergePrAsWriter(
  installationId: number,
  fullName: string,
  prNumber: number,
): Promise<{ merged: boolean; sha?: string; error?: string }> {
  const [owner, repo] = fullName.split("/");
  const octokit = await writerOctokit(installationId);
  for (const method of ["squash", "merge"] as const) {
    try {
      const res = await octokit.request("PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge", {
        owner,
        repo,
        pull_number: prNumber,
        merge_method: method,
      });
      return { merged: true, sha: res.data.sha };
    } catch (err) {
      const msg = String(err);
      // Squash disallowed on this repo → try a merge commit; anything else
      // (protection unmet, race with a human) → report, don't retry.
      if (method === "squash" && /squash/i.test(msg)) continue;
      return { merged: false, error: msg.slice(0, 300) };
    }
  }
  return { merged: false, error: "no allowed merge method" };
}

/**
 * Bring a stale PR branch up to date with its base — GitHub's own "Update
 * branch" button, driven by the writer app. Merges base into head server-side:
 * no force-push, no history rewrite. Returns updated:false with the error when
 * GitHub refuses (409/422 = merge conflict → the PR needs a local rebase; the
 * context's rebase_needed entry already carries the fix).
 */
export async function updatePrBranchAsWriter(
  installationId: number,
  fullName: string,
  prNumber: number,
): Promise<{ updated: boolean; error?: string }> {
  const [owner, repo] = fullName.split("/");
  try {
    const octokit = await writerOctokit(installationId);
    await octokit.request("PUT /repos/{owner}/{repo}/pulls/{pull_number}/update-branch", {
      owner,
      repo,
      pull_number: prNumber,
    });
    return { updated: true };
  } catch (err) {
    return { updated: false, error: String(err).slice(0, 300) };
  }
}

export interface RevertResult {
  prNumber: number;
  prUrl: string;
  branch: string;
  restored: number;
}

/**
 * One-click revert as a PR: restores every file the range beforeSha→afterSha
 * touched back to its beforeSha state, on a fresh revert/ branch, then opens
 * a PR. Never touches the default branch directly. Caps at 40 files.
 */
export async function createRevertPr(opts: {
  installationId: number;
  fullName: string;
  beforeSha: string;
  afterSha: string;
  defaultBranch: string;
  label: string; // human-readable description of what's being reverted
  requestedBy: string;
}): Promise<RevertResult> {
  const { installationId, fullName, beforeSha, afterSha, defaultBranch, label, requestedBy } = opts;
  const [owner, repo] = fullName.split("/");
  const octokit = await writerOctokit(installationId);

  // What did the range change?
  const cmp = await octokit.request("GET /repos/{owner}/{repo}/compare/{basehead}", {
    owner,
    repo,
    basehead: `${beforeSha}...${afterSha}`,
  });
  const files = (cmp.data.files ?? []) as {
    filename: string;
    status: string;
    previous_filename?: string;
  }[];
  if (files.length === 0) throw new Error("Nothing to revert — the range changed no files.");
  if (files.length > 40) {
    throw new Error(`Range touches ${files.length} files (limit 40) — revert this one manually.`);
  }

  // Fresh branch off the CURRENT default-branch head.
  const headRef = await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  });
  const short = afterSha.slice(0, 7);
  const branch = `revert/${short}-${Math.random().toString(36).slice(2, 6)}`;
  await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
    owner,
    repo,
    ref: `refs/heads/${branch}`,
    sha: headRef.data.object.sha,
  });

  // Restore each touched file to its beforeSha state on the new branch.
  const fileSha = async (path: string, ref: string): Promise<string | null> => {
    try {
      const r = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
        owner, repo, path, ref,
      });
      return Array.isArray(r.data) ? null : (r.data as { sha: string }).sha;
    } catch {
      return null;
    }
  };
  const contentAt = async (path: string, ref: string): Promise<string | null> => {
    try {
      const r = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
        owner, repo, path, ref,
      });
      if (Array.isArray(r.data)) return null;
      return (r.data as { content?: string }).content ?? null; // base64
    } catch {
      return null;
    }
  };

  let restored = 0;
  for (const f of files) {
    const targets =
      f.status === "renamed" && f.previous_filename
        ? [
            { path: f.previous_filename, restore: true }, // bring old path back
            { path: f.filename, restore: false }, // remove new path
          ]
        : f.status === "added"
          ? [{ path: f.filename, restore: false }] // file didn't exist before → delete
          : [{ path: f.filename, restore: true }]; // modified/removed → restore old content

    for (const t of targets) {
      if (t.restore) {
        const before = await contentAt(t.path, beforeSha);
        if (before === null) continue;
        const existing = await fileSha(t.path, branch);
        await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
          owner, repo, path: t.path,
          message: `revert: restore ${t.path} to ${beforeSha.slice(0, 7)}`,
          content: before,
          branch,
          ...(existing ? { sha: existing } : {}),
        });
      } else {
        const existing = await fileSha(t.path, branch);
        if (!existing) continue;
        await octokit.request("DELETE /repos/{owner}/{repo}/contents/{path}", {
          owner, repo, path: t.path,
          message: `revert: remove ${t.path} (introduced in ${short})`,
          sha: existing,
          branch,
        });
      }
      restored++;
    }
  }

  const pr = await octokit.request("POST /repos/{owner}/{repo}/pulls", {
    owner,
    repo,
    title: `Revert: ${label}`.slice(0, 200),
    head: branch,
    base: defaultBranch,
    body: [
      `Automated revert PR created from DevBrain History by **${requestedBy}**.`,
      "",
      `Restores ${restored} file change(s) to their state before \`${short}\` (\`${beforeSha.slice(0, 7)}\` → \`${short}\`).`,
      "",
      "Review like any PR — nothing merges without a teammate's approval.",
    ].join("\n"),
  });

  return {
    prNumber: pr.data.number,
    prUrl: pr.data.html_url,
    branch,
    restored,
  };
}
