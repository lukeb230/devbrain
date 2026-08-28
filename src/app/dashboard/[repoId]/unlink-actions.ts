"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRoleOrRedirect, withError } from "@/lib/org";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

// Unlink a repository from DevBrain.
//   unlinkRepo — soft: history stays, the repo leaves every list and the
//                agent API refuses it; reinstalling the GitHub App relinks.
//   deleteRepo — hard: the row and everything under it (tasks, journals,
//                PR records, brain index…) are deleted. Confirmed by typing
//                the repo's full name.
// Both require a membership-scoped read of the repo before the service-role
// write, and note that GitHub-side access is separate (deep link provided).

async function ownedRepo(repoId: string) {
  if (!/^[0-9a-f-]{36}$/.test(repoId)) return null;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: repo } = await supabase.from("linked_repos").select("id, org_id, full_name").eq("id", repoId).single();
  if (!repo) return null;
  // Admins and owners of the repo's org only — refused calls bounce back
  // to the Rules page with ?error=.
  const returnTo = `/dashboard/${repoId}/rules`;
  const me = await requireRoleOrRedirect("admin", returnTo);
  if (me.orgId !== repo.org_id) redirect(withError(returnTo, "admin_only"));
  return { repo, login: me.login };
}

export async function unlinkRepo(formData: FormData): Promise<void> {
  const ctx = await ownedRepo(String(formData.get("repoId") || ""));
  if (!ctx) return;
  const admin = supabaseAdmin();
  await admin.from("linked_repos").update({ unlinked_at: new Date().toISOString() }).eq("id", ctx.repo.id);
  await admin.from("events").insert({ org_id: ctx.repo.org_id, repo_id: ctx.repo.id, kind: "repo_unlinked", payload: { by: ctx.login, mode: "keep" } });
  revalidatePath("/dashboard");
  revalidatePath("/widget");
  redirect("/dashboard?unlinked=" + encodeURIComponent(ctx.repo.full_name));
}

export async function deleteRepo(formData: FormData): Promise<void> {
  const ctx = await ownedRepo(String(formData.get("repoId") || ""));
  if (!ctx) return;
  const typed = String(formData.get("confirm") || "").trim();
  if (typed.toLowerCase() !== ctx.repo.full_name.toLowerCase()) return; // name must be typed exactly
  const admin = supabaseAdmin();
  await admin.from("events").insert({ org_id: ctx.repo.org_id, repo_id: null, kind: "repo_deleted", payload: { by: ctx.login, repo: ctx.repo.full_name } });
  await admin.from("linked_repos").delete().eq("id", ctx.repo.id); // cascades
  revalidatePath("/dashboard");
  revalidatePath("/widget");
  redirect("/dashboard?deleted=" + encodeURIComponent(ctx.repo.full_name));
}
