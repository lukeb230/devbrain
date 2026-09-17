import { beforeEach, describe, expect, it, vi } from "vitest";
const setUser = vi.fn(); const setTag = vi.fn();
vi.mock("@sentry/nextjs", () => ({ setUser: (u: unknown) => setUser(u), setTag: (k: string, v: unknown) => setTag(k, v) }));
const { withSentryUser } = await import("@/lib/sentry-scope");

describe("withSentryUser (server)", () => {
  beforeEach(() => vi.clearAllMocks());
  it("sets id-only identity and the three tags from the request", () => {
    withSentryUser({ userId: "u1", orgId: "o1", path: "/desk/help", userAgent: "Mozilla/5.0 DevBrainApp/1" });
    expect(setUser).toHaveBeenCalledWith({ id: "u1" });
    expect(setTag.mock.calls).toEqual(expect.arrayContaining([["team", "o1"], ["surface", "desk"], ["host", "app"]]));
  });
  it("a signed-out request clears the user and tags browser", () => {
    withSentryUser({ userId: null, orgId: null, path: "/support", userAgent: "Mozilla/5.0" });
    expect(setUser).toHaveBeenCalledWith(null);
    expect(setTag.mock.calls).toEqual(expect.arrayContaining([["surface", "site"], ["host", "browser"]]));
    expect(setTag.mock.calls.find((c) => c[0] === "team")).toBeUndefined();
  });
  it("never throws if the SDK does", () => {
    setUser.mockImplementationOnce(() => { throw new Error("no sdk"); });
    expect(() => withSentryUser({ userId: "u1", orgId: "o1", path: "/", userAgent: null })).not.toThrow();
  });
});
