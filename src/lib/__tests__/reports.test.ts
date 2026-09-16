import { describe, expect, it } from "vitest";
import {
  ackSubject, bodyForAck, bodyForOps, CONTEXT_KEYS, isHoneypotHit, isReportKind, isReportSource, kindsFor, LIMITS,
  refLabel, subjectFor, trimContext, validateReport, type Report,
} from "@/lib/reports";

const good = { kind: "bug", source: "web", email: "Luke@Example.com ", name: " Luke ", subject: " Panel is blank ", message: "After the update the panel shows nothing at all, even after a reload." };

describe("kinds and sources", () => {
  it("knows the three kinds and two sources", () => {
    expect(isReportKind("support") && isReportKind("bug") && isReportKind("feature")).toBe(true);
    expect(isReportKind("ticket")).toBe(false);
    expect(isReportSource("web") && isReportSource("console")).toBe(true);
    expect(isReportSource("panel")).toBe(false);
  });
  it("offers all three on the web and no support question in the Console", () => {
    expect(kindsFor("web")).toEqual(["support", "bug", "feature"]);
    expect(kindsFor("console")).toEqual(["bug", "feature"]);
  });
});

describe("validateReport", () => {
  it("accepts a good report, trimmed and normalised", () => {
    const v = validateReport(good);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.report).toEqual({ kind: "bug", source: "web", email: "luke@example.com", name: "Luke", subject: "Panel is blank", message: good.message, context: {} });
  });
  it("names the field that is wrong", () => {
    expect(validateReport({ ...good, kind: "ticket" })).toMatchObject({ ok: false, field: "kind" });
    expect(validateReport({ ...good, kind: "support", source: "console" })).toMatchObject({ ok: false, field: "kind" });
    expect(validateReport({ ...good, email: "luke" })).toMatchObject({ ok: false, field: "email" });
    expect(validateReport({ ...good, subject: "  " })).toMatchObject({ ok: false, field: "subject" });
    expect(validateReport({ ...good, subject: "x".repeat(LIMITS.subject + 1) })).toMatchObject({ ok: false, field: "subject" });
    expect(validateReport({ ...good, message: "too short" })).toMatchObject({ ok: false, field: "message" });
    expect(validateReport({ ...good, message: "x".repeat(LIMITS.message.max + 1) })).toMatchObject({ ok: false, field: "message" });
  });
  it("treats an unknown source as web-only kinds being wrong, not a crash", () => {
    expect(validateReport({ ...good, source: "panel" })).toMatchObject({ ok: false, field: "kind" });
  });
  it("drops a blank name and cuts a long one", () => {
    const a = validateReport({ ...good, name: "   " });
    expect(a.ok && a.report.name).toBeNull();
    const b = validateReport({ ...good, name: "n".repeat(200) });
    expect(b.ok && b.report.name?.length).toBe(LIMITS.name);
  });
  it("carries context through trimContext", () => {
    const v = validateReport({ ...good, context: JSON.stringify({ app_version: "0.4.12", token: "dbk_secret" }) });
    expect(v.ok && v.report.context).toEqual({ app_version: "0.4.12" });
  });
});

describe("isHoneypotHit", () => {
  it("is true only when the hidden field has text", () => {
    const fd = new FormData();
    expect(isHoneypotHit(fd)).toBe(false);
    fd.set("website", "");
    expect(isHoneypotHit(fd)).toBe(false);
    fd.set("website", "http://spam.example");
    expect(isHoneypotHit(fd)).toBe(true);
  });
});

describe("trimContext", () => {
  it("keeps only the allowed keys, as strings cut to 200 chars", () => {
    const out = trimContext({ app_version: "0.4.12", bootstrap_ok: true, page: "/desk/help", token: "no", user_agent: "u".repeat(500) });
    expect(Object.keys(out).every((k) => (CONTEXT_KEYS as readonly string[]).includes(k))).toBe(true);
    expect(out).toMatchObject({ app_version: "0.4.12", bootstrap_ok: "true", page: "/desk/help" });
    expect(out.user_agent?.length).toBe(200);
    expect("token" in out).toBe(false);
  });
  it("accepts a JSON string and returns {} for garbage or nothing", () => {
    expect(trimContext('{"channel":"stable"}')).toEqual({ channel: "stable" });
    expect(trimContext("{not json")).toEqual({});
    expect(trimContext(null)).toEqual({});
    expect(trimContext(42)).toEqual({});
  });
  it("the largest blob the keys allow still fits the cap", () => {
    // 7 keys × 200 chars is well under 4 KB, so the size guard in
    // trimContext is belt-and-braces; this pins that the caps agree.
    const big = Object.fromEntries(CONTEXT_KEYS.map((k) => [k, "x".repeat(500)]));
    const out = trimContext(big);
    expect(Object.keys(out)).toHaveLength(CONTEXT_KEYS.length);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(LIMITS.context);
  });
  it("measures the cap in UTF-8 bytes, not UTF-16 code units", () => {
    // Each "字" is 1 UTF-16 code unit but 3 UTF-8 bytes, so 7 keys × 200
    // of them serialise to well over 4096 bytes while `.length` stays
    // under it — a byte-counting cap must reject this; a code-unit-
    // counting one would wrongly let it through.
    const big = Object.fromEntries(CONTEXT_KEYS.map((k) => [k, "字".repeat(200)]));
    expect(trimContext(big)).toEqual({});
  });
});

describe("mail copy", () => {
  const report: Report = { kind: "feature", source: "console", email: "luke@example.com", name: null, subject: "Dark mode for the panel", message: "The panel is bright at night and the Console already has a theme.", context: { app_version: "0.4.12", team: "Northwind" } };
  it("formats the reference and the subjects", () => {
    expect(refLabel(1042)).toBe("DB-1042");
    expect(subjectFor("support", 7, "Where are tokens?")).toBe("[DB-7] Question: Where are tokens?");
    expect(subjectFor("bug", 1042, "Panel is blank")).toBe("[DB-1042] Bug: Panel is blank");
    expect(subjectFor("feature", 3, "Dark mode")).toBe("[DB-3] Feature request: Dark mode");
    expect(ackSubject(1042)).toBe("[DB-1042] We got your report");
  });
  it("the ops body carries the message, who sent it, and the context block", () => {
    const b = bodyForOps(report, 1042);
    expect(b).toContain("DB-1042");
    expect(b).toContain("Feature request");
    expect(b).toContain("luke@example.com");
    expect(b).toContain(report.message);
    expect(b).toContain("app_version: 0.4.12");
    expect(b).toContain("team: Northwind");
    expect(b).toContain("source: console");
  });
  it("the ack body thanks them, quotes the message, and says how replies work", () => {
    const b = bodyForAck(report, 1042);
    expect(b).toContain("DB-1042");
    expect(b).toContain(report.message);
    expect(b).toMatch(/reply to this email/i);
    expect(b).not.toContain("app_version");
  });
});
