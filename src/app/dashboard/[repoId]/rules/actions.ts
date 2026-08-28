"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRoleOrRedirect, withError } from "@/lib/org";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

// Rules change what every teammate's Claude does — admins and owners only.
// A refused call bounces back with ?error= (stay=1 → the widget panel).
export async function toggleRule(formData: FormData): Promise<void> {
  const repoId = String(formData.get("repoId") || "");
  const rule = String(formData.get("rule") || "");
  const enabled = String(formData.get("enabled")) === "true";
  if (!repoId || !rule) return;
  const returnTo = formData.get("stay") ? "/widget" : `/dashboard/${repoId}/rules`;
  const me = await requireRoleOrRedirect("admin", returnTo);

  const supabase = await supabaseServer();
  const admin = supabaseAdmin();
  // Membership via RLS-scoped read, then the repo must be in the ACTIVE org.
  const { data: repo } = await supabase
    .from("linked_repos")
    .select("id, org_id")
    .eq("id", repoId)
    .single();
  if (!repo) return;
  if (repo.org_id !== me.orgId) redirect(withError(returnTo, "admin_only"));

  await admin.from("policies").upsert(
    {
      org_id: repo.org_id,
      repo_id: repo.id,
      rule,
      enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "repo_id,rule" },
  );
  await admin.from("events").insert({
    org_id: repo.org_id,
    repo_id: repo.id,
    kind: "rule_change",
    payload: { rule, enabled, by: me.login },
  });
  revalidatePath(`/dashboard/${repoId}/rules`);
  revalidatePath("/widget"); // rules are also toggleable from the widget Settings view
}
