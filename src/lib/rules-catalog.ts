// Shared team-rules catalog — imported by the dashboard Rules page and the
// widget Settings view. Plain module (no "use client", no page exports).

export interface RuleDef {
  rule: string;
  label: string;
  detail: string;
  ghPath?: string;
}

export const RULES_CATALOG: RuleDef[] = [
  {
    rule: "no_self_approve",
    label: "No approving your own pull request",
    detail:
      "A teammate must review and approve before merge. Enforce via branch protection: require 1 approving review (GitHub already blocks self-approval).",
    ghPath: "settings/branches",
  },
  {
    rule: "pr_only_main",
    label: "No direct commits to main",
    detail:
      "All changes reach main through a pull request. Enforce via branch protection: require a PR before merging.",
    ghPath: "settings/branches",
  },
  {
    rule: "no_conflict_pr",
    label: "Never open a PR that conflicts with main",
    detail:
      "Agents must merge main into their branch and resolve conflicts BEFORE opening a PR. The plugin makes Claudes do this automatically.",
  },
  {
    rule: "brain_updates_required",
    label: "Brain updates ride with behavior changes",
    detail:
      "A PR that changes how a module works must update the matching .brain/ doc in the same branch.",
  },
  {
    rule: "collision_check",
    label: "Check who's editing before touching a file",
    detail:
      "The plugin checks DevBrain before every file edit and warns if a teammate's session is active on that file.",
  },
];

// Writer (Direction 2) feature toggles — DEFAULT OFF, per repo.
export const WRITER_CATALOG: RuleDef[] = [
  {
    rule: "writer_revert_pr",
    label: "One-click revert PRs from History",
    detail:
      "The writer app creates a revert branch + pull request when someone clicks Revert on the History tab. Always a PR — a teammate still reviews and merges it; the bot never touches main directly.",
  },
];
