import { describe, expect, it } from "vitest";
import { cleanLabel, nextLabel } from "@/lib/spawn-label";

describe("nextLabel", () => {
  it("first child of a parent is · 2", () => {
    expect(nextLabel("Luke's MacBook", [])).toBe("Luke's MacBook · 2");
  });

  it("skips taken names and fills gaps", () => {
    expect(nextLabel("Luke", ["Luke · 2", "Luke · 4"])).toBe("Luke · 3");
  });

  it("collision check is case-insensitive, like the live-label index", () => {
    expect(nextLabel("Luke", ["luke · 2"])).toBe("Luke · 3");
  });

  it("long parent names leave room for the suffix", () => {
    const parent = "x".repeat(80);
    const label = nextLabel(parent, []);
    expect(label.length).toBeLessThanOrEqual(60);
    expect(label.endsWith(" · 2")).toBe(true);
  });
});

describe("cleanLabel", () => {
  it("trims and collapses whitespace", () => {
    expect(cleanLabel("  Loop   2  ")).toBe("Loop 2");
  });
  it("empty is null", () => {
    expect(cleanLabel("   ")).toBeNull();
    expect(cleanLabel(undefined)).toBeNull();
  });
});
