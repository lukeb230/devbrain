import type { Role } from "@/lib/org";

// ============================================================================
// The account page's rules, with no I/O: who may leave a team, which teams
// go with an account when it is deleted, and what stops a deletion. The
// page and its actions call in; the tests pin the words people see.
// ============================================================================

export const DELETE_PHRASE = "delete my account";

export type TeamStanding = {
  orgId: string;
  name: string;
  role: Role;
  ownerCount: number;
  memberCount: number;
  billingStatus: string;   // orgs.billing_status
  hasSubscription: boolean; // orgs.stripe_subscription_id is set
};

export type Blocker = { orgId: string; name: string; reason: "sole_owner_with_members" | "paid_subscription" };
export type DeletionPlan = { ok: true; deleteOrgIds: string[] } | { ok: false; blockers: Blocker[] };

/** The Console's rule: the only owner cannot walk out on a team that still
 *  has other people in it. Alone in the team, leaving is allowed — it
 *  empties the team, and the UI turns that into "delete team". */
export function canLeave(t: TeamStanding): boolean {
  if (t.role !== "owner") return true;
  if (t.memberCount <= 1) return true;
  return t.ownerCount > 1;
}

export function leaveEmptiesTeam(t: TeamStanding): boolean {
  return t.memberCount <= 1;
}

const PAID = new Set(["active", "past_due"]);

/** Which teams are deleted with the account, or why it cannot happen yet.
 *  Every blocker is reported so the person fixes them in one pass. */
export function deletionPlan(teams: TeamStanding[]): DeletionPlan {
  const blockers: Blocker[] = [];
  const deleteOrgIds: string[] = [];
  for (const t of teams) {
    if (t.memberCount <= 1) {
      if (t.hasSubscription && PAID.has(t.billingStatus)) blockers.push({ orgId: t.orgId, name: t.name, reason: "paid_subscription" });
      else deleteOrgIds.push(t.orgId);
      continue;
    }
    if (t.role === "owner" && t.ownerCount <= 1) blockers.push({ orgId: t.orgId, name: t.name, reason: "sole_owner_with_members" });
  }
  return blockers.length > 0 ? { ok: false, blockers } : { ok: true, deleteOrgIds };
}

export function blockerCopy(b: Blocker): string {
  return b.reason === "sole_owner_with_members"
    ? `You're the only owner of ${b.name} and it has other members — make someone else an owner in the Console, or delete the team.`
    : `${b.name} has a paid plan — cancel it on the plan page first.`;
}
