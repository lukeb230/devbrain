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

const { makeLimiter, durableTake, durableDenied, _resetLimiterState, DEFAULT_LIMITS, limits } = await import("@/lib/ratelimit");

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

  it("allows a request under the limit", async () => {
    expect(await durableTake([{ bucket: "tok:a", limit: 5, window: 60 }])).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("refuses a cold bucket the database already knows is exhausted", async () => {
    // The production failure this exists to stop: an instance that has never
    // seen the bucket used to guess "allow" from its own empty memory, so a
    // burst fanned across cold instances got a free allowance EACH.
    rpc.mockImplementation(async () => ({ data: ["bad:1.2.3.4"] }));
    expect(await durableTake([{ bucket: "bad:1.2.3.4", limit: 60, window: 60 }])).toBe("bad:1.2.3.4");
  });

  it("asks once per window, then answers from memory", async () => {
    for (let i = 0; i < 50; i++) await durableTake([{ bucket: "tok:a", limit: 1000, window: 60 }]);
    expect(rpc).toHaveBeenCalledTimes(1); // the rest is counted behind the first
    const checks = rpc.mock.calls[0]![1].p_checks;
    expect(checks[0]).toMatchObject({ bucket: "tok:a", limit: 1000, cost: 1 });
  });

  it("refuses once this instance alone has served the whole limit", async () => {
    const check = { bucket: "tok:b", limit: 3, window: 60 };
    expect([await durableTake([check]), await durableTake([check]), await durableTake([check])]).toEqual([null, null, null]);
    expect(await durableTake([check])).toBe("tok:b");
  });

  it("remembers a bucket the database refused, and stops asking about it", async () => {
    rpc.mockImplementation(async () => ({ data: ["org:x"] }));
    expect(await durableTake([{ bucket: "org:x", limit: 1000, window: 60 }])).toBe("org:x");
    rpc.mockClear();
    expect(await durableTake([{ bucket: "org:x", limit: 1000, window: 60 }])).toBe("org:x");
    expect(rpc).not.toHaveBeenCalled(); // a known-over bucket costs nothing
  });

  it("names the first ceiling that trips, checking every one", async () => {
    const checks = [
      { bucket: "tok:c", limit: 100, window: 60 },
      { bucket: "org:c", limit: 2, window: 60 },
    ];
    await durableTake(checks);
    await durableTake(checks);
    expect(await durableTake(checks)).toBe("org:c");
  });

  it("stays up when the database is unreachable", async () => {
    rpc.mockImplementation(async () => { throw new Error("connection refused"); });
    const check = { bucket: "tok:down", limit: 2, window: 60 };
    expect(await durableTake([check])).toBeNull();  // fails open…
    expect(await durableTake([check])).toBeNull();
    expect(await durableTake([check])).toBe("tok:down"); // …but the local ceiling still holds
  });

  it("a new window forgets everything, and asks again", async () => {
    const check = { bucket: "tok:d", limit: 1, window: 1 }; // 1-second windows
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(1_000_000_000_000));
      expect(await durableTake([check])).toBeNull();
      expect(await durableTake([check])).toBe("tok:d");
      rpc.mockClear();
      vi.setSystemTime(new Date(1_000_000_002_000));
      expect(await durableTake([check])).toBeNull();
      expect(rpc).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("durableDenied", () => {
  beforeEach(() => {
    _resetLimiterState();
    rpc.mockClear();
    rpc.mockImplementation(async () => ({ data: [] }));
  });

  it("answers without counting, so a caller can be refused before it is identified", async () => {
    const check = { bucket: "bad:1.2.3.4", limit: 2, window: 60 };
    expect(durableDenied(check.bucket, 60)).toBe(false);
    await durableTake([check]);
    await durableTake([check]);
    await durableTake([check]);
    expect(durableDenied(check.bucket, 60)).toBe(true);
    rpc.mockClear();
    expect(durableDenied(check.bucket, 60)).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a bucket that was never counted is not denied", () => {
    expect(durableDenied("bad:nobody", 60)).toBe(false);
  });
});

describe("limits", () => {
  it("serves the built-in ceilings before the first read lands", () => {
    _resetLimiterState();
    expect(limits()).toEqual(DEFAULT_LIMITS);
  });
});
