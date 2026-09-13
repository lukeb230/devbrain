"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { presetRows, type Preset } from "@/lib/onboarding-presets";
import { currentOrg, requireRoleOrRedirect } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase/server";
import { returnTo } from "@/lib/surface";

// Rules change what every teammate's Claude does — admins and owners only,
// same guard as toggleRule (src/app/dashboard/[repoId]/rules/actions.ts).
// Applies to EVERY repo in the installation: a preset on one repo would
// leave the others in the journals-off / solo_green-off trap.
export async function applyPreset(formData: FormData): Promise<void> {
  const installationId = Number(formData.get("installationId") || 0);
  const raw = String(formData.get("preset") || "");
  const preset: Preset | null = raw === "solo" || raw === "team" ? raw : null;
  const back = returnTo(formData, "/desk");
  if (!installationId || !preset) redirect(back);
  const me = await requireRoleOrRedirect("admin", back);
  const admin = supabaseAdmin();

  const { data: repos } = await admin
    .from("linked_repos")
    .select("id")
    .eq("org_id", me.orgId)
    .eq("installation_id", installationId)
    .is("unlinked_at", null);
  const now = new Date().toISOString();
  for (const r of repos ?? []) {
    // Brain detection: docs already indexed for this repo. Unknown → off.
    const { count } = await admin.from("memory_index").select("repo_id", { count: "exact", head: true }).eq("repo_id", r.id).eq("kind", "brain");
    const rows = presetRows(preset, { hasBrainDocs: (count ?? 0) > 0 });
    await admin.from("policies").upsert(
      rows.map((x) => ({ org_id: me.orgId, repo_id: r.id, rule: x.rule, enabled: x.enabled, updated_at: now })),
      { onConflict: "repo_id,rule" },
    );
    await admin.from("events").insert({ org_id: me.orgId, repo_id: r.id, kind: "rule_change", payload: { preset, by: me.login } });
  }
  await mergeOnboarding(me.orgId, me.userId, { preset });
  revalidatePath("/desk");
  redirect(back);
}

// Any role may dismiss: the wall only ever shows to the owner, but the nudge
// shows to everyone, and "not now" must always be available.
export async function dismissOnboarding(): Promise<void> {
  const me = await currentOrg();
  if (!me) redirect("/welcome");
  await mergeOnboarding(me.orgId, me.userId, { dismissed_at: new Date().toISOString() });
  revalidatePath("/desk");
  redirect("/desk");
}

// "Start over" on a pending request: GitHub never tells us about a denial.
export async function cancelRequest(formData: FormData): Promise<void> {
  const back = returnTo(formData, "/desk");
  const me = await requireRoleOrRedirect("admin", back);
  await supabaseAdmin().from("events").insert({ org_id: me.orgId, repo_id: null, kind: "repo_link_cancelled", payload: { by: me.login } });
  revalidatePath("/desk");
  redirect(back);
}

// Read-modify-write on the jsonb column; the row is keyed (org_id, user_id).
async function mergeOnboarding(orgId: string, userId: string, patch: Record<string, unknown>): Promise<void> {
  const admin = supabaseAdmin();
  const { data } = await admin.from("org_members").select("onboarding").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
  const current = (data?.onboarding as Record<string, unknown> | null) ?? {};
  await admin.from("org_members").update({ onboarding: { ...current, ...patch } }).eq("org_id", orgId).eq("user_id", userId);
}
