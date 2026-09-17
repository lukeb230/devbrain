"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canLeave, DELETE_PHRASE, deletionPlan, type Blocker } from "@/lib/account";
import { clearDevbrainCookies, COOKIE } from "@/lib/cookies";
import { LEGAL } from "@/lib/legal";
import { deleteOrgAs, leaveOrgAs, revokeTokenAs, standingsFor } from "@/lib/membership";
import { currentOrg } from "@/lib/org";
import { currentUser, supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

// ============================================================================
// The website's account page — leave or delete a team, revoke a device,
// delete the account. Every action is scoped to the signed-in person and
// silently does nothing without a session. The rules live in
// src/lib/account.ts; the database changes (standingsFor included, so it
// is not a public server action of its own) in src/lib/membership.ts.
// ============================================================================

export type AccountDeleteState = { ok: false; message: string; blockers?: Blocker[] } | null;

const DELETE_FAILED = `Something went wrong deleting your account. Email ${LEGAL.contact} and we'll finish it by hand.`;

async function forgetTeamCookiesIfActive(orgId: string) {
  const jar = await cookies();
  if (jar.get(COOKIE.org)?.value === orgId) clearDevbrainCookies(jar, [{ name: COOKIE.org, path: "/" }, { name: COOKIE.lastRepo, path: "/" }]);
}

export async function leaveTeam(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const ctx = await currentOrg();
  const orgId = String(formData.get("orgId") || "");
  const team = ctx?.orgs.find((o) => o.id === orgId);
  if (!ctx || !team) return;
  const admin = supabaseAdmin();
  const [standing] = await standingsFor(admin, [team]);
  if (!canLeave(standing)) return;
  await leaveOrgAs(admin, user.id, orgId);
  await forgetTeamCookiesIfActive(orgId);
  revalidatePath("/account");
}

export async function deleteTeam(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const ctx = await currentOrg();
  const orgId = String(formData.get("orgId") || "");
  const team = ctx?.orgs.find((o) => o.id === orgId);
  if (!ctx || !team || team.role !== "owner") return;
  if (String(formData.get("confirm") || "").trim() !== team.name) return;
  await deleteOrgAs(supabaseAdmin(), orgId);
  await forgetTeamCookiesIfActive(orgId);
  revalidatePath("/account");
}

export async function revokeDevice(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const id = String(formData.get("id") || "");
  if (!id) return;
  await revokeTokenAs(supabaseAdmin(), user.id, id);
  revalidatePath("/account");
}

export async function deleteAccount(_prev: AccountDeleteState, formData: FormData): Promise<AccountDeleteState> {
  const user = await currentUser();
  if (!user) return null;
  if (String(formData.get("confirm") || "").trim().toLowerCase() !== DELETE_PHRASE) {
    return { ok: false, message: `Type "${DELETE_PHRASE}" to confirm.` };
  }
  const admin = supabaseAdmin();
  const ctx = await currentOrg();
  const plan = deletionPlan(ctx ? await standingsFor(admin, ctx.orgs) : []);
  if (!plan.ok) return { ok: false, message: "A team is in the way.", blockers: plan.blockers };

  // Teams this person is alone in go first; every other membership, token,
  // session, claim and device login cascades from the user row.
  for (const orgId of plan.deleteOrgIds) await deleteOrgAs(admin, orgId);
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { ok: false, message: DELETE_FAILED };

  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  clearDevbrainCookies(await cookies());
  redirect("/?deleted=1");
}
