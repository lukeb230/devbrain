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

// "Let DevBrain act on GitHub" — DEFAULT OFF, per repo, admins only. One
// GitHub App: these use the same installation that reads the repo, once the
// org owner has approved the app's write permissions. Always a PR or the
// merge of a human-approved PR; never a push to main. Gates: writer-gates.ts.
export const WRITER_CATALOG: RuleDef[] = [
  {
    rule: "writer_auto_merge",
    label: "Auto-merge approved green PRs",
    detail:
      "When a PR's light turns green — a teammate approved it, it's conflict-free, and it's this PR's turn in the merge order — DevBrain presses merge for you (squash). A PR only the AI cleared is never auto-merged. Off = the author gets a 'cleared to land' notification and presses merge themselves. GitHub branch protection still applies either way.",
  },
  {
    rule: "writer_update_branch",
    label: "Keep behind PRs updated",
    detail:
      "When a PR falls behind main after a teammate's merge (the rebase radar flags it), DevBrain updates its branch from main so the author doesn't have to — GitHub's own 'Update branch', a few per tick, never on a PR with conflicts. Conflicts still need the author.",
  },
  {
    rule: "writer_revert_pr",
    label: "Revert from History",
    detail:
      "Revert and Restore on the History tab open a revert branch + pull request. Always a PR — a teammate still reviews and merges it; DevBrain never touches main directly.",
  },
];

// Feature toggles — DEFAULT OFF, per repo.
export const FEATURE_CATALOG: RuleDef[] = [
  {
    rule: "solo_green",
    label: "Let the AI review clear a PR when you work alone",
    detail:
      "A merge light only turns green once a teammate approves, so on a one-person team it never leaves yellow. With this on, a conflict-free PR that DevBrain's own review marked 'looks good' turns green and says 'AI-reviewed — no teammate to approve' — never that a person signed off. GitHub branch protection still decides what can actually merge.",
  },
  {
    rule: "journals",
    label: "Session journals (team memory)",
    detail:
      "When a Claude Code session ends, a redacted excerpt (the conversation and which tools/files it used — never file contents or command output) is summarised into a journal: what was tried, learned, decided, and left undone. Journals are visible to the whole team and always labelled with their author.",
  },
];
