// ============================================================================
// Which open PRs should DevBrain bring up to date after main moves?
//
// GitHub's mergeable_state only says "behind" when branch protection
// requires up-to-date branches — a paid feature on private repos, so most
// repos report "clean" for a branch that is quietly behind. So selection is
// two steps:
//
//   1. pickSyncCandidates (pure): open, not draft, and NOT in conflict.
//      "dirty" is a real conflict and is NEVER auto-touched — the context's
//      rebase_needed entry hands the owner the exact local fix. "unknown"
//      is GitHub still computing; skip until it settles. Genuinely-behind
//      PRs are ordered first so the per-tick bound spends itself well.
//   2. The tick then asks GitHub how far behind each candidate actually is
//      (compare base...head → behind_by) and only updates those with
//      behind_by > 0. needsUpdate() is the pure half of that decision.
//
// Pure functions so the policy is testable without GitHub.
// ============================================================================

export interface SyncPr {
  number: number;
  mergeable_state: string | null;
  draft: boolean;
  state: string;
}

const NEVER = new Set(["dirty", "unknown", "draft"]);

export function pickSyncCandidates(prs: SyncPr[], max = 5): number[] {
  return prs
    .filter((p) => p.state === "open" && !p.draft && !NEVER.has(p.mergeable_state ?? "unknown"))
    .sort((a, b) => Number(b.mergeable_state === "behind") - Number(a.mergeable_state === "behind"))
    .slice(0, max)
    .map((p) => p.number);
}

/** Update only when the base really has commits the head lacks. */
export function needsUpdate(behindBy: number | null | undefined): boolean {
  return typeof behindBy === "number" && behindBy > 0;
}
