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
