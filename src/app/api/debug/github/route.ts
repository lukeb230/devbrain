import { NextResponse } from "next/server";
import { requireRole } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchBrainDocs, installationOctokit } from "@/lib/github";

// Admin-only diagnostic: exercises the GitHub App credential path and
// reports the exact failure instead of failing silently. Safe to leave in —
// it reveals error messages, never secrets.
export async function GET() {
  // Admins of the active org only, and only that org's repos.
  const ctx = await requireRole("admin");
  if (!ctx) return NextResponse.json({ error: "admins only" }, { status: 403 });

  const admin = supabaseAdmin();
  const { data: repo } = await admin
    .from("linked_repos")
    .select("installation_id, full_name, default_branch")
    .eq("org_id", ctx.orgId)
    .is("unlinked_at", null)
    .limit(1)
    .single();
  if (!repo) return NextResponse.json({ error: "no linked repos" });

  const report: Record<string, string> = {
    app_id_present: String(Boolean(process.env.DEVBRAIN_GH_APP_ID)),
    key_present: String(Boolean(process.env.DEVBRAIN_GH_APP_PRIVATE_KEY)),
    key_looks_like_pem: String(/-----BEGIN/.test(process.env.DEVBRAIN_GH_APP_PRIVATE_KEY || "")),
    installation_id: String(repo.installation_id),
    repo: repo.full_name,
  };

  try {
    const octokit = await installationOctokit(repo.installation_id);
    const me = await octokit.request("GET /repos/{owner}/{repo}", {
      owner: repo.full_name.split("/")[0],
      repo: repo.full_name.split("/")[1],
    });
    report.token_mint = "OK";
    report.repo_read = `OK (${me.data.full_name})`;
  } catch (err) {
    report.token_mint_or_read = "FAILED: " + String((err as Error)?.message || err);
    return NextResponse.json(report);
  }

  try {
    const docs = await fetchBrainDocs(repo.installation_id, repo.full_name, repo.default_branch);
    report.brain_fetch = `OK (${docs.length} docs)`;
  } catch (err) {
    report.brain_fetch = "FAILED: " + String((err as Error)?.message || err);
  }
  return NextResponse.json(report);
}
