import { describe, expect, it } from "vitest";
import { computeMergePlan, type MergePr } from "@/lib/merge-order";

const pr = (number: number, files: string[], over: Partial<MergePr> = {}): MergePr => ({
  number, title: `#${number}`, author: "a", review_state: null, mergeable_state: "clean", draft: false, changed_files: files, ...over,
});

describe("computeMergePlan", () => {
  it("is null with fewer than two PRs, empty when nothing overlaps", () => {
    expect(computeMergePlan([pr(1, ["a"])])).toBeNull();
    expect(computeMergePlan([pr(1, ["a"]), pr(2, ["b"])])).toEqual({ order: [], overlaps: [] });
  });

  it("reports pairwise overlaps with the shared files", () => {
    const plan = computeMergePlan([pr(1, ["a", "b"]), pr(2, ["b", "c"]), pr(3, ["c"])]);
    expect(plan?.overlaps).toEqual([
      { a: 1, b: 2, files: ["b"] },
      { a: 2, b: 3, files: ["c"] },
    ]);
  });

  it("orders by readiness, then overlap degree, then size", () => {
    const plan = computeMergePlan([
      pr(1, ["a", "b", "c", "d"], { mergeable_state: "dirty" }),   // conflicts → last
      pr(2, ["a"], { review_state: "approved" }),                    // ready, 1 overlap
      pr(3, ["a", "b"], { review_state: "approved" }),               // ready, 2 overlaps → first
      pr(4, ["b"]),                                                  // awaiting review
    ]);
    expect(plan?.order.map((s) => s.number)).toEqual([3, 2, 4, 1]);
    expect(plan?.order[0].overlapsWith.sort()).toEqual([1, 2, 4]);
    expect(plan?.order[3].reason).toMatch(/conflicts with main/);
  });
});
