import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// Membership and device-token changes, shared by the Console's actions and
// the website's account page so both do exactly the same thing. No cookies,
// no redirects — callers own those. `admin` is the service-role client.
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

/** Take one person out of one team and stop their machines talking to it. */
export async function leaveOrgAs(admin: Admin, userId: string, orgId: string): Promise<void> {
  await admin.from("org_members").delete().eq("org_id", orgId).eq("user_id", userId);
  await admin.from("dev_tokens").update({ revoked_at: new Date().toISOString() }).eq("org_id", orgId).eq("user_id", userId).is("revoked_at", null);
}

/** Delete a team. Every row that belongs to it cascades in the database. */
export async function deleteOrgAs(admin: Admin, orgId: string): Promise<void> {
  await admin.from("orgs").delete().eq("id", orgId);
}

/** Revoke one of this person's tokens; `orgId` narrows it to one team (the
 *  Console's tokens page); without it, any of their teams (the account page). */
export async function revokeTokenAs(admin: Admin, userId: string, tokenId: string, orgId?: string): Promise<void> {
  let q = admin.from("dev_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", tokenId).eq("user_id", userId);
  if (orgId) q = q.eq("org_id", orgId);
  await q;
}

async function countBy(admin: Admin, orgIds: string[], onlyOwners: boolean): Promise<Map<string, number>> {
  const out = new Map(orgIds.map((id) => [id, 0]));
  if (orgIds.length === 0) return out;
  let q = admin.from("org_members").select("org_id, role").in("org_id", orgIds);
  if (onlyOwners) q = q.eq("role", "owner");
  const { data } = await q;
  for (const r of (data ?? []) as { org_id: string }[]) out.set(r.org_id, (out.get(r.org_id) ?? 0) + 1);
  return out;
}
export const ownerCounts = (admin: Admin, orgIds: string[]) => countBy(admin, orgIds, true);
export const memberCounts = (admin: Admin, orgIds: string[]) => countBy(admin, orgIds, false);

export async function teamBilling(admin: Admin, orgIds: string[]): Promise<Map<string, { billingStatus: string; hasSubscription: boolean }>> {
  const out = new Map<string, { billingStatus: string; hasSubscription: boolean }>();
  if (orgIds.length === 0) return out;
  const { data } = await admin.from("orgs").select("id, billing_status, stripe_subscription_id").in("id", orgIds);
  for (const r of (data ?? []) as { id: string; billing_status: string; stripe_subscription_id: string | null }[]) out.set(r.id, { billingStatus: r.billing_status, hasSubscription: Boolean(r.stripe_subscription_id) });
  return out;
}
