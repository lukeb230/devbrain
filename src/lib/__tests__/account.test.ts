// src/lib/__tests__/account.test.ts
import { describe, expect, it } from "vitest";
import { blockerCopy, canLeave, DELETE_PHRASE, deletionPlan, leaveEmptiesTeam, type TeamStanding } from "@/lib/account";

const t = (o: Partial<TeamStanding>): TeamStanding => ({ orgId: "o", name: "Team", role: "member", ownerCount: 1, memberCount: 3, billingStatus: "trialing", hasSubscription: false, ...o });

describe("canLeave", () => {
  it("a member or admin can always leave", () => {
    expect(canLeave(t({ role: "member" }))).toBe(true);
    expect(canLeave(t({ role: "admin" }))).toBe(true);
  });
  it("the only owner cannot leave while others remain", () => {
    expect(canLeave(t({ role: "owner", ownerCount: 1, memberCount: 3 }))).toBe(false);
    expect(canLeave(t({ role: "owner", ownerCount: 2, memberCount: 3 }))).toBe(true);
  });
  it("the last member can leave (it empties the team)", () => {
    expect(canLeave(t({ role: "owner", ownerCount: 1, memberCount: 1 }))).toBe(true);
    expect(leaveEmptiesTeam(t({ memberCount: 1 }))).toBe(true);
    expect(leaveEmptiesTeam(t({ memberCount: 2 }))).toBe(false);
  });
});

describe("deletionPlan", () => {
  it("deletes the teams the person is alone in and leaves the rest", () => {
    const p = deletionPlan([t({ orgId: "solo", memberCount: 1, role: "owner" }), t({ orgId: "shared", role: "member" }), t({ orgId: "co", role: "owner", ownerCount: 2 })]);
    expect(p).toEqual({ ok: true, deleteOrgIds: ["solo"] });
  });
  it("is blocked by a team the person solely owns with others in it", () => {
    const p = deletionPlan([t({ orgId: "x", name: "Northwind", role: "owner", ownerCount: 1, memberCount: 4 })]);
    expect(p).toEqual({ ok: false, blockers: [{ orgId: "x", name: "Northwind", reason: "sole_owner_with_members" }] });
  });
  it("is blocked by a paid subscription on a team it would delete", () => {
    const paid = t({ orgId: "p", name: "Paid", role: "owner", memberCount: 1, hasSubscription: true, billingStatus: "active" });
    expect(deletionPlan([paid])).toEqual({ ok: false, blockers: [{ orgId: "p", name: "Paid", reason: "paid_subscription" }] });
    expect(deletionPlan([{ ...paid, billingStatus: "canceled" }])).toEqual({ ok: true, deleteOrgIds: ["p"] });
    expect(deletionPlan([{ ...paid, billingStatus: "comped", hasSubscription: false }])).toEqual({ ok: true, deleteOrgIds: ["p"] });
  });
  it("reports every blocker, not just the first", () => {
    const p = deletionPlan([t({ orgId: "a", name: "A", role: "owner", memberCount: 2 }), t({ orgId: "b", name: "B", role: "owner", memberCount: 1, hasSubscription: true, billingStatus: "past_due" })]);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.blockers.map((b) => b.reason)).toEqual(["sole_owner_with_members", "paid_subscription"]);
  });
  it("no teams is a plan with nothing to delete", () => {
    expect(deletionPlan([])).toEqual({ ok: true, deleteOrgIds: [] });
  });
});

describe("copy", () => {
  it("the phrase and the blocker sentences are exact", () => {
    expect(DELETE_PHRASE).toBe("delete my account");
    expect(blockerCopy({ orgId: "x", name: "Northwind", reason: "sole_owner_with_members" })).toBe("You're the only owner of Northwind and it has other members — make someone else an owner in the Console, or delete the team.");
    expect(blockerCopy({ orgId: "x", name: "Northwind", reason: "paid_subscription" })).toBe("Northwind has a paid plan — cancel it on the plan page first.");
  });
});
