import { beforeEach, describe, expect, it, vi } from "vitest";

// pickOrg with next/headers and the org context stubbed: it must set the team
// cookie for a member, refuse a non-member without touching cookies, and say
// "signed_out" when there is no session — never a silent void.
const jar = { set: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => jar }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
const currentOrg = vi.fn(async () => null as null | { orgs: { id: string }[] });
vi.mock("@/lib/org", () => ({ currentOrg: () => currentOrg(), requireRoleOrRedirect: async () => null }));

const { pickOrg, switchOrg } = await import("@/app/settings/org/actions");

describe("pickOrg", () => {
  beforeEach(() => { jar.set.mockClear(); currentOrg.mockResolvedValue(null); });

  it("sets the team cookie and forgets the last repo for a member", async () => {
    currentOrg.mockResolvedValue({ orgs: [{ id: "org-1" }, { id: "org-2" }] });
    expect(await pickOrg("org-2")).toEqual({ ok: true });
    const names = jar.set.mock.calls.map((c) => [c[0], c[1]]);
    expect(names).toContainEqual(["devbrain_org", "org-2"]);
    expect(names).toContainEqual(["devbrain_last_repo", ""]);
  });

  it("refuses a team the person is not in, without touching cookies", async () => {
    currentOrg.mockResolvedValue({ orgs: [{ id: "org-1" }] });
    expect(await pickOrg("org-9")).toEqual({ ok: false, reason: "not_member" });
    expect(jar.set).not.toHaveBeenCalled();
  });

  it("says signed_out when there is no session", async () => {
    expect(await pickOrg("org-1")).toEqual({ ok: false, reason: "signed_out" });
    expect(jar.set).not.toHaveBeenCalled();
  });
});

describe("switchOrg", () => {
  it("is pickOrg plus the redirect", async () => {
    currentOrg.mockResolvedValue({ orgs: [{ id: "org-1" }] });
    const fd = new FormData();
    fd.set("orgId", "org-1");
    fd.set("next", "/desk");
    await expect(switchOrg(fd)).rejects.toThrow("REDIRECT:/desk");
  });
});
