import { describe, expect, it } from "vitest";
import { deleteOrgAs, leaveOrgAs, memberCounts, ownerCounts, revokeTokenAs, teamBilling } from "@/lib/membership";

// A recording stand-in for the admin client: every query is captured as
// {table, op, filters} so the tests assert WHAT is deleted/updated and
// with which scoping, not how supabase-js chains.
type Call = { table: string; op: string; patch?: unknown; filters: [string, string, unknown][] };
function fakeAdmin(rows: Record<string, unknown[]> = {}) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, op: "", filters: [] };
    calls.push(call);
    const chain: Record<string, unknown> = {};
    const add = (name: string) => (chain[name] = (c: string, v: unknown) => { call.filters.push([name, c, v]); return chain; });
    ["eq", "is", "in"].forEach(add);
    chain.select = (_cols: string, opts?: { count?: string; head?: boolean }) => { call.op = opts?.head ? "count" : "select"; return chain; };
    chain.delete = () => { call.op = "delete"; return chain; };
    chain.update = (patch: unknown) => { call.op = "update"; call.patch = patch; return chain; };
    // Reads honour eq/in filters so count queries see only their rows.
    chain.then = (res: (v: unknown) => void) => {
      const data = (rows[table] ?? []).filter((r) => call.filters.every(([f, c, v]) => f === "eq" ? (r as Record<string, unknown>)[c] === v : f === "in" ? (v as unknown[]).includes((r as Record<string, unknown>)[c]) : true));
      return res({ data, error: null, count: data.length });
    };
    return chain;
  };
  return { admin: { from } as never, calls };
}

describe("membership", () => {
  it("leaveOrgAs removes the membership and revokes that person's live tokens in that team", async () => {
    const { admin, calls } = fakeAdmin();
    await leaveOrgAs(admin, "u1", "o1");
    expect(calls.map((c) => [c.table, c.op])).toEqual([["org_members", "delete"], ["dev_tokens", "update"]]);
    expect(calls[0].filters).toEqual([["eq", "org_id", "o1"], ["eq", "user_id", "u1"]]);
    expect(calls[1].filters).toEqual(expect.arrayContaining([["eq", "org_id", "o1"], ["eq", "user_id", "u1"], ["is", "revoked_at", null]]));
    expect(calls[1].patch).toMatchObject({ revoked_at: expect.any(String) });
  });
  it("deleteOrgAs deletes the org row only (the database cascades)", async () => {
    const { admin, calls } = fakeAdmin();
    await deleteOrgAs(admin, "o1");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ table: "orgs", op: "delete", filters: [["eq", "id", "o1"]] });
  });
  it("revokeTokenAs is scoped to the person, and to the team only when asked", async () => {
    const a = fakeAdmin(); await revokeTokenAs(a.admin, "u1", "t1");
    expect(a.calls[0].filters).toEqual([["eq", "id", "t1"], ["eq", "user_id", "u1"]]);
    const b = fakeAdmin(); await revokeTokenAs(b.admin, "u1", "t1", "o1");
    expect(b.calls[0].filters).toEqual([["eq", "id", "t1"], ["eq", "user_id", "u1"], ["eq", "org_id", "o1"]]);
  });
  it("counts and billing come back keyed by org, zero/absent for teams with no rows", async () => {
    const { admin } = fakeAdmin({ org_members: [{ org_id: "o1", role: "owner" }, { org_id: "o1", role: "member" }, { org_id: "o2", role: "owner" }], orgs: [{ id: "o1", billing_status: "active", stripe_subscription_id: "sub_1" }, { id: "o2", billing_status: "trialing", stripe_subscription_id: null }] });
    expect(await ownerCounts(admin, ["o1", "o2", "o3"])).toEqual(new Map([["o1", 1], ["o2", 1], ["o3", 0]]));
    expect(await memberCounts(admin, ["o1", "o2", "o3"])).toEqual(new Map([["o1", 2], ["o2", 1], ["o3", 0]]));
    expect(await teamBilling(admin, ["o1", "o2"])).toEqual(new Map([["o1", { billingStatus: "active", hasSubscription: true }], ["o2", { billingStatus: "trialing", hasSubscription: false }]]));
  });
});
