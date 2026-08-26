import { describe, expect, it } from "vitest";
import { buildDigest, type DigestRows } from "@/lib/digest";

// The context digest is the contract every teammate's plugin reads on every
// prompt. These tests pin its SHAPE (keys present, additive-only) and the
// pure logic that isn't covered by the lanes/traffic/merge-order suites.

function rows(over: Partial<DigestRows> = {}): DigestRows {
  return {
    repo: "acme/app",
    you: "luke",
    prs: [],
    sessions: [],
    activity: [],
    claims: [],
    policies: [],
    decisions: [],
    broadcasts: [],
    tasks: [],
    handoffs: [],
    mergedBranches: [],
    mergedPrs: [],
    latestDigest: null,
    reviews: [],
    ...over,
  };
}

const CONTRACT_KEYS = [
  "repo", "generated_at", "you", "team_rules", "open_prs", "merge_plan", "standup_digest",
  "active_sessions", "claims", "collisions", "recent_decisions", "recent_broadcasts",
  "open_tasks", "suggested_next", "brain_stale", "open_handoffs",
];

describe("buildDigest — contract", () => {
  it("always returns every key the plugin relies on, even with no data", () => {
    const d = buildDigest(rows()) as Record<string, unknown>;
    for (const k of CONTRACT_KEYS) expect(d, `missing key ${k}`).toHaveProperty(k);
    expect(d.repo).toBe("acme/app");
    expect(d.you).toBe("luke");
    expect(d.merge_plan).toBeNull();
    expect(d.standup_digest).toBeNull();
    expect(d.suggested_next).toBeNull();
    expect(d.collisions).toEqual([]);
  });

  it("serialises cleanly (no Maps/Sets leak into the JSON)", () => {
    const d = buildDigest(rows({ prs: [pr(1, ["a.ts"]), pr(2, ["a.ts"])] }));
    expect(JSON.parse(JSON.stringify(d))).toEqual(JSON.parse(JSON.stringify(d)));
    expect(JSON.stringify(d)).not.toContain("[object");
  });
});

describe("buildDigest — team rules", () => {
  it("lists all five defaults when no policy is disabled", () => {
    expect(buildDigest(rows()).team_rules).toHaveLength(5);
  });
  it("drops a rule whose policy row is disabled, keeps the rest", () => {
    const d = buildDigest(rows({ policies: [{ rule: "pr_only_main", enabled: false }, { rule: "no_self_approve", enabled: true }] }));
    expect(d.team_rules.some((r) => r.startsWith("pr_only_main"))).toBe(false);
    expect(d.team_rules.some((r) => r.startsWith("no_self_approve"))).toBe(true);
    expect(d.team_rules).toHaveLength(4);
  });
});

describe("buildDigest — sessions and collisions", () => {
  it("attaches the files each active session touched", () => {
    const d = buildDigest(rows({
      sessions: [{ id: "s1", dev_label: "luke", branch: "feat", summary: "x", last_seen: "" }],
      activity: [{ session_id: "s1", file: "src/a.ts" }, { session_id: "s1", file: "src/b.ts" }, { session_id: "s1", file: "src/a.ts" }],
    }));
    expect(d.active_sessions).toEqual([{ id: "s1", dev: "luke", branch: "feat", summary: "x", files: ["src/a.ts", "src/b.ts"] }]);
  });

  it("flags the same file in two different devs' sessions, not the same dev twice", () => {
    const d = buildDigest(rows({
      sessions: [
        { id: "s1", dev_label: "luke" }, { id: "s2", dev_label: "ethan" }, { id: "s3", dev_label: "luke" },
      ],
      activity: [
        { session_id: "s1", file: "src/store.ts" }, { session_id: "s2", file: "src/store.ts" },
        { session_id: "s1", file: "src/only-luke.ts" }, { session_id: "s3", file: "src/only-luke.ts" },
      ],
    }));
    expect(d.collisions).toHaveLength(1);
    expect(d.collisions[0]).toMatch(/src\/store\.ts — being edited by both luke and ethan/);
  });

  it("flags a file changed in two open PRs", () => {
    const d = buildDigest(rows({ prs: [pr(10, ["src/x.ts", "README.md"]), pr(11, ["src/x.ts"])] }));
    expect(d.collisions).toEqual(["src/x.ts — modified in PRs #10, #11"]);
  });
});

describe("buildDigest — brain staleness", () => {
  const merged = (name: string, files: string[]) => ({ name, changed_files: files, merged_at: "2026-08-25T00:00:00Z" });

  it("reports a merge that changed code without touching .brain/", () => {
    const d = buildDigest(rows({
      mergedBranches: [merged("feat/tags", ["src/lib/tags.ts", "package-lock.json"])],
      mergedPrs: [{ number: 7, title: "Tags", head_branch: "feat/tags" }],
    }));
    expect(d.brain_stale).toEqual([{
      branch: "feat/tags", pr: 7, title: "Tags", merged_at: "2026-08-25T00:00:00Z", code_files: ["src/lib/tags.ts"],
    }]);
  });

  it("is quiet for merges that updated the brain, or only touched lockfiles/.github", () => {
    const d = buildDigest(rows({
      mergedBranches: [
        merged("feat/ok", ["src/a.ts", ".brain/notes/a.md"]),
        merged("chore/lock", ["package-lock.json", ".github/workflows/ci.yml"]),
      ],
    }));
    expect(d.brain_stale).toEqual([]);
  });
});

describe("buildDigest — PR enrichment", () => {
  it("attaches the newest AI review and a traffic light to each open PR", () => {
    const d = buildDigest(rows({
      prs: [{ ...pr(3, ["a.ts"]), review_state: "approved" }],
      reviews: [
        { pr_number: 3, head_sha: "new", verdict: "looks_good", summary: "fine" },
        { pr_number: 3, head_sha: "old", verdict: "risky", summary: "stale" },
      ],
    }));
    expect(d.open_prs[0].ai_review).toEqual({ verdict: "looks_good", summary: "fine" });
    expect(d.open_prs[0].light?.state).toBe("green");
  });

  it("truncates the standup digest body to 1500 chars", () => {
    const d = buildDigest(rows({ latestDigest: { day: "2026-08-26", body: "x".repeat(5000) } }));
    expect(d.standup_digest?.body).toHaveLength(1500);
  });
});

describe("buildDigest — relevant_history (Phase 2a)", () => {
  it("is absent when no prompt was sent, present (and author-labelled) when hits are supplied", () => {
    expect(buildDigest(rows())).not.toHaveProperty("relevant_history");
    const d = buildDigest(rows({ relevantHistory: [
      { kind: "journal", source_id: "j1", title: "Export bug", snippet: "date parser", by_label: "ethan", at: "2026-08-20T00:00:00Z" },
    ] })) as Record<string, any>;
    expect(d.relevant_history).toEqual([{ kind: "journal", id: "j1", by: "ethan", at: "2026-08-20T00:00:00Z", title: "Export bug", snippet: "date parser" }]);
    expect(buildDigest(rows({ relevantHistory: [] })).relevant_history).toEqual([]);
  });
});

describe("buildDigest — dispatcher lane safety", () => {
  it("skips a task whose footprint overlaps a teammate's claim, never your own", () => {
    const tasks = [
      task("t1", 1, ["src/auth/"]),
      task("t2", 2, ["src/billing/"]),
    ];
    const mine = buildDigest(rows({ tasks, claims: [{ dev_label: "luke", paths: ["src/auth/"] }] }));
    expect(mine.suggested_next?.id).toBe("t1");
    const theirs = buildDigest(rows({ tasks, claims: [{ dev_label: "ethan", paths: ["src/auth/login.ts"] }] }));
    expect(theirs.suggested_next?.id).toBe("t2");
  });
});

function pr(number: number, files: string[]) {
  return {
    number, title: `PR ${number}`, author: "someone", head_branch: `b${number}`,
    review_state: null, mergeable_state: "clean", draft: false, changed_files: files, html_url: "",
  };
}
function task(id: string, priority: number, footprint: string[]) {
  return {
    id, title: id, detail: null, priority, tags: [], created_by: "x", created_at: "2026-08-01",
    assigned_to: null, started_by: null, footprint,
  };
}
