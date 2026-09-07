import { describe, expect, it } from "vitest";
import { needsUpdate, pickSyncCandidates } from "@/lib/sync-prs";

const pr = (n: number, ms: string | null, over: Partial<{ draft: boolean; state: string }> = {}) =>
  ({ number: n, mergeable_state: ms, draft: false, state: "open", ...over });

describe("pickSyncCandidates", () => {
  it("considers clean PRs too — unprotected repos never report 'behind'", () => {
    expect(pickSyncCandidates([pr(1, "behind"), pr(2, "clean"), pr(3, "dirty"), pr(4, "blocked")])).toEqual([1, 2, 4]);
  });
  it("puts known-behind PRs first so the per-tick bound is spent well", () => {
    expect(pickSyncCandidates([pr(1, "clean"), pr(2, "behind"), pr(3, "unstable")])).toEqual([2, 1, 3]);
  });
  it("never touches drafts, closed PRs, conflicts, or unsettled states", () => {
    expect(
      pickSyncCandidates([pr(1, "behind", { draft: true }), pr(2, "behind", { state: "merged" }), pr(3, "dirty"), pr(4, "unknown"), pr(5, null)]),
    ).toEqual([]);
  });
  it("bounds work per tick", () => {
    expect(pickSyncCandidates([1, 2, 3, 4, 5, 6, 7].map((n) => pr(n, "clean")), 5)).toHaveLength(5);
  });
});

describe("needsUpdate", () => {
  it("only when the base has commits the head lacks", () => {
    expect(needsUpdate(1)).toBe(true);
    expect(needsUpdate(3)).toBe(true);
    expect(needsUpdate(0)).toBe(false);
    expect(needsUpdate(null)).toBe(false);
    expect(needsUpdate(undefined)).toBe(false);
  });
});
