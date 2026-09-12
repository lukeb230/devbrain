import { describe, expect, it } from "vitest";
import { breakerActive, breakerMinutes } from "@/lib/ai-breaker";

describe("breakerMinutes", () => {
  it("holds off a long time for the failures a human has to fix", () => {
    // The exact body Anthropic returned when the key ran dry.
    const credit = '{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}';
    expect(breakerMinutes(400, credit)).toBe(15);
    expect(breakerMinutes(401, "")).toBe(15);
    expect(breakerMinutes(403, "")).toBe(15);
  });

  it("backs off briefly for throttling and provider wobble", () => {
    expect(breakerMinutes(429, "")).toBe(2);
    expect(breakerMinutes(500, "")).toBe(1);
    expect(breakerMinutes(503, "")).toBe(1);
  });

  it("does not open for a request we got wrong ourselves", () => {
    expect(breakerMinutes(400, '{"error":{"message":"max_tokens: must be >= 1"}}')).toBe(0);
    expect(breakerMinutes(404, "")).toBe(0);
    expect(breakerMinutes(422, "")).toBe(0);
  });
});

describe("breakerActive", () => {
  const now = new Date("2026-09-12T12:00:00Z");

  it("is open until its deadline, then closed", () => {
    expect(breakerActive({ until: "2026-09-12T12:05:00Z", reason: "no credit" }, now)).toEqual({ open: true, reason: "no credit" });
    expect(breakerActive({ until: "2026-09-12T11:59:00Z", reason: "no credit" }, now).open).toBe(false);
  });

  it("treats anything unreadable as closed, so a bad row cannot stop the AI layer", () => {
    for (const v of [null, undefined, {}, { until: 42 }, { until: "not a date" }, "garbage"]) {
      expect(breakerActive(v, now).open).toBe(false);
    }
  });

  it("still reports open without a reason string", () => {
    expect(breakerActive({ until: "2026-09-12T12:05:00Z" }, now)).toEqual({ open: true, reason: "provider failing" });
  });
});
