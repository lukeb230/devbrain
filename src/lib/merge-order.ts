// ============================================================================
// Merge-order intelligence — pure computation, no AI, no network.
//
// Given the open PRs of a repo (with their changed-file lists, already kept
// fresh by webhooks), compute:
//   1. Pairwise overlaps — which PRs touch the same files.
//   2. A recommended merge order that minimizes conflict pain.
//
// Ordering heuristic, in priority:
//   a. Readiness first — approved + conflict-free PRs merge before anything
//      else; PRs that already conflict with main sort last (they need fixing
//      before order matters).
//   b. Within a tier, HIGH-overlap PRs merge first: landing the foundational
//      PR early means each remaining PR absorbs one small rebase, instead of
//      the big PR absorbing everyone's conflicts at the end.
//   c. Ties break toward smaller PRs (fewer changed files) — cheap to land.
// ============================================================================

export interface MergePr {
  number: number;
  title: string;
  author: string | null;
  review_state: string | null;
  mergeable_state: string | null;
  draft: boolean;
  changed_files: string[];
  /** Latest DevBrain AI review verdict for this head sha, when one exists.
   *  Only consulted under the solo_green policy. */
  ai_verdict?: string | null;
}

export interface OverlapPair {
  a: number;
  b: number;
  files: string[];
}

export interface MergeStep {
  number: number;
  title: string;
  reason: string;
  overlapsWith: number[];
}

export interface MergePlan {
  order: MergeStep[];
  overlaps: OverlapPair[];
}

function readinessTier(pr: MergePr): number {
  if (pr.draft) return 4;
  if (pr.mergeable_state === "dirty") return 3;
  if (pr.review_state === "changes_requested") return 2;
  if (pr.review_state === "approved") return 0;
  return 1;
}

function tierLabel(tier: number): string {
  return ["approved and conflict-free", "clean, awaiting review", "changes requested", "conflicts with main — fix before merging", "draft"][tier] ?? "";
}

export function computeMergePlan(prs: MergePr[]): MergePlan | null {
  const eligible = prs.filter((p) => Array.isArray(p.changed_files));
  if (eligible.length < 2) return null;

  // Pairwise overlaps.
  const overlaps: OverlapPair[] = [];
  const overlapDegree = new Map<number, Set<number>>();
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i];
      const b = eligible[j];
      const setB = new Set(b.changed_files);
      const shared = a.changed_files.filter((f) => setB.has(f));
      if (shared.length > 0) {
        overlaps.push({ a: a.number, b: b.number, files: shared.slice(0, 10) });
        if (!overlapDegree.has(a.number)) overlapDegree.set(a.number, new Set());
        if (!overlapDegree.has(b.number)) overlapDegree.set(b.number, new Set());
        overlapDegree.get(a.number)!.add(b.number);
        overlapDegree.get(b.number)!.add(a.number);
      }
    }
  }
  // No overlaps anywhere → order doesn't matter; nothing worth recommending.
  if (overlaps.length === 0) return { order: [], overlaps: [] };

  const sorted = [...eligible].sort((x, y) => {
    const tx = readinessTier(x);
    const ty = readinessTier(y);
    if (tx !== ty) return tx - ty;
    const ox = overlapDegree.get(x.number)?.size ?? 0;
    const oy = overlapDegree.get(y.number)?.size ?? 0;
    if (ox !== oy) return oy - ox; // more overlap → earlier
    return x.changed_files.length - y.changed_files.length; // smaller → earlier
  });

  const order: MergeStep[] = sorted.map((pr) => {
    const deg = overlapDegree.get(pr.number)?.size ?? 0;
    const tier = readinessTier(pr);
    const bits: string[] = [tierLabel(tier)];
    if (deg > 0) {
      bits.push(
        `shares files with ${deg} other PR${deg > 1 ? "s" : ""} — whichever lands second will need a rebase; landing this one ${tier <= 1 ? "early keeps that rebase small" : "will require conflict work first"}`,
      );
    } else {
      bits.push("no overlap — safe to merge anytime");
    }
    return {
      number: pr.number,
      title: pr.title,
      reason: bits.join("; "),
      overlapsWith: [...(overlapDegree.get(pr.number) ?? [])],
    };
  });

  return { order, overlaps };
}
