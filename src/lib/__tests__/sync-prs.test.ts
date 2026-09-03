import { describe, expect, it } from "vitest";
import { pickSyncCandidates } from "@/lib/sync-prs";

const pr = (n: number, ms: string | null, over: Partial<{ draft: boolean; state: string }> = {}) =>
  ({ number: n, mergeable_state: ms, draft: false, state: "open", ...over });

describe("pickSyncCandidates", () => {
  it("updates only clean-but-behind PRs", () => {
    expect(pickSyncCandidates([pr(1, "behind"), pr(2, "clean"), pr(3, "dirty"), pr(4, "blocked")])).toEqual([1]);
  });
  it("never touches drafts, closed PRs, or conflicts", () => {
    expect(pickSyncCandidates([pr(1, "behind", { draft: true }), pr(2, "behind", { state: "merged" }), pr(3, "dirty")])).toEqual([]);
  });
  it("bounds work per tick", () => {
    expect(pickSyncCandidates([1, 2, 3, 4, 5, 6, 7].map((n) => pr(n, "behind")), 5)).toHaveLength(5);
  });
});
