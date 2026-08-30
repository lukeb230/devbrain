import { describe, expect, it } from "vitest";
import { compareVersions, httpHint, normalizeStep, stepFromError, summarizeResults, sessionSlug, nextCloneName } from "../lib.mjs";

describe("compareVersions", () => {
  it("compares numerically per component", () => {
    expect(compareVersions("0.3.7", "0.3.8")).toBe(-1);
    expect(compareVersions("0.3.10", "0.3.9")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("v0.3.8", "0.3.8")).toBe(0);
  });
  it("orders prereleases below releases", () => {
    expect(compareVersions("0.4.0-beta.1", "0.4.0")).toBe(-1);
    expect(compareVersions("0.4.0", "0.4.0-beta.1")).toBe(1);
  });
  it("returns null for unparseable input", () => {
    expect(compareVersions("unknown", "0.3.8")).toBeNull();
    expect(compareVersions(null, "0.3.8")).toBeNull();
    expect(compareVersions("0.3", "0.3.8")).toBeNull();
  });
});

describe("summarizeResults", () => {
  it("separates failed, skipped and ok; legacy strings are ok", () => {
    const s = summarizeResults({
      source: "up to date",
      plugin: { ok: false, code: "claude_missing", msg: "FAILED: claude CLI not found" },
      widget: { ok: true, skipped: true, msg: "not released yet" },
      thrown: stepFromError(new Error("boom\nstack")),
    });
    expect(s.ok).toBe(false);
    expect(s.failed).toEqual(["plugin", "thrown"]);
    expect(s.skipped).toEqual(["widget"]);
    expect(s.lines.find((l) => l.includes("thrown"))).toContain("FAILED: boom");
    expect(s.lines.find((l) => l.includes("widget"))).toContain("·");
  });
  it("is ok when nothing failed", () => {
    expect(summarizeResults({ a: "x", b: normalizeStep({ ok: true, msg: "y" }) }).ok).toBe(true);
  });
});

describe("httpHint", () => {
  it("speaks only on 401, with the channel command", () => {
    expect(httpHint(401, "devbrain-beta")).toContain("devbrain-beta setup --reconfigure");
    expect(httpHint(404)).toBeNull();
    expect(httpHint(500)).toBeNull();
    expect(httpHint(0)).toBeNull();
  });
});

describe("sessionSlug", () => {
  it("makes label filesystem-safe", () => {
    expect(sessionSlug("Luke's MacBook · 2")).toBe("luke-s-macbook-2");
  });
  it("never returns empty", () => {
    expect(sessionSlug("···")).toBe("session");
  });
});

describe("nextCloneName", () => {
  it("starts at -2 and fills gaps", () => {
    expect(nextCloneName("lukeb230/faketeam-desk", [])).toBe("faketeam-desk-2");
    expect(nextCloneName("lukeb230/faketeam-desk", ["faketeam-desk-2", "faketeam-desk-4"])).toBe("faketeam-desk-3");
  });
});
