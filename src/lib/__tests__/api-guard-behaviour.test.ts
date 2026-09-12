import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// apiAuth end to end, with the token resolver and the database stubbed.
//
// The structural test next door proves every route CALLS the guard. This one
// proves the guard answers correctly — which is where two bugs actually lived:
// a cold instance guessing "allow", and then the guard paying for the right
// answer and returning 401 anyway.
// ============================================================================

const rpc = vi.fn(async (_fn: string, _args: unknown) => ({ data: [] as string[] }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  }),
}));

const resolveDevToken = vi.fn(async (_h: string | null) => null as null | Record<string, string>);
vi.mock("@/lib/token", () => ({ resolveDevToken: (h: string | null) => resolveDevToken(h) }));

const { apiAuth } = await import("@/lib/api-guard");
const { _resetLimiterState } = await import("@/lib/ratelimit");

const req = (ip: string, token = "dbk_whatever") =>
  new Request("https://example.test/api/v1/health", { headers: { authorization: `Bearer ${token}`, "x-forwarded-for": ip } });

const GOOD = { org_id: "org-1", user_id: "u-1", label: "Nova", token_id: "tok-1", parent_token_id: null };

describe("apiAuth", () => {
  beforeEach(() => {
    _resetLimiterState();
    rpc.mockClear();
    rpc.mockImplementation(async () => ({ data: [] }));
    resolveDevToken.mockImplementation(async () => null);
  });

  it("refuses an unknown token with 401", async () => {
    const r = await apiAuth(req("1.1.1.1"));
    expect("denied" in r && r.denied.status).toBe(401);
  });

  it("says 429, not 401, on the request that spends the address's last attempt", async () => {
    // The database reports the bucket exhausted. Before the fix this returned
    // 401 and a fanned-out burst got one free attempt per instance.
    rpc.mockImplementation(async () => ({ data: ["bad:2.2.2.2"] }));
    const r = await apiAuth(req("2.2.2.2"));
    expect("denied" in r && r.denied.status).toBe(429);
    expect("denied" in r && r.denied.headers.get("retry-after")).toBe("60");
  });

  it("refuses a known-over address before it costs a token lookup", async () => {
    rpc.mockImplementation(async () => ({ data: ["bad:3.3.3.3"] }));
    await apiAuth(req("3.3.3.3"));
    resolveDevToken.mockClear();
    const r = await apiAuth(req("3.3.3.3"));
    expect("denied" in r && r.denied.status).toBe(429);
    expect(resolveDevToken).not.toHaveBeenCalled();
  });

  it("lets a real token through and hands back its identity", async () => {
    resolveDevToken.mockImplementation(async () => GOOD);
    const r = await apiAuth(req("4.4.4.4"));
    expect("denied" in r).toBe(false);
    expect(r).toMatchObject({ org_id: "org-1", label: "Nova" });
  });

  it("refuses a real token whose team is over its ceiling", async () => {
    resolveDevToken.mockImplementation(async () => GOOD);
    rpc.mockImplementation(async () => ({ data: ["org:org-1"] }));
    const r = await apiAuth(req("5.5.5.5"));
    expect("denied" in r && r.denied.status).toBe(429);
    const body = "denied" in r ? await r.denied.json() : null;
    expect(body.error).toContain("your team");
  });

  it("a failed token never counts against the team's own ceiling", async () => {
    await apiAuth(req("6.6.6.6"));
    const buckets = rpc.mock.calls.flatMap((c) => (c[1] as { p_checks: { bucket: string }[] }).p_checks.map((x) => x.bucket));
    expect(buckets).toEqual(["bad:6.6.6.6"]);
  });
});
