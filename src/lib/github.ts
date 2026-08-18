import { App } from "@octokit/app";
import { verify } from "@octokit/webhooks-methods";

/** Normalize the private key env var into a valid PEM. Survives every common
 *  paste accident: literal \n sequences, stripped BEGIN/END headers, and
 *  collapsed newlines. */
function normalizePrivateKey(raw: string): string {
  let key = (raw || "").replace(/\\n/g, "\n").trim();
  if (key.includes("BEGIN")) return key;
  // Headers were stripped — rebuild the PEM from bare base64 material.
  const body = key.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) || [];
  return `-----BEGIN RSA PRIVATE KEY-----\n${lines.join("\n")}\n-----END RSA PRIVATE KEY-----\n`;
}

/** GitHub App instance (server-only). Requires DEVBRAIN_GH_APP_ID and
 *  DEVBRAIN_GH_APP_PRIVATE_KEY in the environment. */
export function githubApp() {
  return new App({
    appId: process.env.DEVBRAIN_GH_APP_ID!,
    privateKey: normalizePrivateKey(process.env.DEVBRAIN_GH_APP_PRIVATE_KEY || ""),
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

/** Fetch all .brain markdown files (root + notes/) at a given ref.
 *  Names are relative to .brain/ — e.g. "index.md", "notes/store.md". */
export async function fetchBrainDocs(
  installationId: number,
  fullName: string,
  ref: string,
): Promise<{ name: string; content: string }[]> {
  const [owner, repo] = fullName.split("/");
  const octokit = await installationOctokit(installationId);

  async function listDir(path: string) {
    try {
      const res = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
        owner, repo, path, ref,
      });
      return Array.isArray(res.data) ? res.data : [];
    } catch {
      return [];
    }
  }

  const root = await listDir(".brain");
  const entries: string[] = [];
  for (const f of root) {
    if (f.type === "file" && f.name.endsWith(".md")) entries.push(f.name);
    if (f.type === "dir" && f.name === "notes") {
      const sub = await listDir(".brain/notes");
      for (const s of sub) {
        if (s.type === "file" && s.name.endsWith(".md")) entries.push(`notes/${s.name}`);
      }
    }
  }
  entries.sort();

  const docs: { name: string; content: string }[] = [];
  for (const name of entries) {
    const res = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner, repo, path: `.brain/${name}`, ref,
    });
    const data = res.data as { content?: string; encoding?: string };
    const content = data.content
      ? Buffer.from(data.content, (data.encoding as BufferEncoding) || "base64").toString("utf8")
      : "";
    docs.push({ name, content });
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
