import { describe, expect, it } from "vitest";
import { brainToMemory, eventToMemory, formatHit, handoffToMemory, journalToMemory, reviewToMemory, taskToMemory } from "@/lib/memory";

describe("memory index builders", () => {
  it("journal: body carries every bullet, labelled, and the author", () => {
    const m = journalToMemory({
      id: "j1", repo_id: "r", dev_label: "luke", at: "2026-08-26T00:00:00Z",
      summary: "Fixed the export date bug.",
      learned: ["parseTitle strips @names"], decisions: ["kept CalDAV priorities"], tried_and_failed: ["regex on notes"],
      remaining: "tests", files: ["src/a.ts"],
    });
    expect(m).toMatchObject({ kind: "journal", source_id: "j1", by_label: "luke", title: "Fixed the export date bug." });
    for (const s of ["Learned: parseTitle", "Decided: kept CalDAV", "Did not work: regex", "Remaining: tests", "Files: src/a.ts"]) {
      expect(m.body).toContain(s);
    }
  });

  it("events: only decisions and broadcasts, text from payload, author from payload", () => {
    expect(eventToMemory({ id: "e1", repo_id: "r", kind: "decision", payload: { text: "Use Voyage", by: "ethan" }, at: "t" }))
      .toMatchObject({ kind: "decision", title: "Use Voyage", by_label: "ethan" });
    expect(eventToMemory({ id: "e2", repo_id: "r", kind: "main_push", payload: {}, at: "t" })).toBeNull();
    expect(eventToMemory({ id: "e3", repo_id: "r", kind: "broadcast", payload: { text: "   " }, at: "t" })).toBeNull();
  });

  it("handoff / review / task carry their distinguishing fields", () => {
    const h = handoffToMemory({ id: "h", repo_id: "r", dev_label: "jake", summary: "Auth refactor", remaining: "tests", warnings: "flaky CI", branch: "auth", created_at: "t" });
    expect(h.body).toContain("Warnings: flaky CI");
    expect(h.at).toBe("t");

    const r = reviewToMemory({ repo_id: "r", pr_number: 12, head_sha: "abc", verdict: "looks_good", summary: "fine", points: [{ kind: "risk", text: "no tests" }], created_at: "t" });
    expect(r).toMatchObject({ kind: "pr_review", source_id: "12:abc", title: "PR #12 review: looks good" });
    expect(r.body).toContain("Risk: no tests");

    const t = taskToMemory({ id: "t1", repo_id: "r", title: "Add tags", detail: "to gear", tags: ["ui"], status: "open", priority: 2, created_by: "luke", created_at: "t" });
    expect(t.body).toContain("Tags: ui");
    expect(t.body).toContain("Open, P2");
  });

  it("brain: uses frontmatter title, strips frontmatter and wikilink brackets", () => {
    const m = brainToMemory("r", "notes/auth.md", "---\ntitle: Auth flow\ntype: module\n---\nSee [[Session store]].", "t");
    expect(m).toMatchObject({ kind: "brain", source_id: "notes/auth.md", title: "Auth flow", by_label: "brain" });
    expect(m.body).toBe("See Session store.");
    expect(brainToMemory("r", "notes/no-fm.md", "plain", "t").title).toBe("no-fm");
  });

  it("formatHit clips the snippet and keeps the author", () => {
    const f = formatHit({ kind: "journal", source_id: "x", title: "T", snippet: "s".repeat(1000), by_label: "luke", at: "t" });
    expect(f.snippet).toHaveLength(400);
    expect(f.by).toBe("luke");
  });
});
