import { describe, expect, it } from "vitest";
import { DISMISS_MS, onboardingState, type OnboardingInput } from "@/lib/onboarding";

const NOW = new Date("2026-09-12T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const base = (over: Partial<OnboardingInput> = {}): OnboardingInput => ({
  role: "owner",
  userId: "u-1",
  repos: [],
  tokens: [],
  sessions: [],
  activity: [],
  policies: [],
  requestEvents: [],
  attribution: {},
  onboarding: {},
  now: NOW,
  ...over,
});
const repo = (id: string, created_at = ago(3600_000)) => ({ id, full_name: `acme/${id}`, installation_id: 1, created_at, unlinked_at: null });
const step = (s: ReturnType<typeof onboardingState>, id: string) => s.steps.find((x) => x.id === id)!;

describe("onboardingState — repo state", () => {
  it("none: no repo, no request", () => {
    expect(onboardingState(base()).repoState).toBe("none");
  });
  it("requested: an open request and no repo", () => {
    const s = onboardingState(base({ requestEvents: [{ kind: "repo_link_requested", at: ago(60_000), payload: { by: "luke" } }] }));
    expect(s.repoState).toBe("requested");
  });
  it("linked wins over an open request", () => {
    const s = onboardingState(base({ repos: [repo("r1")], requestEvents: [{ kind: "repo_link_requested", at: ago(60_000), payload: {} }] }));
    expect(s.repoState).toBe("linked");
  });
});

describe("onboardingState — blocking is owner-only and narrow", () => {
  it("owner with no repo is blocked on the repo step", () => {
    const s = onboardingState(base());
    expect(s.blocking).toBe(true);
    expect(s.nextStep).toBe("repo");
  });
  it("owner with a pending request is NOT blocked", () => {
    const s = onboardingState(base({ requestEvents: [{ kind: "repo_link_requested", at: ago(60_000), payload: {} }] }));
    expect(s.blocking).toBe(false);
  });
  it("owner with a repo but no rules is blocked on rules", () => {
    const s = onboardingState(base({ repos: [repo("r1")] }));
    expect(s.blocking).toBe(true);
    expect(s.nextStep).toBe("rules");
  });
  it("owner with repo and rules is free, even with no token or session", () => {
    const s = onboardingState(base({ repos: [repo("r1")], policies: [{ repo_id: "r1", rule: "journals" }] }));
    expect(s.blocking).toBe(false);
  });
  it("admins and members are never blocked", () => {
    expect(onboardingState(base({ role: "admin" })).blocking).toBe(false);
    expect(onboardingState(base({ role: "member" })).blocking).toBe(false);
  });
  it("a dismissal lifts the wall for DISMISS_MS and then it returns", () => {
    expect(onboardingState(base({ onboarding: { dismissed_at: ago(DISMISS_MS - 1) } })).blocking).toBe(false);
    expect(onboardingState(base({ onboarding: { dismissed_at: ago(DISMISS_MS + 1) } })).blocking).toBe(true);
  });
});

describe("onboardingState — step evidence", () => {
  it("the token alone completes 'mac'; a session is not required", () => {
    const s = onboardingState(base({ tokens: [{ revoked_at: null }] }));
    expect(step(s, "mac").done).toBe(true);
    expect(step(s, "working").done).toBe(false);
  });
  it("a revoked token does not count", () => {
    expect(step(onboardingState(base({ tokens: [{ revoked_at: ago(1) }] })), "mac").done).toBe(false);
  });
  it("rules needs EVERY linked repo to have policy rows", () => {
    const one = onboardingState(base({ repos: [repo("r1"), repo("r2")], policies: [{ repo_id: "r1", rule: "journals" }] }));
    expect(step(one, "rules").done).toBe(false);
    const both = onboardingState(base({ repos: [repo("r1"), repo("r2")], policies: [{ repo_id: "r1", rule: "journals" }, { repo_id: "r2", rule: "journals" }] }));
    expect(step(both, "rules").done).toBe(true);
  });
  it("'working' needs activity or a session in a LINKED repo", () => {
    const wrongRepo = onboardingState(base({ repos: [repo("r1")], activity: [{ repo_id: "r9" }] }));
    expect(step(wrongRepo, "working").done).toBe(false);
    const right = onboardingState(base({ repos: [repo("r1")], sessions: [{ repo_id: "r1" }] }));
    expect(step(right, "working").done).toBe(true);
  });
});

describe("onboardingState — the teammate view", () => {
  it("a member on a repo-less team is told who they are waiting on", () => {
    const s = onboardingState(base({ role: "member" }));
    expect(step(s, "repo").waitingOn).toBe("your team's owner");
    expect(step(s, "rules").waitingOn).toBe("your team's owner");
  });
  it("attribution rides on steps 2 and 4", () => {
    const s = onboardingState(base({ role: "member", repos: [repo("r1")], policies: [{ repo_id: "r1", rule: "journals" }], attribution: { linked: "luke", rules: "luke" } }));
    expect(step(s, "repo").by).toBe("luke");
    expect(step(s, "rules").by).toBe("luke");
  });
});
