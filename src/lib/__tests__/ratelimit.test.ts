import { beforeEach, describe, expect, it, vi } from "vitest";

// The durable layer talks to Postgres through supabaseAdmin(); here it is a
// spy, so the tests assert what gets COUNTED and when, not the database.
const rpc = vi.fn(async (_fn: string, _args: { p_checks: { bucket: string; limit: number; window: number; cost: number }[] }) => ({ data: [] as string[] }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  }),
}));

const { makeLimiter, durableTake, _resetLimiterState, DEFAULT_LIMITS, limits } = await import("@/lib/ratelimit");

describe("makeLimiter", () => {
  it("allows up to the limit in a window, then refuses", () => {
    let t = 0;
    const l = makeLimiter(3, 1000, () => t);
    expect([l.take("a"), l.take("a"), l.take("a"), l.take("a")]).toEqual([true, true, true, false]);
  });

  it("keys are independent", () => {
    const l = makeLimiter(1, 1000, () => 0);
    expect(l.take("a")).toBe(true);
    expect(l.take("b")).toBe(true);
    expect(l.take("a")).toBe(false);
  });

  it("a new window resets the count", () => {
    let t = 0;
    const l = makeLimiter(1, 1000, () => t);
    expect(l.take("a")).toBe(true);
    expect(l.take("a")).toBe(false);
    t = 1000;
    expect(l.take("a")).toBe(true);
  });
});

describe("durableTake", () => {
  beforeEach(() => {
    _resetLimiterState();
    rpc.mockClear();
    rpc.mockImplementation(async () => ({ data: [] }));
  });

  it("allows the request and never awaits the database", () => {
    expect(durableTake([{ bucket: "tok:a", limit: 5, window: 60 }])).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("batches: a burst costs one round trip, carrying the whole count", () => {
    for (let i = 0; i < 50; i++) durableTake([{ bucket: "tok:a", limit: 1000, window: 60 }]);
    expect(rpc).toHaveBeenCalledTimes(1); // the rest is pending until the next flush
    const checks = rpc.mock.calls[0]![1].p_checks;
    expect(checks[0]).toMatchObject({ bucket: "tok:a", limit: 1000, cost: 1 });
  });

  it("refuses once this instance alone has served the whole limit", () => {
    const check = { bucket: "tok:b", limit: 3, window: 60 };
    expect([1, 2, 3].map(() => durableTake([check]))).toEqual([null, null, null]);
    expect(durableTake([check])).toBe("tok:b");
  });

  it("refuses when the database says the bucket is over, and then stays local", async () => {
    rpc.mockImplementation(async () => ({ data: ["org:x"] }));
    expect(durableTake([{ bucket: "org:x", limit: 1000, window: 60 }])).toBeNull(); // the first one is already served
    await new Promise((r) => setTimeout(r, 0));
    rpc.mockClear();
    expect(durableTake([{ bucket: "org:x", limit: 1000, window: 60 }])).toBe("org:x");
    expect(rpc).not.toHaveBeenCalled(); // a known-over bucket costs nothing
  });

  it("names the first ceiling that trips, checking every one", () => {
    const checks = [
      { bucket: "tok:c", limit: 100, window: 60 },
      { bucket: "org:c", limit: 2, window: 60 },
    ];
    durableTake(checks);
    durableTake(checks);
    expect(durableTake(checks)).toBe("org:c");
  });

  it("a new window forgets everything", () => {
    const check = { bucket: "tok:d", limit: 1, window: 1 }; // 1-second windows
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(1_000_000_000_000));
      expect(durableTake([check])).toBeNull();
      expect(durableTake([check])).toBe("tok:d");
      vi.setSystemTime(new Date(1_000_000_002_000));
      expect(durableTake([check])).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("limits", () => {
  it("serves the built-in ceilings before the first read lands", () => {
    _resetLimiterState();
    expect(limits()).toEqual(DEFAULT_LIMITS);
  });
});
