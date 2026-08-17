import { App } from "@octokit/app";
import { verify } from "@octokit/webhooks-methods";

/** GitHub App instance (server-only). Requires DEVBRAIN_GH_APP_ID and
 *  DEVBRAIN_GH_APP_PRIVATE_KEY (PEM, newlines as \n) in the environment. */
export function githubApp() {
  return new App({
    appId: process.env.DEVBRAIN_GH_APP_ID!,
    privateKey: (process.env.DEVBRAIN_GH_APP_PRIVATE_KEY || "").replace(
      /\\n/g,
      "\n",
    ),
  });
}

/** Octokit client scoped to one installation (mint token on demand). */
export async function installationOctokit(installationId: number) {
  return githubApp().getInstallationOctokit(installationId);
}

/** Verify X-Hub-Signature-256 on a raw webhook body. */
export async function verifyWebhook(
  rawBody: string,
  signature: string | null,
): Promise<boolean> {
  if (!signature) return false;
  try {
    return await verify(
      process.env.DEVBRAIN_GH_WEBHOOK_SECRET!,
      rawBody,
      signature,
    );
  } catch {
    return false;
  }
}

/** Changed files for a PR, via the PR files API (needs only pull_requests:read). */
export async function prChangedFiles(
  installationId: number,
  fullName: string,
  prNumber: number,
): Promise<string[]> {
  const [owner, repo] = fullName.split("/");
  const octokit = await installationOctokit(installationId);
  const res = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
    { owner, repo, pull_number: prNumber, per_page: 100 },
  );
  return (res.data || []).map((f: { filename: string }) => f.filename);
}

/** Fetch all .brain/*.md docs from a repo at a given ref (branch). */
export async function fetchBrainDocs(
  installationId: number,
  fullName: string,
  ref: string,
): Promise<{ name: string; content: string }[]> {
  const [owner, repo] = fullName.split("/");
  const octokit = await installationOctokit(installationId);
  let listing;
  try {
    listing = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner, repo, path: ".brain", ref,
    });
  } catch {
    return []; // no .brain folder on this ref
  }
  const files = (Array.isArray(listing.data) ? listing.data : [])
    .filter((f: { type: string; name: string }) => f.type === "file" && f.name.endsWith(".md"))
    .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
  const docs: { name: string; content: string }[] = [];
  for (const f of files) {
    const res = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner, repo, path: `.brain/${f.name}`, ref,
    });
    const data = res.data as { content?: string; encoding?: string };
    const content = data.content
      ? Buffer.from(data.content, (data.encoding as BufferEncoding) || "base64").toString("utf8")
      : "";
    docs.push({ name: f.name, content });
  }
  return docs;
}

/** PR mergeability vs its base. GitHub computes this lazily: the first GET may
 *  return null, so we retry once. Returns "clean" | "dirty" (conflicts) |
 *  "unknown" | other GitHub states (blocked, behind, unstable...). */
export async function prMergeableState(
  installationId: number,
  fullName: string,
  prNumber: number,
): Promise<string> {
  const [owner, repo] = fullName.split("/");
  const octokit = await installationOctokit(installationId);
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await octokit.request(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}",
      { owner, repo, pull_number: prNumber },
    );
    if (res.data.mergeable !== null) {
      return res.data.mergeable_state || (res.data.mergeable ? "clean" : "dirty");
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return "unknown";
}

/** Changed files for a branch vs base, via the compare API (capped at 300). */
export async function changedFiles(
  installationId: number,
  fullName: string,
  base: string,
  head: string,
): Promise<string[]> {
  const [owner, repo] = fullName.split("/");
  const octokit = await installationOctokit(installationId);
  const res = await octokit.request(
    "GET /repos/{owner}/{repo}/compare/{basehead}",
    { owner, repo, basehead: `${base}...${head}`, per_page: 300 },
  );
  return (res.data.files || []).map((f: { filename: string }) => f.filename);
}
