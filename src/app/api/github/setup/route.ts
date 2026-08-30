import { NextResponse } from "next/server";
import { currentOrg, hasRole, withError } from "@/lib/org";
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
  const ctx = await currentOrg();
  if (!ctx) return NextResponse.redirect(`${origin}/welcome`);
  // Linking repos into the org is an admin action — refuse before any write.
  if (!hasRole(ctx.role, "admin")) return NextResponse.redirect(`${origin}${withError("/dashboard", "link_repo_admin")}`);
  const membership = { org_id: ctx.orgId };

  // An installation belongs to exactly one org. If this one already belongs to
  // a DIFFERENT org, refuse — otherwise any admin who learned an installation
  // id could re-point another team's installation (and its repos) at their own
  // org. Re-claiming your own org's installation (repair/reinstall) is fine.
  const { data: existingInst } = await admin
    .from("installations")
    .select("org_id")
    .eq("id", installationId)
    .maybeSingle();
  if (existingInst?.org_id && existingInst.org_id !== membership.org_id) {
    await admin.from("events").insert({
      org_id: existingInst.org_id, repo_id: null, kind: "error",
      payload: { where: "setup:claim_conflict", by_org: membership.org_id, installation_id: installationId },
    });
    return NextResponse.redirect(`${origin}${withError("/dashboard", "install_owned")}`);
  }

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
      // Never move a repo across orgs on a conflict: a repo already linked to a
      // different org stays there (the installation guard above should prevent
      // reaching here, but this is the row-level backstop).
      const { data: owned } = await admin
        .from("linked_repos")
        .select("org_id")
        .eq("github_repo_id", r.id)
        .maybeSingle();
      if (owned?.org_id && owned.org_id !== membership.org_id) continue;
      await admin.from("linked_repos").upsert(
        {
          org_id: membership.org_id,
          installation_id: installationId,
          github_repo_id: r.id,
          full_name: r.full_name,
          unlinked_at: null, // reinstalling relinks a soft-unlinked repo
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
