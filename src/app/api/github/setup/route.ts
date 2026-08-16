import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { installationOctokit } from "@/lib/github";

// GitHub redirects here after the user installs the app
// (Setup URL: https://<host>/api/github/setup). We claim the installation
// for the signed-in user's org and sync the repo list.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const installationId = Number(searchParams.get("installation_id"));
  if (!installationId) return NextResponse.redirect(`${origin}/dashboard`);

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/`);

  const admin = supabaseAdmin();
  const { data: membership } = await admin
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (!membership) return NextResponse.redirect(`${origin}/dashboard`);

  // Claim (or create) the installation row for this org.
  await admin.from("installations").upsert({
    id: installationId,
    org_id: membership.org_id,
    account_login: "pending",
  });

  // Sync repos + default branches from the GitHub API (webhook may have
  // arrived before the org was known, so do it authoritatively here).
  try {
    const octokit = await installationOctokit(installationId);
    const { data } = await octokit.request(
      "GET /installation/repositories",
      { per_page: 100 },
    );
    await admin
      .from("installations")
      .update({
        account_login: data.repositories[0]?.owner?.login ?? "unknown",
      })
      .eq("id", installationId);

    for (const r of data.repositories) {
      await admin.from("linked_repos").upsert(
        {
          org_id: membership.org_id,
          installation_id: installationId,
          github_repo_id: r.id,
          full_name: r.full_name,
          default_branch: r.default_branch ?? "main",
        },
        { onConflict: "github_repo_id" },
      );
    }
  } catch (err) {
    console.error("setup sync failed:", err);
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
