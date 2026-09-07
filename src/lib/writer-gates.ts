// ============================================================================
// Write gates — the pure decisions behind "Let DevBrain act on GitHub".
//
// One GitHub App. Write capability is a permission the app holds on every
// installation (contents + pull_requests: write). Whether DevBrain USES it on
// a repo is a per-repo policy switch, admin-only, default off:
//
//   writer_auto_merge     — press merge on an approved, green PR
//   writer_update_branch  — bring a clean-but-behind PR up to date with main
//   writer_revert_pr      — open a revert PR from History
//
// Every write is a branch + PR or the merge of a PR a human approved. There
// is no path here that pushes to a default branch. Keeping the decisions in
// one pure module means the tick, the History action and the Rules page all
// answer "may I?" identically — and the table is unit-tested.
// ============================================================================

export const WRITE_RULES = ["writer_auto_merge", "writer_update_branch", "writer_revert_pr"] as const;
export type WriteRule = (typeof WRITE_RULES)[number];

/** What GitHub reports for an installation's relevant permissions. */
export interface WritePerms {
  contents: string | null;
  pull_requests: string | null;
}

/** True when the installation can actually perform every write we offer.
 *  Until the org owner approves the app's permission change, GitHub keeps
 *  the installation on its old (read) grants — and every switch stays inert. */
export function writeGranted(perms: WritePerms | null | undefined): boolean {
  return perms?.contents === "write" && perms?.pull_requests === "write";
}

interface Base {
  /** The repo's policy row for the rule; missing = off. */
  policyOn: boolean | null | undefined;
  /** The main app's installation on the repo; null = repo unlinked/orphaned. */
  installationId: number | null | undefined;
}

/** Auto-merge: policy on, installation present, light green, and a HUMAN
 *  approved. The AI-only ("solo green") verdict can light a PR green so a
 *  lone dev can see it's ready — it can never let a bot land it. */
export function canAutoMerge(x: Base & { reviewState: string | null | undefined; light: string | null | undefined }): boolean {
  return Boolean(x.policyOn) && Boolean(x.installationId) && x.light === "green" && x.reviewState === "approved";
}

/** Update-branch: policy on and installation present. Candidate selection
 *  (clean-but-behind, not draft, bounded) lives in sync-prs.ts. */
export function canUpdateBranch(x: Base): boolean {
  return Boolean(x.policyOn) && Boolean(x.installationId);
}

/** Revert: policy on and installation present. Membership is checked by the
 *  caller through RLS before it ever gets here. */
export function canRevert(x: Base): boolean {
  return Boolean(x.policyOn) && Boolean(x.installationId);
}
