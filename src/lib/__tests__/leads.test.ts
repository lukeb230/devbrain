import { describe, expect, it } from "vitest";
import { isLeadSource, normaliseEmail } from "@/lib/leads";

describe("normaliseEmail", () => {
  it("accepts ordinary addresses, trimmed and lowercased", () => {
    expect(normaliseEmail("  Luke@Example.com ")).toBe("luke@example.com");
    expect(normaliseEmail("a.b+tag@sub.example.co.uk")).toBe("a.b+tag@sub.example.co.uk");
  });

  it("rejects what is obviously not an address", () => {
    for (const bad of ["", "   ", "luke", "luke@", "@example.com", "luke@example", "a b@example.com", "luke@@example.com", null, 42, undefined]) {
      expect(normaliseEmail(bad)).toBeNull();
    }
  });

  it("rejects absurd lengths at both ends", () => {
    expect(normaliseEmail("a@b.c")).toBeNull(); // under the floor
    expect(normaliseEmail(`${"a".repeat(250)}@example.com`)).toBeNull();
  });

  it("does not reject unusual but legal local parts — this is a mailing list, not an auth check", () => {
    expect(normaliseEmail("o'brien@example.com")).toBe("o'brien@example.com");
    expect(normaliseEmail("first.last_1@example.dev")).toBe("first.last_1@example.dev");
  });
});

describe("isLeadSource", () => {
  it("accepts only the surfaces that exist", () => {
    expect(isLeadSource("landing")).toBe(true);
    expect(isLeadSource("beta_full")).toBe(true);
    expect(isLeadSource("../../etc")).toBe(false);
    expect(isLeadSource(null)).toBe(false);
  });
});
