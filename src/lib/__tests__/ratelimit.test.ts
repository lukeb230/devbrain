import { describe, expect, it } from "vitest";
import { makeLimiter } from "@/lib/ratelimit";

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
