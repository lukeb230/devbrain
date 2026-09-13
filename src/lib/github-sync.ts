import { installationOctokit } from "@/lib/github";
import type { supabaseAdmin } from "@/lib/supabase/server";

type Admin = ReturnType<typeof supabaseAdmin>;

// Sync repos + default branches from the GitHub API for an installation that
// belongs to `orgId`. This is the ONLY code that writes `default_branch` and
// resets `unlinked_at: null` — used both right after the setup redirect
// claims an installation, and right after the webhook claims one for an
// approved request (which otherwise only gets upsertRepo's bare insert).
export async function syncInstallationRepos(admin: Admin, installationId: number, orgId: string): Promise<void> {
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
      if (owned?.org_id && owned.org_id !== orgId) continue;
      await admin.from("linked_repos").upsert(
        {
          org_id: orgId,
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
}
