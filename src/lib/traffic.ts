// ============================================================================
// Merge traffic lights — deterministic, no AI.
//
//   green  — cleared to land: approved, conflict-free, and its turn in the
//            merge-order plan. The one actionable state.
//   yellow — fine but hold: waiting on review, or an overlapping PR earlier
//            in the plan should land first. Always says why.
//   red    — needs work: conflicts with main or changes requested.
//   gray   — draft.
//
// Checks: the checks column isn't populated yet (no check_suite webhook), so
// lights treat absent checks as passing. GitHub branch protection remains the
// hard enforcement at the merge button either way.
// ============================================================================

import { computeMergePlan, type MergePr } from "@/lib/merge-order";

export interface Light {
  state: "green" | "yellow" | "red" | "gray";
  reason: string;
}

export function computeLights(prs: MergePr[]): Map<number, Light> {
  const lights = new Map<number, Light>();
  const plan = computeMergePlan(prs);
  const planIndex = new Map<number, number>();
  const overlapsWith = new Map<number, number[]>();
  if (plan) {
    plan.order.forEach((s, i) => {
      planIndex.set(s.number, i);
      overlapsWith.set(s.number, s.overlapsWith);
    });
  }

  const isReady = (p: MergePr) =>
    !p.draft && p.mergeable_state !== "dirty" && p.review_state === "approved";

  for (const pr of prs) {
    if (pr.draft) {
      lights.set(pr.number, { state: "gray", reason: "draft" });
      continue;
    }
    if (pr.mergeable_state === "dirty") {
      lights.set(pr.number, { state: "red", reason: "conflicts with main — resolve before merging" });
      continue;
    }
    if (pr.review_state === "changes_requested") {
      lights.set(pr.number, { state: "red", reason: "changes requested — address the review" });
      continue;
    }
    if (pr.review_state !== "approved") {
      lights.set(pr.number, { state: "yellow", reason: "waiting on a teammate's review" });
      continue;
    }
    // Approved + clean. Its turn? An overlapping, also-ready PR earlier in
    // the plan should land first so this one's rebase stays small.
    const myIdx = planIndex.get(pr.number);
    const blocker = (overlapsWith.get(pr.number) ?? []).find((other) => {
      const otherIdx = planIndex.get(other);
      const otherPr = prs.find((p) => p.number === other);
      return (
        otherIdx !== undefined &&
        myIdx !== undefined &&
        otherIdx < myIdx &&
        otherPr !== undefined &&
        isReady(otherPr)
      );
    });
    if (blocker !== undefined) {
      lights.set(pr.number, {
        state: "yellow",
        reason: `ready — but merge #${blocker} first (you share files)`,
      });
    } else {
      lights.set(pr.number, { state: "green", reason: "cleared to land — press merge" });
    }
  }
  return lights;
}
