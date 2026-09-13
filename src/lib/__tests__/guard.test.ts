import { describe, expect, it } from "vitest";
import { guardDecision, guardOutcomes, GUARD_EDIT_WINDOW_MS, type GuardWarn } from "@/lib/guard";

// ============================================================================
// The collision guard's decision, server-side, and the honest outcome rule.
// Mirrors what plugin/hooks/check-collision.mjs used to compute locally.
// ============================================================================

const sessions = (...s: { id: string; dev: string; files: string[]; branch?: string }[]) => s.map((x) => ({ branch: null, ...x }));

describe("guardDecision", () => {
  it("is silent when nobody else is on the file and nothing is claimed", () => {
    const d = guardDecision({ you: "Kai", ownSession: "s-kai", rel: "src/ui/inbox.ts", sessions: sessions({ id: "s-kai", dev: "Kai", files: ["src/ui/inbox.ts"] }), claims: [] });
    expect(d.warn).toBe(false);
    expect(d.with).toEqual([]);
  });

  it("warns when a teammate's active session touched the same file", () => {
    const d = guardDecision({ you: "Kai", ownSession: "s-kai", rel: "src/api/tickets.ts", sessions: sessions({ id: "s-nova", dev: "Nova", branch: "nova/x", files: ["src/api/tickets.ts"] }), claims: [] });
    expect(d.warn).toBe(true);
    expect(d.with).toEqual([{ label: "Nova", via: "session", id: "s-nova" }]);
    expect(d.reason).toContain("src/api/tickets.ts");
    expect(d.reason).toContain("Nova (active session on nova/x)");
  });

  it("never warns about your own session, nor about your own other windows (same label)", () => {
    const d = guardDecision({
      you: "Kai", ownSession: "s-kai", rel: "a.ts",
      sessions: sessions({ id: "s-kai", dev: "Kai", files: ["a.ts"] }, { id: "s-kai-2", dev: "Kai", files: ["a.ts"] }),
      claims: [],
    });
    expect(d.warn).toBe(false);
  });

  it("warns on a teammate's claim covering the file, with the note", () => {
    const d = guardDecision({ you: "Kai", ownSession: "s-kai", rel: "src/api/tickets.ts", sessions: [], claims: [{ id: "c1", dev_label: "Nova", paths: ["src/api/**"], note: "guard test" }] });
    expect(d.warn).toBe(true);
    expect(d.with).toEqual([{ label: "Nova", via: "claim", id: "c1" }]);
    expect(d.reason).toContain("Nova (claimed: guard test)");
  });

  it("claim matching: exact path, or a glob prefix with trailing stars stripped", () => {
    const claims = [{ id: "c1", dev_label: "Nova", paths: ["src/api/**", "README.md"], note: null }];
    expect(guardDecision({ you: "Kai", ownSession: "", rel: "src/api/deep/x.ts", sessions: [], claims }).warn).toBe(true);
    expect(guardDecision({ you: "Kai", ownSession: "", rel: "README.md", sessions: [], claims }).warn).toBe(true);
    expect(guardDecision({ you: "Kai", ownSession: "", rel: "src/apix.ts", sessions: [], claims }).warn).toBe(false);
    expect(guardDecision({ you: "Kai", ownSession: "", rel: "src/ui/a.ts", sessions: [], claims }).warn).toBe(false);
  });

  it("ignores your own claims", () => {
    const d = guardDecision({ you: "Nova", ownSession: "", rel: "src/api/a.ts", sessions: [], claims: [{ id: "c1", dev_label: "Nova", paths: ["src/api/**"], note: null }] });
    expect(d.warn).toBe(false);
  });

  it("lists everyone involved, sessions before claims", () => {
    const d = guardDecision({
      you: "Kai", ownSession: "s-kai", rel: "a.ts",
      sessions: sessions({ id: "s-nova", dev: "Nova", files: ["a.ts"] }),
      claims: [{ id: "c1", dev_label: "Rio", paths: ["a.ts"], note: null }],
    });
    expect(d.with.map((w) => w.label)).toEqual(["Nova", "Rio"]);
  });
});

describe("guardOutcomes", () => {
  const T0 = Date.parse("2026-09-13T12:00:00Z");
  const warn = (id: number, at: number, session = "s-kai", rel = "a.ts"): GuardWarn => ({ id, at: new Date(at).toISOString(), actor_session: session, rel });
  const act = (at: number, session = "s-kai", file = "a.ts") => ({ session_id: session, file, at: new Date(at).toISOString() });

  it("a warn followed by an edit to the same file by the same session inside the window is 'edited_after'", () => {
    const r = guardOutcomes([warn(1, T0)], [act(T0 + 30_000)]);
    expect(r).toEqual({ warned: 1, edited_after: 1 });
  });

  it("no edit, or an edit outside the window, is not", () => {
    expect(guardOutcomes([warn(1, T0)], [])).toEqual({ warned: 1, edited_after: 0 });
    expect(guardOutcomes([warn(1, T0)], [act(T0 + GUARD_EDIT_WINDOW_MS + 1)])).toEqual({ warned: 1, edited_after: 0 });
  });

  it("an edit BEFORE the warn does not count, and neither does another session or another file", () => {
    expect(guardOutcomes([warn(1, T0)], [act(T0 - 1)])).toEqual({ warned: 1, edited_after: 0 });
    expect(guardOutcomes([warn(1, T0)], [act(T0 + 1, "s-nova")])).toEqual({ warned: 1, edited_after: 0 });
    expect(guardOutcomes([warn(1, T0)], [act(T0 + 1, "s-kai", "b.ts")])).toEqual({ warned: 1, edited_after: 0 });
  });

  it("counts each warn once even with several later edits", () => {
    expect(guardOutcomes([warn(1, T0)], [act(T0 + 1), act(T0 + 2)])).toEqual({ warned: 1, edited_after: 1 });
  });

  it("the window is ten minutes", () => {
    expect(GUARD_EDIT_WINDOW_MS).toBe(10 * 60_000);
  });
});
