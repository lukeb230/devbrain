// ============================================================================
// First-run onboarding: five steps whose completion is DERIVED from rows.
// Nothing here stores "done". The only persisted state is what cannot be
// derived — org_members.onboarding { dismissed_at, preset } — and gating
// reads only dismissed_at.
//
// Blocking is owner-only and narrow: a repo that is not even requested, or a
// linked repo with no rules decided. Machine setup and the it's-working check
// depend on a macOS permission prompt and an editor restart, which can fail
// for reasons the app cannot see, so they never block.
// ============================================================================

import { openRequest, type LinkRow, type RequestEvent } from "./onboarding-request";

export const DISMISS_MS = 24 * 3600_000;

export type Role = "owner" | "admin" | "member";
export type StepId = "team" | "repo" | "mac" | "rules" | "working";
export type RepoState = "linked" | "requested" | "none";

export type Step = {
  id: StepId;
  done: boolean;
  /** Only on the repo step. */
  state?: RepoState;
  /** Who did it — for the teammate view ("Linked by luke"). */
  by?: string | null;
  /** Set on steps a non-owner cannot advance while the team has no repo. */
  waitingOn?: string;
};

export type OnboardingInput = {
  role: Role;
  userId: string;
  /** Live linked repos for the org. */
  repos: (LinkRow & { id: string; full_name: string; installation_id: number | null })[];
  /** THIS user's dev tokens. */
  tokens: { revoked_at: string | null }[];
  /** THIS user's sessions and activity (any repo). */
  sessions: { repo_id: string | null }[];
  activity: { repo_id: string | null }[];
  /** Policy rows for the org, any rule. */
  policies: { repo_id: string; rule: string }[];
  requestEvents: RequestEvent[];
  attribution: { linked?: string | null; rules?: string | null };
  onboarding: { dismissed_at?: string | null; preset?: string | null };
  now?: Date;
};

export type OnboardingState = {
  steps: Step[];
  repoState: RepoState;
  /** True only for an owner who must finish before seeing the Console. */
  blocking: boolean;
  dismissed: boolean;
  /** First incomplete step, or null when everything is done. */
  nextStep: StepId | null;
  /** Every step done — the nudge disappears. */
  complete: boolean;
};

const ORDER: StepId[] = ["team", "repo", "mac", "rules", "working"];

export function onboardingState(i: OnboardingInput): OnboardingState {
  const now = i.now ?? new Date();
  const repoIds = new Set(i.repos.map((r) => r.id));

  const repoState: RepoState = i.repos.length > 0 ? "linked" : openRequest(i.requestEvents, i.repos, now) ? "requested" : "none";
  const macDone = i.tokens.some((t) => t.revoked_at === null);
  const rulesDone = i.repos.length > 0 && i.repos.every((r) => i.policies.some((p) => p.repo_id === r.id));
  const workingDone = [...i.sessions, ...i.activity].some((a) => a.repo_id !== null && repoIds.has(a.repo_id));

  const waiting = i.role !== "owner" && i.repos.length === 0 ? "your team's owner" : undefined;

  const steps: Step[] = [
    { id: "team", done: true },
    { id: "repo", done: repoState === "linked", state: repoState, by: i.attribution.linked ?? null, waitingOn: waiting },
    { id: "mac", done: macDone },
    { id: "rules", done: rulesDone, by: i.attribution.rules ?? null, waitingOn: waiting },
    { id: "working", done: workingDone },
  ];

  const dismissedAt = i.onboarding.dismissed_at ? new Date(i.onboarding.dismissed_at).getTime() : null;
  const dismissed = dismissedAt !== null && now.getTime() - dismissedAt < DISMISS_MS;

  const essentialsMissing = repoState === "none" || (repoState === "linked" && !rulesDone);
  const blocking = i.role === "owner" && !dismissed && essentialsMissing;

  let nextStep: StepId | null;
  if (blocking) {
    nextStep = repoState === "none" ? "repo" : "rules";
  } else {
    nextStep = ORDER.find((id) => !steps.find((s) => s.id === id)!.done) ?? null;
  }
  return { steps, repoState, blocking, dismissed, nextStep, complete: nextStep === null };
}
