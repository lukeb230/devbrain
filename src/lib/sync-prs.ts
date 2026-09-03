// ============================================================================
// Which open PRs should the writer app bring up to date after main moves?
//
//   behind  — GitHub can update it cleanly (its "Update branch" button):
//             do it, silently. Keeping branches fresh is what prevents the
//             merge-one-and-the-rest-conflict spiral.
//   dirty   — a real conflict: NEVER auto-touched. The context's
//             rebase_needed entry hands the owner the exact local fix (where
//             the union .gitattributes auto-resolves the note files).
//
// Pure function so the policy is testable without GitHub.
// ============================================================================

export interface SyncPr {
  number: number;
  mergeable_state: string | null;
  draft: boolean;
  state: string;
}

export function pickSyncCandidates(prs: SyncPr[], max = 5): number[] {
  return prs
    .filter((p) => p.state === "open" && !p.draft && p.mergeable_state === "behind")
    .slice(0, max)
    .map((p) => p.number);
}
