import { beforeEach, describe, expect, it, vi } from "vitest";

// The account actions with every neighbour stubbed. They must scope every
// change to the signed-in person, refuse what the rules refuse, and delete
// in the right order: the teams they are alone in, then the user, then out.
const jar = { set: vi.fn(), get: vi.fn(() => ({ value: "o1" })) };
vi.mock("next/headers", () => ({ cookies: async () => jar }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
const deleteUser = vi.fn(async (_id: string) => ({ data: {}, error: null as null | { message: string } }));
const signOut = vi.fn(async () => ({ error: null }));
const currentUser = vi.fn(async () => null as null | { id: string; email: string | null });
vi.mock("@/lib/supabase/server", () => ({
  currentUser: () => currentUser(),
  supabaseAdmin: () => ({ auth: { admin: { deleteUser: (id: string) => deleteUser(id) } } }),
  supabaseServer: async () => ({ auth: { signOut } }),
}));
const currentOrg = vi.fn(async () => null as null | { userId: string; orgId: string; orgName: string; role: string; orgs: { id: string; name: string; role: string }[] });
vi.mock("@/lib/org", () => ({ currentOrg: () => currentOrg() }));
// standingsFor moved out of the action module (it's a database read, not
// something that should be its own public server action) and into
// @/lib/membership, which composes ownerCounts/memberCounts/teamBilling.
// The actions call it for real logic, so the mock reproduces that
// composition rather than stubbing it out — copied from the real
// src/lib/membership.ts standingsFor body.
type Standing = { orgId: string; name: string; role: string; ownerCount: number; memberCount: number; billingStatus: string; hasSubscription: boolean };
const m = {
  leaveOrgAs: vi.fn(async () => {}),
  deleteOrgAs: vi.fn(async () => {}),
  revokeTokenAs: vi.fn(async () => {}),
  ownerCounts: vi.fn(async (_admin: unknown, _ids: string[]) => new Map<string, number>()),
  memberCounts: vi.fn(async (_admin: unknown, _ids: string[]) => new Map<string, number>()),
  teamBilling: vi.fn(async (_admin: unknown, _ids: string[]) => new Map<string, { billingStatus: string; hasSubscription: boolean }>()),
  standingsFor: vi.fn(async (admin: unknown, orgs: { id: string; name: string; role: string }[]): Promise<Standing[]> => {
    const ids = orgs.map((o) => o.id);
    const [owners, members, billing] = await Promise.all([m.ownerCounts(admin, ids), m.memberCounts(admin, ids), m.teamBilling(admin, ids)]);
    return orgs.map((o) => ({
      orgId: o.id, name: o.name, role: o.role,
      ownerCount: owners.get(o.id) ?? 0, memberCount: members.get(o.id) ?? 0,
      billingStatus: billing.get(o.id)?.billingStatus ?? "trialing", hasSubscription: billing.get(o.id)?.hasSubscription ?? false,
    }));
  }),
};
vi.mock("@/lib/membership", () => m);

const { deleteAccount, deleteTeam, leaveTeam, revokeDevice } = await import("@/app/account/actions");
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const me = { userId: "u1", orgId: "o1", orgName: "Alpha", role: "owner", orgs: [{ id: "o1", name: "Alpha", role: "owner" }, { id: "o2", name: "Beta", role: "member" }] };

describe("account actions", () => {
  beforeEach(() => { vi.clearAllMocks(); currentUser.mockResolvedValue({ id: "u1", email: "l@x.com" }); currentOrg.mockResolvedValue(me); m.ownerCounts.mockResolvedValue(new Map([["o1", 1], ["o2", 2]])); m.memberCounts.mockResolvedValue(new Map([["o1", 1], ["o2", 5]])); m.teamBilling.mockResolvedValue(new Map([["o1", { billingStatus: "trialing", hasSubscription: false }], ["o2", { billingStatus: "active", hasSubscription: true }]])); deleteUser.mockResolvedValue({ data: {}, error: null }); });

  it("signed out: every action is a silent no-op", async () => {
    currentUser.mockResolvedValue(null);
    await leaveTeam(fd({ orgId: "o2" })); await deleteTeam(fd({ orgId: "o1", confirm: "Alpha" })); await revokeDevice(fd({ id: "t1" }));
    expect(await deleteAccount(null, fd({ confirm: "delete my account" }))).toBeNull();
    expect(m.leaveOrgAs).not.toHaveBeenCalled(); expect(m.deleteOrgAs).not.toHaveBeenCalled(); expect(m.revokeTokenAs).not.toHaveBeenCalled(); expect(deleteUser).not.toHaveBeenCalled();
  });

  it("leaveTeam leaves a team you are a member of and clears the cookie only if it was the active one", async () => {
    await leaveTeam(fd({ orgId: "o2" }));
    expect(m.leaveOrgAs).toHaveBeenCalledWith(expect.anything(), "u1", "o2");
    expect(jar.set).not.toHaveBeenCalled();
    await leaveTeam(fd({ orgId: "o1" })); // sole member → allowed, and it was the active team
    expect(jar.set.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(["devbrain_org", "devbrain_last_repo"]));
  });

  it("leaveTeam refuses the only owner of a team with other members, and a team you are not in", async () => {
    m.memberCounts.mockResolvedValue(new Map([["o1", 4], ["o2", 5]]));
    await leaveTeam(fd({ orgId: "o1" }));
    await leaveTeam(fd({ orgId: "o9" }));
    expect(m.leaveOrgAs).not.toHaveBeenCalled();
  });

  it("deleteTeam needs ownership and the exact name", async () => {
    await deleteTeam(fd({ orgId: "o2", confirm: "Beta" })); // member, not owner
    await deleteTeam(fd({ orgId: "o1", confirm: "alpha" })); // wrong case
    expect(m.deleteOrgAs).not.toHaveBeenCalled();
    await deleteTeam(fd({ orgId: "o1", confirm: "Alpha" }));
    expect(m.deleteOrgAs).toHaveBeenCalledWith(expect.anything(), "o1");
  });

  it("revokeDevice revokes across teams, scoped to the person", async () => {
    await revokeDevice(fd({ id: "t1" }));
    expect(m.revokeTokenAs).toHaveBeenCalledWith(expect.anything(), "u1", "t1");
  });

  it("deleteAccount refuses the wrong phrase without touching anything", async () => {
    expect(await deleteAccount(null, fd({ confirm: "delete" }))).toMatchObject({ ok: false });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("deleteAccount returns the blockers with nothing deleted", async () => {
    m.memberCounts.mockResolvedValue(new Map([["o1", 4], ["o2", 5]])); // sole owner of Alpha, others in it
    const r = await deleteAccount(null, fd({ confirm: "delete my account" }));
    expect(r).toMatchObject({ ok: false, blockers: [{ orgId: "o1", name: "Alpha", reason: "sole_owner_with_members" }] });
    expect(m.deleteOrgAs).not.toHaveBeenCalled(); expect(deleteUser).not.toHaveBeenCalled();
  });

  it("deleteAccount deletes the solo teams, then the user, signs out, clears cookies, and redirects", async () => {
    await expect(deleteAccount(null, fd({ confirm: "delete my account" }))).rejects.toThrow("REDIRECT:/?deleted=1");
    expect(m.deleteOrgAs).toHaveBeenCalledWith(expect.anything(), "o1");
    expect(m.leaveOrgAs).not.toHaveBeenCalled(); // membership of Beta cascades with the user row
    expect(deleteUser).toHaveBeenCalledWith("u1");
    expect(signOut).toHaveBeenCalled();
    expect(jar.set).toHaveBeenCalled();
    expect(m.deleteOrgAs.mock.invocationCallOrder[0]).toBeLessThan(deleteUser.mock.invocationCallOrder[0]);
  });

  it("deleteAccount with no team at all still deletes the user", async () => {
    currentOrg.mockResolvedValue(null);
    await expect(deleteAccount(null, fd({ confirm: "delete my account" }))).rejects.toThrow("REDIRECT:/?deleted=1");
    expect(deleteUser).toHaveBeenCalledWith("u1");
  });

  it("a failed deleteUser is reported, not thrown", async () => {
    deleteUser.mockResolvedValue({ data: {}, error: { message: "boom" } });
    expect(await deleteAccount(null, fd({ confirm: "delete my account" }))).toMatchObject({ ok: false, message: expect.stringContaining("team@getdevbrain.com") });
  });
});
