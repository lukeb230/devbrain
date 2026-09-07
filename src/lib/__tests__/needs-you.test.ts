import { describe, expect, it } from "vitest";
import { buildNeeds, needsLevel, type NeedsInput } from "@/lib/desk/needs-you";

const base = (over: Partial<NeedsInput> = {}): NeedsInput => ({
  self: "luke",
  scopeAll: false,
  prs: [],
  tasks: [],
  claims: [],
  collisions: [],
  handoffs: [],
  fmtAgo: () => "2h ago",
  ...over,
});
const pr = (n: number, over: Partial<NeedsInput["prs"][number]> = {}) => ({ number: n, title: `PR ${n}`, author: "luke", mergeable_state: "clean", html_url: `https://gh/${n}`, defaultBranch: "main", light: null, ...over });
const task = (id: string, over: Partial<NeedsInput["tasks"][number]> = {}) => ({ id, repo_id: "r1", title: `Task ${id}`, priority: 2, assigned_to: "luke", status: "open", started_by: null, maybe_done_pr: null, created_by: "nova", created_at: "2026-09-07T00:00:00Z", ...over });

describe("buildNeeds", () => {
  it("is empty when nothing wants the viewer", () => {
    expect(buildNeeds(base({ prs: [pr(1, { author: "nova", mergeable_state: "dirty" })] }))).toEqual([]);
    expect(needsLevel([])).toBe("idle");
  });
  it("orders stop → go → wait, keeping collection order within a level", () => {
    const needs = buildNeeds(base({
      prs: [pr(9, { light: { state: "green", reason: "ok" } }), pr(11, { mergeable_state: "dirty" })],
      tasks: [task("t1", { priority: 1 }), task("t8", { maybe_done_pr: 2 })],
      handoffs: [{ id: "h1", repo_id: "r1", by: "rio", branch: "rio/x", summary: "half done" }],
    }));
    expect(needs.map((n) => n.key)).toEqual(["pr-conflict-11", "pr-green-9", "p1-t1", "maybe-t8", "handoff-h1"]);
    expect(needsLevel(needs)).toBe("stop");
  });
  it("a collision on my own claimed lane is a stop; someone else's is a wait", () => {
    const needs = buildNeeds(base({
      claims: [{ dev_label: "Luke", paths: ["src/api/"] }],
      collisions: [{ repo: "desk", file: "src/api/sla.ts", branches: ["a", "b"] }, { repo: "desk", file: "src/ui/inbox.ts", branches: ["c", "d"] }],
    }));
    expect(needs.map((n) => [n.level, n.title])).toEqual([
      ["stop", "Your lane is contested — sla.ts"],
      ["wait", "Collision — inbox.ts"],
    ]);
    expect(needs[0].why).toBe("a + b"); // repo name only when scoped to all repos
    expect(buildNeeds(base({ scopeAll: true, collisions: [{ repo: "desk", file: "x.ts", branches: ["a", "b"] }] }))[0].why).toBe("a + b · desk");
  });
  it("matches the viewer case-insensitively and skips started or foreign tasks", () => {
    const needs = buildNeeds(base({ self: "Luke", tasks: [task("a", { priority: 1, assigned_to: "LUKE" }), task("b", { priority: 1, started_by: "luke" }), task("c", { priority: 1, assigned_to: "nova" })] }));
    expect(needs.map((n) => n.key)).toEqual(["p1-a"]);
    expect(needs[0].why).toBe("nova · 2h ago");
  });
  it("never nags about your own handoff or your own approval-free green light", () => {
    expect(buildNeeds(base({ handoffs: [{ id: "h", repo_id: "r", by: "luke", branch: null, summary: "s" }] }))).toEqual([]);
    expect(buildNeeds(base({ prs: [pr(1, { author: "nova", light: { state: "green", reason: "r" } })] }))).toEqual([]);
  });
});
