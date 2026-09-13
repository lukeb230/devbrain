# First-Run Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Console-resident walkthrough that takes a new DevBrain user from sign-in to a linked, rule-configured first repo with no terminal and no docs — blocking only the team's owner, and only on the two steps fully in their control.

**Architecture:** Every step derives its completion from real rows (no stored "done"), computed by pure functions in `src/lib/` that the existing vitest suite can test without a database. Thin server code — a loader, three server actions, two route edits, one webhook edit — feeds those functions. The wall mounts in `src/app/desk/layout.tsx` exactly the way `PlanWall` already does, and the same component serves `/desk/onboarding` for voluntary visits.

**Tech Stack:** Next.js 15 App Router (server components + server actions), Supabase (Postgres, service role via `supabaseAdmin()`), Tauri 2 (Rust, `widget/src-tauri`), vitest (`npm test`), `tsc --noEmit` (`npm run typecheck`).

**Spec:** `docs/superpowers/specs/2026-09-12-first-run-onboarding-design.md`

## Global Constraints

- Tests live in `src/lib/__tests__/**/*.test.ts` and run with **no database and no network** (`vitest.config.ts`). Anything touching Supabase is tested by extracting its decision into a pure function; routes and actions stay thin.
- `npm run build` does **not** typecheck tests. Run `npm run typecheck` before every commit.
- Every Desk form includes `<DeskNext />` so server actions return to the Desk, not the dashboard URL (`src/app/desk/desk-next.tsx`).
- Rules text comes only from `RULES_CATALOG` / `FEATURE_CATALOG` in `src/lib/rules-catalog.ts` — never a second copy.
- The wall gates on the **`owner` role only**. `hasRole` is rank-based, so never gate the wall with `hasRole(role, "admin")`.
- The wall replaces `children` on every `/desk` route, so it may not import or link to anything that only renders inside a Desk page.
- A request is **open** for 14 days (`REQUEST_TTL_MS`); a dismissal suppresses the wall for 24 hours (`DISMISS_MS`).
- Preset application writes **all seven** rows per repo, including `enabled: false`, for **every** repo in the installation.
- Never touch `~/Downloads/devbrain` (the frozen FlowSync repo). All work is in `~/Downloads/devbrain-product`.
- Commit messages end with the two attribution trailers used in this repo (see recent `git log`).

## Branch

```bash
cd ~/Downloads/devbrain-product
git checkout docs/first-run-onboarding-design
git checkout -b feat/first-run-onboarding
```

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `src/lib/onboarding-request.ts` | Pure: what an *open* request is (`openRequest`). |
| `src/lib/onboarding.ts` | Pure: the five steps and the blocking decision (`onboardingState`). |
| `src/lib/onboarding-presets.ts` | Pure: the preset table (`presetRows`) and the `solo_green` drift check. |
| `src/lib/github-claim.ts` | Pure: which org an approved, requested installation belongs to (`pickClaimOrg`). |
| `src/lib/onboarding-load.ts` | I/O: fetch the rows and call `onboardingState`. |
| `src/app/desk/onboarding/actions.ts` | Server actions: `applyPreset`, `dismissOnboarding`, `cancelRequest`. |
| `src/app/desk/onboarding/wall.tsx` | The walkthrough (server component). |
| `src/app/desk/onboarding/setup-mac.tsx` | Client: the Set up this Mac button over IPC. |
| `src/app/desk/onboarding/refresh-while.tsx` | Client: re-render every 5 s while a step is still pending. |
| `src/app/desk/onboarding/page.tsx` | The voluntary `/desk/onboarding` route. |
| `supabase/migrations/0042_onboarding.sql` | `org_members.onboarding jsonb`. |
| `src/lib/__tests__/onboarding-request.test.ts` | |
| `src/lib/__tests__/onboarding.test.ts` | |
| `src/lib/__tests__/onboarding-presets.test.ts` | |
| `src/lib/__tests__/github-claim.test.ts` | |

**Modify**

| File | Change |
|---|---|
| `src/lib/desk/repos.ts` | Add `created_at` to `TeamRepo`. |
| `src/lib/surface.ts` | Add `inAppSurface(from)`. |
| `src/app/page.tsx` | `from=desk` gets the bare in-app sign-in. |
| `src/app/sign-in-button.tsx` | Pass `surface` to `start_browser_login`. |
| `src/app/auth/device/start/route.ts` | Carry `surface` through the hand-off. |
| `src/app/auth/device/route.ts` | Land on `/desk` when `surface=desk`. |
| `src/app/api/github/setup/route.ts` | Handle `setup_action=request`; record `repo_linked`; return to `/desk`; `install_owned` via a notice cookie. |
| `src/lib/cookies.ts` | Add `COOKIE.notice` + `NOTICE_COOKIE_OPTS` (one-shot message for the wall). |
| `src/app/api/github/webhook/route.ts` | Claim a requested installation on `installation.created`. |
| `src/app/join/[code]/route.ts` | `solo_green` drift notice on `member_joined`. |
| `src/app/desk/layout.tsx` | Mount `OnboardingWall`; pass the nudge to `DeskNav`. |
| `src/app/desk/nav.tsx` | Render the nudge. |
| `widget/src-tauri/src/setup.rs` | `start_browser_login(surface)`; deep link honours `surface=desk`. |
| `ONBOARDING.md` | Drop the terminal verification; fix the "read-only" claim. |
| `src/lib/__tests__/surface.test.ts` | Cover `inAppSurface`. |

---

### Task 1: Open-request derivation

**Files:**
- Create: `src/lib/onboarding-request.ts`
- Test: `src/lib/__tests__/onboarding-request.test.ts`

**Interfaces:**
- Produces: `REQUEST_TTL_MS`, `type RequestEvent`, `type LinkRow`, `openRequest(events, links, now?) => RequestEvent | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/onboarding-request.test.ts
import { describe, expect, it } from "vitest";
import { openRequest, REQUEST_TTL_MS, type LinkRow, type RequestEvent } from "@/lib/onboarding-request";

const NOW = new Date("2026-09-12T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const req = (at: string, by = "luke"): RequestEvent => ({ kind: "repo_link_requested", at, payload: { by } });
const cancel = (at: string): RequestEvent => ({ kind: "repo_link_cancelled", at, payload: {} });
const link = (created_at: string, unlinked_at: string | null = null): LinkRow => ({ created_at, unlinked_at });

describe("openRequest", () => {
  it("is null with no request at all", () => {
    expect(openRequest([], [], NOW)).toBeNull();
  });

  it("returns a fresh request", () => {
    const r = req(ago(3600_000));
    expect(openRequest([r], [], NOW)).toEqual(r);
  });

  it("picks the most recent request when there are several", () => {
    const old = req(ago(2 * 86_400_000), "a");
    const recent = req(ago(3600_000), "b");
    expect(openRequest([old, recent], [], NOW)).toEqual(recent);
    expect(openRequest([recent, old], [], NOW)).toEqual(recent);
  });

  it("expires after REQUEST_TTL_MS — GitHub never tells us about a denial", () => {
    expect(openRequest([req(ago(REQUEST_TTL_MS + 1))], [], NOW)).toBeNull();
    expect(openRequest([req(ago(REQUEST_TTL_MS - 1))], [], NOW)).not.toBeNull();
  });

  it("a newer cancellation closes it; an older one does not", () => {
    const r = req(ago(3600_000));
    expect(openRequest([r, cancel(ago(60_000))], [], NOW)).toBeNull();
    expect(openRequest([r, cancel(ago(7200_000))], [], NOW)).toEqual(r);
  });

  it("a newer live link closes it; an older or unlinked one does not", () => {
    const r = req(ago(3600_000));
    expect(openRequest([r], [link(ago(60_000))], NOW)).toBeNull();
    expect(openRequest([r], [link(ago(7200_000))], NOW)).toEqual(r);
    expect(openRequest([r], [link(ago(60_000), ago(30_000))], NOW)).toEqual(r);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/onboarding-request.test.ts`
Expected: FAIL — `Cannot find module '@/lib/onboarding-request'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/onboarding-request.ts
// ============================================================================
// "Link a repo" has three states, and the middle one — a GitHub App install
// REQUESTED by someone who is not an org owner — is derived, never stored.
// GitHub sends no webhook when an owner denies a request, so a request must
// expire on its own, and the user must be able to start over.
// ============================================================================

export const REQUEST_TTL_MS = 14 * 86_400_000;

export type RequestEvent = {
  kind: "repo_link_requested" | "repo_link_cancelled";
  at: string;
  payload: { by?: string };
};

export type LinkRow = { created_at: string; unlinked_at: string | null };

const ms = (iso: string) => new Date(iso).getTime();

/** The org's open request, or null. Pure — callers pass the rows. */
export function openRequest(events: RequestEvent[], links: LinkRow[], now = new Date()): RequestEvent | null {
  const requests = events.filter((e) => e.kind === "repo_link_requested").sort((a, b) => ms(b.at) - ms(a.at));
  const latest = requests[0];
  if (!latest) return null;
  const at = ms(latest.at);
  if (now.getTime() - at > REQUEST_TTL_MS) return null;
  if (events.some((e) => e.kind === "repo_link_cancelled" && ms(e.at) > at)) return null;
  if (links.some((l) => l.unlinked_at === null && ms(l.created_at) > at)) return null;
  return latest;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/onboarding-request.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding-request.ts src/lib/__tests__/onboarding-request.test.ts
git commit -m "Onboarding: derive an open repo-link request from events"
```

---

### Task 2: The five steps and the blocking decision

**Files:**
- Create: `src/lib/onboarding.ts`
- Modify: `src/lib/desk/repos.ts:9-25` (add `created_at`)
- Test: `src/lib/__tests__/onboarding.test.ts`

**Interfaces:**
- Consumes: `openRequest`, `RequestEvent`, `LinkRow` from Task 1
- Produces: `DISMISS_MS`, `type StepId`, `type RepoState`, `type Step`, `type OnboardingInput`, `type OnboardingState`, `onboardingState(input) => OnboardingState`
- `TeamRepo` gains `created_at: string`

- [ ] **Step 1: Add `created_at` to `TeamRepo`**

In `src/lib/desk/repos.ts` change the interface and the select:

```ts
export interface TeamRepo {
  id: string;
  full_name: string;
  default_branch: string | null;
  installation_id: number | null;
  created_at: string;
}

export const teamRepos = cache(async (orgId: string): Promise<TeamRepo[]> => {
  const { data } = await supabaseAdmin()
    .from("linked_repos")
    .select("id, full_name, default_branch, installation_id, created_at")
    .eq("org_id", orgId)
    .is("unlinked_at", null)
    .order("created_at");
  return (data ?? []) as TeamRepo[];
});
```

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/__tests__/onboarding.test.ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/onboarding.test.ts`
Expected: FAIL — `Cannot find module '@/lib/onboarding'`

- [ ] **Step 4: Write minimal implementation**

```ts
// src/lib/onboarding.ts
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

  const nextStep = ORDER.find((id) => !steps.find((s) => s.id === id)!.done) ?? null;
  return { steps, repoState, blocking, dismissed, nextStep, complete: nextStep === null };
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/lib/__tests__/onboarding.test.ts && npm run typecheck`
Expected: PASS (15 tests); typecheck clean. The `created_at` field is additive, so existing `teamRepos` callers are unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/lib/onboarding.ts src/lib/desk/repos.ts src/lib/__tests__/onboarding.test.ts
git commit -m "Onboarding: derive the five steps and the owner-only wall from rows"
```

---

### Task 3: Presets and the solo_green drift check

**Files:**
- Create: `src/lib/onboarding-presets.ts`
- Test: `src/lib/__tests__/onboarding-presets.test.ts`

**Interfaces:**
- Produces: `type Preset = "solo" | "team"`, `PRESET_RULES`, `presetRows(preset, { hasBrainDocs }) => { rule; enabled }[]`, `soloGreenDrift(policies) => string[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/onboarding-presets.test.ts
import { describe, expect, it } from "vitest";
import { PRESET_RULES, presetRows, soloGreenDrift } from "@/lib/onboarding-presets";
import { FEATURE_CATALOG, RULES_CATALOG } from "@/lib/rules-catalog";

const on = (rows: { rule: string; enabled: boolean }[]) => rows.filter((r) => r.enabled).map((r) => r.rule).sort();
const off = (rows: { rule: string; enabled: boolean }[]) => rows.filter((r) => !r.enabled).map((r) => r.rule).sort();

describe("presetRows", () => {
  it("writes exactly seven rows, every preset rule, including the false ones", () => {
    for (const p of ["solo", "team"] as const) {
      const rows = presetRows(p, { hasBrainDocs: false });
      expect(rows).toHaveLength(7);
      expect(rows.map((r) => r.rule).sort()).toEqual([...PRESET_RULES].sort());
    }
  });

  it("solo: no_self_approve off, solo_green on", () => {
    const rows = presetRows("solo", { hasBrainDocs: false });
    expect(on(rows)).toEqual(["collision_check", "journals", "no_conflict_pr", "pr_only_main", "solo_green"]);
    expect(off(rows)).toEqual(["brain_updates_required", "no_self_approve"]);
  });

  it("team: no_self_approve on, solo_green off", () => {
    const rows = presetRows("team", { hasBrainDocs: false });
    expect(on(rows)).toEqual(["collision_check", "journals", "no_conflict_pr", "no_self_approve", "pr_only_main"]);
    expect(off(rows)).toEqual(["brain_updates_required", "solo_green"]);
  });

  it("brain_updates_required follows detection, in both presets", () => {
    for (const p of ["solo", "team"] as const) {
      expect(presetRows(p, { hasBrainDocs: true }).find((r) => r.rule === "brain_updates_required")?.enabled).toBe(true);
      expect(presetRows(p, { hasBrainDocs: false }).find((r) => r.rule === "brain_updates_required")?.enabled).toBe(false);
    }
  });

  it("never touches a writer_* switch, and every preset rule exists in the catalogue", () => {
    const known = new Set([...RULES_CATALOG, ...FEATURE_CATALOG].map((c) => c.rule));
    for (const rule of PRESET_RULES) {
      expect(rule.startsWith("writer_")).toBe(false);
      expect(known.has(rule)).toBe(true);
    }
  });
});

describe("soloGreenDrift", () => {
  it("names the repos where solo_green is on", () => {
    const repos = soloGreenDrift([
      { repo_id: "r1", rule: "solo_green", enabled: true },
      { repo_id: "r2", rule: "solo_green", enabled: false },
      { repo_id: "r3", rule: "journals", enabled: true },
    ]);
    expect(repos).toEqual(["r1"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/onboarding-presets.test.ts`
Expected: FAIL — `Cannot find module '@/lib/onboarding-presets'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/onboarding-presets.ts
// ============================================================================
// The two first-run presets. Both write ALL seven rows explicitly — including
// the false ones — so "decided" is distinguishable from "never saw it".
// The three writer_* switches are deliberately absent: granting DevBrain
// write access to a repo is a decision for the Rules page, not minute three.
// ============================================================================

export type Preset = "solo" | "team";

export const PRESET_RULES = [
  "collision_check",
  "pr_only_main",
  "no_conflict_pr",
  "journals",
  "no_self_approve",
  "solo_green",
  "brain_updates_required",
] as const;
export type PresetRule = (typeof PRESET_RULES)[number];

const TABLE: Record<Preset, Record<Exclude<PresetRule, "brain_updates_required">, boolean>> = {
  solo: { collision_check: true, pr_only_main: true, no_conflict_pr: true, journals: true, no_self_approve: false, solo_green: true },
  team: { collision_check: true, pr_only_main: true, no_conflict_pr: true, journals: true, no_self_approve: true, solo_green: false },
};

export function presetRows(preset: Preset, opts: { hasBrainDocs: boolean }): { rule: PresetRule; enabled: boolean }[] {
  return PRESET_RULES.map((rule) => ({
    rule,
    enabled: rule === "brain_updates_required" ? opts.hasBrainDocs : TABLE[preset][rule],
  }));
}

/** Repos where solo_green is on — a team that just grew should be told. */
export function soloGreenDrift(policies: { repo_id: string; rule: string; enabled: boolean }[]): string[] {
  return policies.filter((p) => p.rule === "solo_green" && p.enabled).map((p) => p.repo_id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/onboarding-presets.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding-presets.ts src/lib/__tests__/onboarding-presets.test.ts
git commit -m "Onboarding: solo and team presets, seven explicit rows each"
```

---

### Task 4: Which org an approved request belongs to

**Files:**
- Create: `src/lib/github-claim.ts`
- Test: `src/lib/__tests__/github-claim.test.ts`

**Interfaces:**
- Consumes: `openRequest`, `RequestEvent`, `LinkRow` from Task 1
- Produces: `pickClaimOrg({ requesterLogin, members, eventsByOrg, linksByOrg, now? }) => string | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/github-claim.test.ts
import { describe, expect, it } from "vitest";
import { pickClaimOrg } from "@/lib/github-claim";
import type { RequestEvent } from "@/lib/onboarding-request";

const NOW = new Date("2026-09-12T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const req = (at: string): RequestEvent => ({ kind: "repo_link_requested", at, payload: { by: "luke" } });

describe("pickClaimOrg", () => {
  it("claims for the org with the requester's open request", () => {
    const org = pickClaimOrg({
      requesterLogin: "luke",
      members: [{ org_id: "org-a", github_login: "luke" }],
      eventsByOrg: { "org-a": [req(ago(60_000))] },
      linksByOrg: {},
      now: NOW,
    });
    expect(org).toBe("org-a");
  });

  it("two teams for one login: the most recent open request wins", () => {
    const org = pickClaimOrg({
      requesterLogin: "luke",
      members: [{ org_id: "org-a", github_login: "luke" }, { org_id: "org-b", github_login: "luke" }],
      eventsByOrg: { "org-a": [req(ago(3600_000))], "org-b": [req(ago(60_000))] },
      linksByOrg: {},
      now: NOW,
    });
    expect(org).toBe("org-b");
  });

  it("a closed request does not re-claim", () => {
    const org = pickClaimOrg({
      requesterLogin: "luke",
      members: [{ org_id: "org-a", github_login: "luke" }],
      eventsByOrg: { "org-a": [req(ago(3600_000))] },
      linksByOrg: { "org-a": [{ created_at: ago(60_000), unlinked_at: null }] },
      now: NOW,
    });
    expect(org).toBeNull();
  });

  it("never claims for a team the requester is not a member of", () => {
    const org = pickClaimOrg({
      requesterLogin: "mallory",
      members: [{ org_id: "org-a", github_login: "luke" }],
      eventsByOrg: { "org-a": [req(ago(60_000))] },
      linksByOrg: {},
      now: NOW,
    });
    expect(org).toBeNull();
  });

  it("login matching is case-insensitive, as GitHub logins are", () => {
    const org = pickClaimOrg({
      requesterLogin: "Luke",
      members: [{ org_id: "org-a", github_login: "luke" }],
      eventsByOrg: { "org-a": [req(ago(60_000))] },
      linksByOrg: {},
      now: NOW,
    });
    expect(org).toBe("org-a");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/github-claim.test.ts`
Expected: FAIL — `Cannot find module '@/lib/github-claim'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/github-claim.ts
// ============================================================================
// When an org owner approves a REQUESTED GitHub App install, GitHub fires
// installation.created with a `requester`, and nobody passes back through
// /api/github/setup — the only place an installation is normally claimed.
// This decides which org the installation belongs to, from rows: the
// requester's most recent OPEN request. No open request → stay unclaimed.
// ============================================================================

import { openRequest, type LinkRow, type RequestEvent } from "./onboarding-request";

export function pickClaimOrg(args: {
  requesterLogin: string;
  members: { org_id: string; github_login: string | null }[];
  eventsByOrg: Record<string, RequestEvent[]>;
  linksByOrg: Record<string, LinkRow[]>;
  now?: Date;
}): string | null {
  const login = args.requesterLogin.toLowerCase();
  const orgs = [...new Set(args.members.filter((m) => (m.github_login ?? "").toLowerCase() === login).map((m) => m.org_id))];
  let best: { orgId: string; at: number } | null = null;
  for (const orgId of orgs) {
    const open = openRequest(args.eventsByOrg[orgId] ?? [], args.linksByOrg[orgId] ?? [], args.now);
    if (!open) continue;
    const at = new Date(open.at).getTime();
    if (!best || at > best.at) best = { orgId, at };
  }
  return best?.orgId ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/github-claim.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/github-claim.ts src/lib/__tests__/github-claim.test.ts
git commit -m "Onboarding: decide which org an approved App request belongs to"
```

---

### Task 5: `setup_action=request` in the setup route

**Files:**
- Modify: `src/app/api/github/setup/route.ts:9-12`, `:41`, `:118`
- Modify: `src/lib/cookies.ts:6-11`, `:19`, `:22-26`

**Interfaces:**
- Consumes: nothing new — writes the `repo_link_requested` event Task 1 reads.
- Produces: the request event `{ kind: "repo_link_requested", payload: { by: <login> } }`; a `repo_linked` event `{ payload: { by: <login>, installation_id } }` on success (Task 8 reads it for "Linked by …"); `COOKIE.notice` / `NOTICE_COOKIE_OPTS` (Task 10 reads the cookie, Task 9 renders it). Both success paths return to `/desk`, where the wall or the Console renders.

- [ ] **Step 1: Replace the silent bounce**

At the top of `GET` in `src/app/api/github/setup/route.ts`, replace

```ts
  const installationId = Number(searchParams.get("installation_id"));
  if (!installationId) return NextResponse.redirect(`${origin}/desk/team`);
```

with

```ts
  const installationId = Number(searchParams.get("installation_id"));
  const setupAction = searchParams.get("setup_action");

  // A developer who is not a GitHub org owner cannot install the App; GitHub
  // records a REQUEST and sends them here with setup_action=request and no
  // installation_id. Record it as an event so "requested" can be derived
  // (src/lib/onboarding-request.ts) and the walkthrough can show the wait.
  if (!installationId && setupAction === "request") {
    const supabaseR = await supabaseServer();
    const { data: { user: requester } } = await supabaseR.auth.getUser();
    if (!requester) return NextResponse.redirect(`${origin}/`);
    const ctxR = await currentOrg();
    if (!ctxR) return NextResponse.redirect(`${origin}/welcome`);
    if (!hasRole(ctxR.role, "admin")) return NextResponse.redirect(`${origin}${withError("/desk", "link_repo_admin")}`);
    await supabaseAdmin().from("events").insert({
      org_id: ctxR.orgId, repo_id: null, kind: "repo_link_requested", payload: { by: ctxR.login },
    });
    return NextResponse.redirect(`${origin}/desk?requested=1`);
  }
  if (!installationId) return NextResponse.redirect(`${origin}/desk`);
```

- [ ] **Step 2: A one-shot notice cookie for the wall**

The wall is rendered by a layout, and layouts cannot read `?error=`. This repo already passes one-shot values through short-lived cookies (`COOKIE.newToken`, `NEW_TOKEN_COOKIE_OPTS`), so do the same. In `src/lib/cookies.ts` add to the `COOKIE` object:

```ts
  notice: "devbrain_notice",     // one-shot message for the onboarding wall (60 s)
```

add after `NEW_TOKEN_COOKIE_OPTS`:

```ts
export const NOTICE_COOKIE_OPTS = { ...base, path: "/desk", maxAge: 60 };
```

and add `{ name: COOKIE.notice, path: "/desk" }` to `ALL_DEVBRAIN_COOKIES`.

- [ ] **Step 3: `install_owned` reaches the wall; success records who linked and returns to the Console**

In `src/app/api/github/setup/route.ts` add `import { COOKIE, NOTICE_COOKIE_OPTS } from "@/lib/cookies";`. Replace the `install_owned` redirect

```ts
    return NextResponse.redirect(`${origin}${withError("/desk", "install_owned")}`);
```

with

```ts
    const res = NextResponse.redirect(`${origin}/desk`);
    res.cookies.set(COOKIE.notice, "install_owned", NOTICE_COOKIE_OPTS);
    return res;
```

Then, just before the final redirect, record the actor so the teammate view can say "Linked by …", and return to the Console rather than the Team page:

```ts
  await admin.from("events").insert({ org_id: membership.org_id, repo_id: null, kind: "repo_linked", payload: { by: ctx.login, installation_id: installationId } });
  return NextResponse.redirect(`${origin}/desk?linked=1`);
```

(This replaces `return NextResponse.redirect(\`${origin}/desk/team?linked=1\`);`.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean. (`supabaseServer`, `currentOrg`, `hasRole`, `withError`, `supabaseAdmin` are already imported in this file.)

- [ ] **Step 5: Verify by hand**

The route needs a session cookie, so verify the shape rather than the auth: with the dev server running (`npm run dev`) and signed in as an admin in a browser, open
`http://localhost:3000/api/github/setup?setup_action=request`
Expected: redirect to `/desk?requested=1`, and one new row:

```sql
select kind, payload, at from events where kind = 'repo_link_requested' order by at desc limit 1;
```

Then clean it up: `delete from events where kind = 'repo_link_requested' and payload->>'by' = '<your login>';`

- [ ] **Step 6: Commit**

```bash
git add src/app/api/github/setup/route.ts src/lib/cookies.ts
git commit -m "GitHub setup: record requested and completed installs; install_owned reaches the wall"
```

---

### Task 6: Claim a requested installation in the webhook

**Files:**
- Modify: `src/app/api/github/webhook/route.ts:45-56`

**Interfaces:**
- Consumes: `pickClaimOrg` from Task 4
- Produces: on success the `installations` row gains `org_id`, `upsertRepo` runs for the payload's repos, and the resulting `linked_repos` rows close the request. On no match: an `events` row `{ kind: "error", payload: { where: "setup:unmatched_request", requester, installation_id } }`.

- [ ] **Step 1: Add the import**

At the top of `src/app/api/github/webhook/route.ts`:

```ts
import { pickClaimOrg } from "@/lib/github-claim";
import type { RequestEvent, LinkRow } from "@/lib/onboarding-request";
```

- [ ] **Step 2: Claim before the existing upsert**

Replace the `created` branch

```ts
        if (payload.action === "created") {
          await admin.from("installations").upsert({
            id: inst.id,
            account_login: inst.account.login,
            account_type: inst.account.type,
          });
```

with

```ts
        if (payload.action === "created") {
          // Approved REQUEST: nobody will pass back through /api/github/setup
          // to claim this, so claim it here for the requester's open request.
          // An install by an org owner has no requester and takes the normal
          // path (claimed by the setup redirect).
          let claimedOrg: string | null = null;
          const requester: string | undefined = payload.requester?.login;
          if (requester) {
            const { data: existing } = await admin.from("installations").select("org_id").eq("id", inst.id).maybeSingle();
            if (!existing?.org_id) {
              const { data: members } = await admin.from("org_members").select("org_id, github_login").ilike("github_login", requester);
              const orgIds = [...new Set((members ?? []).map((m) => m.org_id as string))];
              const eventsByOrg: Record<string, RequestEvent[]> = {};
              const linksByOrg: Record<string, LinkRow[]> = {};
              if (orgIds.length) {
                const [{ data: evs }, { data: links }] = await Promise.all([
                  admin.from("events").select("org_id, kind, at, payload").in("org_id", orgIds).in("kind", ["repo_link_requested", "repo_link_cancelled"]).order("at", { ascending: false }).limit(200),
                  admin.from("linked_repos").select("org_id, created_at, unlinked_at").in("org_id", orgIds),
                ]);
                for (const e of evs ?? []) (eventsByOrg[e.org_id as string] ??= []).push(e as RequestEvent);
                for (const l of links ?? []) (linksByOrg[l.org_id as string] ??= []).push(l as LinkRow);
              }
              claimedOrg = pickClaimOrg({ requesterLogin: requester, members: (members ?? []) as { org_id: string; github_login: string | null }[], eventsByOrg, linksByOrg });
              if (!claimedOrg) {
                await admin.from("events").insert({ org_id: null, repo_id: null, kind: "error", payload: { where: "setup:unmatched_request", requester, installation_id: inst.id } });
              }
            }
          }
          await admin.from("installations").upsert({
            id: inst.id,
            account_login: inst.account.login,
            account_type: inst.account.type,
            ...(claimedOrg ? { org_id: claimedOrg } : {}),
          });
```

The existing loop that follows (`for (const r of payload.repositories ?? []) await upsertRepo(admin, inst.id, r);`) now finds `org_id` set and links the repos.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Verify with a replayed payload**

The webhook verifies `X-Hub-Signature-256`, so use GitHub's own **Redeliver** button on a real `installation.created` delivery (Settings → Developer settings → GitHub Apps → DevBrain → Advanced → Recent Deliveries) after seeding a request event for your team:

```sql
insert into events (org_id, repo_id, kind, payload) values ('<your org id>', null, 'repo_link_requested', '{"by":"<your login>"}');
```

Expected after redelivery: `select org_id from installations where id = <installation id>` is your org, and the repo appears in `linked_repos`. Remove the seeded event afterwards.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/github/webhook/route.ts
git commit -m "GitHub webhook: claim an approved requested install for the requester's team"
```

---

### Task 7: Migration and the three server actions

**Files:**
- Create: `supabase/migrations/0042_onboarding.sql`
- Create: `src/app/desk/onboarding/actions.ts`

**Interfaces:**
- Consumes: `presetRows`, `type Preset` (Task 3); `requireRoleOrRedirect`, `currentOrg`, `withError` from `@/lib/org`; `returnTo` from `@/lib/surface`
- Produces: server actions `applyPreset(formData)`, `dismissOnboarding(formData)`, `cancelRequest(formData)`; column `org_members.onboarding jsonb`

Form fields: `applyPreset` reads `installationId`, `preset` (`solo`|`team`), `next`. `cancelRequest` reads `next`. `dismissOnboarding` reads nothing.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0042_onboarding.sql
-- First-run onboarding keeps only what cannot be derived from other rows:
--   { dismissed_at, preset }. Gating reads dismissed_at alone; every step's
--   completion is computed from linked_repos / dev_tokens / policies /
--   sessions / activity / events (src/lib/onboarding.ts).
alter table org_members add column if not exists onboarding jsonb not null default '{}'::jsonb;
```

- [ ] **Step 2: Apply it**

Run: `cd ~/Downloads/devbrain-product && npx supabase db push` (or apply through the Supabase MCP `apply_migration` with name `0042_onboarding`).
Verify: `select column_name from information_schema.columns where table_name='org_members' and column_name='onboarding';` returns one row.

- [ ] **Step 3: Write the actions**

```ts
// src/app/desk/onboarding/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { presetRows, type Preset } from "@/lib/onboarding-presets";
import { currentOrg, requireRoleOrRedirect } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase/server";
import { returnTo } from "@/lib/surface";

// Rules change what every teammate's Claude does — admins and owners only,
// same guard as toggleRule (src/app/dashboard/[repoId]/rules/actions.ts).
// Applies to EVERY repo in the installation: a preset on one repo would
// leave the others in the journals-off / solo_green-off trap.
export async function applyPreset(formData: FormData): Promise<void> {
  const installationId = Number(formData.get("installationId") || 0);
  const raw = String(formData.get("preset") || "");
  const preset: Preset | null = raw === "solo" || raw === "team" ? raw : null;
  const back = returnTo(formData, "/desk");
  if (!installationId || !preset) redirect(back);
  const me = await requireRoleOrRedirect("admin", back);
  const admin = supabaseAdmin();

  const { data: repos } = await admin
    .from("linked_repos")
    .select("id")
    .eq("org_id", me.orgId)
    .eq("installation_id", installationId)
    .is("unlinked_at", null);
  const now = new Date().toISOString();
  for (const r of repos ?? []) {
    // Brain detection: docs already indexed for this repo. Unknown → off.
    const { count } = await admin.from("memory_index").select("repo_id", { count: "exact", head: true }).eq("repo_id", r.id).eq("kind", "brain");
    const rows = presetRows(preset, { hasBrainDocs: (count ?? 0) > 0 });
    await admin.from("policies").upsert(
      rows.map((x) => ({ org_id: me.orgId, repo_id: r.id, rule: x.rule, enabled: x.enabled, updated_at: now })),
      { onConflict: "repo_id,rule" },
    );
    await admin.from("events").insert({ org_id: me.orgId, repo_id: r.id, kind: "rule_change", payload: { preset, by: me.login } });
  }
  await mergeOnboarding(me.orgId, me.userId, { preset });
  revalidatePath("/desk");
  redirect(back);
}

// Any role may dismiss: the wall only ever shows to the owner, but the nudge
// shows to everyone, and "not now" must always be available.
export async function dismissOnboarding(): Promise<void> {
  const me = await currentOrg();
  if (!me) redirect("/welcome");
  await mergeOnboarding(me.orgId, me.userId, { dismissed_at: new Date().toISOString() });
  revalidatePath("/desk");
  redirect("/desk");
}

// "Start over" on a pending request: GitHub never tells us about a denial.
export async function cancelRequest(formData: FormData): Promise<void> {
  const back = returnTo(formData, "/desk");
  const me = await requireRoleOrRedirect("admin", back);
  await supabaseAdmin().from("events").insert({ org_id: me.orgId, repo_id: null, kind: "repo_link_cancelled", payload: { by: me.login } });
  revalidatePath("/desk");
  redirect(back);
}

// Read-modify-write on the jsonb column; the row is keyed (org_id, user_id).
async function mergeOnboarding(orgId: string, userId: string, patch: Record<string, unknown>): Promise<void> {
  const admin = supabaseAdmin();
  const { data } = await admin.from("org_members").select("onboarding").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
  const current = (data?.onboarding as Record<string, unknown> | null) ?? {};
  await admin.from("org_members").update({ onboarding: { ...current, ...patch } }).eq("org_id", orgId).eq("user_id", userId);
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0042_onboarding.sql src/app/desk/onboarding/actions.ts
git commit -m "Onboarding: preset, dismiss and start-over actions; org_members.onboarding column"
```

---

### Task 8: The loader

**Files:**
- Create: `src/lib/onboarding-load.ts`

**Interfaces:**
- Consumes: `onboardingState`, `OnboardingInput`, `OnboardingState` (Task 2); `OrgContext` from `@/lib/org`; `TeamRepo` (Task 2)
- Produces: `loadOnboarding(org: OrgContext, repos: TeamRepo[]) => Promise<OnboardingState & { openRequestBy: string | null }>`

- [ ] **Step 1: Write the loader**

```ts
// src/lib/onboarding-load.ts
import { cache } from "react";
import { onboardingState, type OnboardingState } from "@/lib/onboarding";
import { openRequest, type RequestEvent } from "@/lib/onboarding-request";
import type { OrgContext } from "@/lib/org";
import type { TeamRepo } from "@/lib/desk/repos";
import { supabaseAdmin } from "@/lib/supabase/server";

// Fetch the rows the pure function needs, once per request. The layout and
// the voluntary page both call this; react's cache() dedupes them.
export const loadOnboarding = cache(async (org: OrgContext, repos: TeamRepo[]): Promise<OnboardingState & { openRequestBy: string | null }> => {
  const admin = supabaseAdmin();
  const repoIds = repos.map((r) => r.id);
  const [{ data: tokens }, { data: sessions }, { data: activity }, { data: policies }, { data: events }, { data: me }, { data: linkEvents }] = await Promise.all([
    admin.from("dev_tokens").select("revoked_at").eq("org_id", org.orgId).eq("user_id", org.userId),
    admin.from("sessions").select("repo_id").eq("org_id", org.orgId).eq("user_id", org.userId).order("started_at", { ascending: false }).limit(20),
    admin.from("activity").select("repo_id").eq("org_id", org.orgId).eq("user_id", org.userId).order("at", { ascending: false }).limit(20),
    repoIds.length ? admin.from("policies").select("repo_id, rule").in("repo_id", repoIds) : Promise.resolve({ data: [] as { repo_id: string; rule: string }[] }),
    admin.from("events").select("kind, at, payload").eq("org_id", org.orgId).in("kind", ["repo_link_requested", "repo_link_cancelled"]).order("at", { ascending: false }).limit(50),
    admin.from("org_members").select("onboarding").eq("org_id", org.orgId).eq("user_id", org.userId).maybeSingle(),
    // Attribution for the teammate view: who linked (repo_linked, written by
    // the setup route), who chose rules (rule_change, written by applyPreset).
    admin.from("events").select("kind, payload").eq("org_id", org.orgId).in("kind", ["repo_linked", "rule_change"]).order("at", { ascending: false }).limit(20),
  ]);

  const requestEvents = (events ?? []) as RequestEvent[];
  const open = openRequest(requestEvents, repos.map((r) => ({ created_at: r.created_at, unlinked_at: null })));
  const state = onboardingState({
    role: org.role,
    userId: org.userId,
    repos: repos.map((r) => ({ id: r.id, full_name: r.full_name, installation_id: r.installation_id, created_at: r.created_at, unlinked_at: null })),
    tokens: (tokens ?? []) as { revoked_at: string | null }[],
    sessions: (sessions ?? []) as { repo_id: string | null }[],
    activity: (activity ?? []) as { repo_id: string | null }[],
    policies: (policies ?? []) as { repo_id: string; rule: string }[],
    requestEvents,
    attribution: {
      linked: ((linkEvents ?? []).find((e) => e.kind === "repo_linked")?.payload as { by?: string } | undefined)?.by ?? null,
      rules: ((linkEvents ?? []).find((e) => e.kind === "rule_change")?.payload as { by?: string } | undefined)?.by ?? null,
    },
    onboarding: ((me?.onboarding as { dismissed_at?: string | null; preset?: string | null } | null) ?? {}),
  });
  return { ...state, openRequestBy: open?.payload.by ?? null };
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/onboarding-load.ts
git commit -m "Onboarding: load the rows and derive the state once per request"
```

---

### Task 9: The wall

**Files:**
- Create: `src/app/desk/onboarding/setup-mac.tsx`
- Create: `src/app/desk/onboarding/refresh-while.tsx`
- Create: `src/app/desk/onboarding/wall.tsx`

**Interfaces:**
- Consumes: `OnboardingState`, `Step`, `StepId` (Task 2); actions (Task 7); `RULES_CATALOG`, `FEATURE_CATALOG`, `RuleDef`; `toggleRule` from `@/app/dashboard/[repoId]/rules/actions`; `Switch` from `@/app/desk/ui` (the same export `src/app/desk/(team)/rules/page.tsx` uses); `DeskNext`; `TeamRepo`
- Produces: `OnboardingWall({ org, repos, state, appSlug, openRequestBy, policies, notice })` — a server component that owns its whole surface and imports nothing from a Desk page. `policies` is `Record<\`${repo_id}:${rule}\`, boolean>`; `notice` is the one-shot code from `COOKIE.notice` or null.

- [ ] **Step 1: The Set up this Mac button (client)**

Mirrors `src/app/desk/mac/mac-settings.tsx:93-107`, which is the existing IPC contract.

```tsx
// src/app/desk/onboarding/setup-mac.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Core = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
type Setup = { bootstrap_ok?: boolean | null; bootstrap_failed?: string[]; bootstrap_at?: string | null; configured?: boolean };

const core = (): Core | null => (window as unknown as { __TAURI__?: { core?: Core } }).__TAURI__?.core ?? null;

// One click: the app mints a token this user never sees and installs the
// CLI, plugin and hooks (setup::bootstrap in widget/src-tauri/src/setup.rs).
// Gating on the server reads only the token; this shows the local ✓/✗ list.
export function SetupMac({ done }: { done: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [bridge, setBridge] = useState<boolean | null>(null);

  useEffect(() => {
    const c = core();
    setBridge(Boolean(c));
    c?.invoke("setup_state").then((s) => setSetup(s as Setup)).catch(() => {});
  }, []);

  async function run() {
    const c = core();
    if (!c) return;
    setBusy(true); setErr(null);
    try {
      await c.invoke("bootstrap", { server: window.location.origin, token: null, remindersList: null, remindersRepo: null });
      setSetup((await c.invoke("setup_state")) as Setup);
      router.refresh();
    } catch (e) {
      setErr(String(e).slice(0, 200));
    } finally {
      setBusy(false);
    }
  }

  if (bridge === false) {
    return <p className="text-[12.5px] text-muted">Open this page inside the DevBrain app to set up this Mac.</p>;
  }
  const failed = setup?.bootstrap_failed ?? [];
  return (
    <div>
      <button type="button" onClick={run} disabled={busy} className="rounded-lg bg-accent2 px-3.5 py-[9px] text-[12.5px] font-semibold text-white disabled:opacity-60">
        {busy ? "Setting up…" : done ? "Re-run setup" : "Set up this Mac"}
      </button>
      {setup?.bootstrap_at && (
        <p className="mt-2 text-[12.5px] text-muted">
          {setup.bootstrap_ok === false ? `${failed.join(", ") || "a part"} failed — re-running is safe and only fixes what's missing.` : "All parts installed."}
        </p>
      )}
      {err && <p className="mt-2 text-[12.5px] text-stop">{err}</p>}
    </div>
  );
}
```

- [ ] **Step 2: The re-render loop (client)**

```tsx
// src/app/desk/onboarding/refresh-while.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The it's-working check must flip on its own the moment a session is seen —
// the user should never type a command to find out. Re-render every 5 s
// while `active`; the server re-derives the state each time.
export function RefreshWhile({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
```

- [ ] **Step 3: The wall (server component)**

```tsx
// src/app/desk/onboarding/wall.tsx
import { DeskNext } from "@/app/desk/desk-next";
import { toggleRule } from "@/app/dashboard/[repoId]/rules/actions";
import { Switch } from "@/app/desk/ui";
import type { TeamRepo } from "@/lib/desk/repos";
import type { OnboardingState, Step, StepId } from "@/lib/onboarding";
import { hasRole, type OrgContext } from "@/lib/org";
import { FEATURE_CATALOG, RULES_CATALOG, type RuleDef } from "@/lib/rules-catalog";
import { applyPreset, cancelRequest, dismissOnboarding } from "./actions";
import { RefreshWhile } from "./refresh-while";
import { SetupMac } from "./setup-mac";

// ============================================================================
// The first-run walkthrough. Mounted by desk/layout.tsx INSTEAD of children
// for an owner with essentials incomplete (mirrors PlanWall), and by
// /desk/onboarding for anyone. Self-contained: it replaces every Desk route,
// so it may not depend on /desk/team or /desk/mac — the install link, the
// Set up this Mac trigger and the preset action all live here.
// ============================================================================

const TITLES: Record<StepId, string> = {
  team: "Your team",
  repo: "Link a repository",
  mac: "Set up this Mac",
  rules: "Choose the rules",
  working: "It's working",
};

const PRESET_RULE_IDS = new Set(["collision_check", "pr_only_main", "no_conflict_pr", "journals", "no_self_approve", "solo_green", "brain_updates_required"]);

const NOTICES: Record<string, string> = {
  install_owned: "That repository's GitHub App installation already belongs to another DevBrain team. Pick a different repository, or ask that team to unlink it first.",
};

export function OnboardingWall({ org, repos, state, appSlug, openRequestBy, policies, notice }: {
  org: OrgContext;
  repos: TeamRepo[];
  state: OnboardingState;
  appSlug: string;
  openRequestBy: string | null;
  /** Current values for Customise; keyed `${repo_id}:${rule}`. */
  policies: Record<string, boolean>;
  /** One-shot code from COOKIE.notice (Task 5), e.g. "install_owned". */
  notice: string | null;
}) {
  const isOwner = org.role === "owner";
  const isAdmin = hasRole(org.role, "admin");
  const repoStep = state.steps.find((s) => s.id === "repo")!;
  const installUrl = `https://github.com/apps/${appSlug}/installations/new`;
  const requestLink = `https://github.com/apps/${appSlug}`;
  const pendingOrWorking = state.repoState === "requested" || (!state.steps.find((s) => s.id === "working")!.done && repos.length > 0);

  return (
    <main className="min-w-0 flex-1 overflow-y-auto px-10 pb-12 pt-10">
      <RefreshWhile active={pendingOrWorking} />
      <div className="mx-auto max-w-[720px]">
        <h1 className="font-display text-[32px] font-medium tracking-[-.02em] text-txt">
          {state.complete ? "You're set up" : isOwner ? `Let's set up ${org.orgName}` : `Welcome to ${org.orgName}`}
        </h1>
        <p className="mt-2 max-w-[60ch] text-[13.5px] leading-[1.6] text-muted">
          {isOwner
            ? "Two things only you can do — link a repository and choose its rules — then the rest is your Mac and your editor."
            : "Your admin has the team side covered. What's left is your Mac and your editor."}
        </p>

        {notice && NOTICES[notice] && (
          <p className="mt-6 rounded-[10px] border border-[var(--wg-stop-line)] bg-[var(--wg-stop-bg)] px-4 py-3 text-[13px] text-stop">{NOTICES[notice]}</p>
        )}

        {state.repoState === "requested" && (
          <div className="mt-6 rounded-[10px] border border-[var(--wg-wait-line)] bg-[var(--wg-wait-bg)] px-4 py-3 text-[13px] text-wait">
            <div className="font-semibold">Waiting on your GitHub org owner to approve DevBrain{openRequestBy ? ` (requested by ${openRequestBy})` : ""}.</div>
            <div className="mt-1 text-[12.5px]">Send them this link: <code className="rounded bg-row2 px-1 font-mono text-[11px] text-txt">{requestLink}</code>. This page updates itself when they approve.</div>
            {isAdmin && (
              <form action={cancelRequest} className="mt-2"><DeskNext />
                <button className="text-[12px] font-semibold text-accent hover:underline">Start over</button>
              </form>
            )}
          </div>
        )}

        <ol className="mt-8">
          {state.steps.map((s, n) => (
            <li key={s.id} className="grid grid-cols-[32px_1fr] gap-4 border-t border-line py-[18px]">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold ${s.done ? "bg-go text-white" : "border border-line2 text-txt"}`}>{s.done ? "✓" : n + 1}</span>
              <div className="min-w-0">
                <div className={`font-display text-[18px] font-medium ${s.done ? "text-go" : "text-txt"}`}>{TITLES[s.id]}{s.by && s.done ? <span className="ml-2 font-body text-[12px] font-normal text-muted">by {s.by}</span> : null}</div>
                <div className="mt-1.5 text-[12.5px] leading-[1.6] text-muted">{body(s, { isOwner, isAdmin, repos, installUrl, state, policies })}</div>
              </div>
            </li>
          ))}
        </ol>

        {state.blocking && (
          <form action={dismissOnboarding} className="mt-6">
            <button className="text-[12px] text-muted hover:underline">Skip for now — I'll finish later</button>
          </form>
        )}
      </div>
    </main>
  );
}

function body(s: Step, c: { isOwner: boolean; isAdmin: boolean; repos: TeamRepo[]; installUrl: string; state: OnboardingState; policies: Record<string, boolean> }) {
  switch (s.id) {
    case "team":
      return <>You're in. Invite people later from Members.</>;
    case "repo":
      if (s.done) return <>{c.repos.map((r) => r.full_name).join(", ")}</>;
      if (s.state === "requested") return <>Requested — see above.</>;
      if (s.waitingOn) return <>Waiting on {s.waitingOn} to link a repository.</>;
      if (!c.isAdmin) return <>An admin links repositories.</>;
      return (
        <>
          Install the DevBrain GitHub App on the repository your team works in. If you're not an owner of the GitHub organisation, GitHub will send a request to whoever is — that's fine, this page will wait.
          <div className="mt-2"><a href={c.installUrl} className="inline-block rounded-lg bg-accent2 px-3.5 py-[9px] text-[12.5px] font-semibold text-white">Link a repository</a></div>
        </>
      );
    case "mac":
      return (
        <>
          One click installs the DevBrain command, the editor plugin and its hooks for Claude Code, Cursor and Codex, and keeps them updated. You'll be asked to allow Notifications and Reminders.
          <div className="mt-2"><SetupMac done={s.done} /></div>
        </>
      );
    case "rules":
      if (s.waitingOn) return <>Waiting on {s.waitingOn}.</>;
      if (c.repos.length === 0) return <>Link a repository first.</>;
      if (!c.isAdmin) return s.done ? <>Rules are set. See them under Rules.</> : <>An admin chooses the rules.</>;
      return <Rules repos={c.repos} policies={c.policies} done={s.done} />;
    case "working":
      if (c.repos.length === 0) return <>Link a repository first.</>;
      if (s.done) return <>DevBrain has seen your editor in a linked repository.</>;
      return <>Open your editor in {c.repos[0]!.full_name} — restart it if it was already open, so it picks up the plugin — and this turns green by itself.</>;
  }
}

// Presets first; Customise expands the same seven switches per repo, rendered
// from the catalogue so there is no second copy of the text.
function Rules({ repos, policies, done }: { repos: TeamRepo[]; policies: Record<string, boolean>; done: boolean }) {
  const installations = [...new Set(repos.map((r) => r.installation_id).filter((x): x is number => x !== null))];
  const catalogue: RuleDef[] = [...RULES_CATALOG, ...FEATURE_CATALOG].filter((c) => PRESET_RULE_IDS.has(c.rule));
  return (
    <>
      {!done && (
        <>
          Is it just you for now, or are you setting this up for a team?
          <div className="mt-2 flex flex-wrap gap-2">
            {installations.map((inst) => (
              <form key={inst} action={applyPreset} className="flex gap-2"><DeskNext />
                <input type="hidden" name="installationId" value={inst} />
                <button name="preset" value="solo" className="rounded-lg border border-line2 px-3 py-[7px] text-[12.5px] font-semibold text-txt hover:border-line3">Just me</button>
                <button name="preset" value="team" className="rounded-lg border border-line2 px-3 py-[7px] text-[12.5px] font-semibold text-txt hover:border-line3">A team</button>
              </form>
            ))}
          </div>
          <p className="mt-2">Both turn on session journals: when a session ends, a redacted excerpt — the conversation and which tools/files it used, never file contents or command output — is summarised into a journal the whole team can read, labelled with its author. Letting DevBrain merge or update branches for you is a separate switch on the Rules page.</p>
        </>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer text-[12px] font-semibold text-accent">{done ? "Adjust the rules" : "Customise instead"}</summary>
        {repos.map((r) => (
          <div key={r.id} className="mt-3">
            <div className="font-mono text-[11px] text-muted">{r.full_name}</div>
            {catalogue.map((c) => {
              const on = policies[`${r.id}:${c.rule}`] ?? false;
              return (
                <div key={c.rule} className="grid grid-cols-[1fr_36px] gap-6 border-t border-line py-3">
                  <div>
                    <div className="text-[13.5px] text-txt">{c.label}</div>
                    <div className="mt-[3px] text-[12px] leading-[1.6] text-muted">{c.detail}</div>
                  </div>
                  <form action={toggleRule}><DeskNext />
                    <input type="hidden" name="repoId" value={r.id} />
                    <input type="hidden" name="rule" value={c.rule} />
                    <input type="hidden" name="enabled" value={String(!on)} />
                    <button aria-label={on ? "Turn off" : "Turn on"} className="block"><Switch on={on} size="lg" /></button>
                  </form>
                </div>
              );
            })}
          </div>
        ))}
      </details>
    </>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/desk/onboarding/setup-mac.tsx src/app/desk/onboarding/refresh-while.tsx src/app/desk/onboarding/wall.tsx
git commit -m "Onboarding: the walkthrough wall, self-contained"
```

---

### Task 10: Mount the wall, the voluntary route, and the nudge

**Files:**
- Modify: `src/app/desk/layout.tsx:36-44` and `:52-60, :78`
- Modify: `src/app/desk/nav.tsx:14-22` (props) and its render
- Create: `src/app/desk/onboarding/page.tsx`

**Interfaces:**
- Consumes: `loadOnboarding` (Task 8), `OnboardingWall` (Task 9)
- Produces: `DeskNav` gains `onboardingNudge: string | null`

- [ ] **Step 1: Load the state and mount the wall in the layout**

In `src/app/desk/layout.tsx` add imports:

```ts
import { cookies } from "next/headers";
import { COOKIE } from "@/lib/cookies";
import { loadOnboarding } from "@/lib/onboarding-load";
import { OnboardingWall } from "./onboarding/wall";
import { supabaseAdmin } from "@/lib/supabase/server";
```

After `const [repos, billing] = await Promise.all([...])` add:

```ts
  const onboarding = await loadOnboarding(org, repos);
  // Current rule values for the wall's Customise list.
  const policyMap: Record<string, boolean> = {};
  if (repos.length) {
    const { data: pol } = await supabaseAdmin().from("policies").select("repo_id, rule, enabled").in("repo_id", repos.map((r) => r.id));
    for (const p of pol ?? []) policyMap[`${p.repo_id}:${p.rule}`] = Boolean(p.enabled);
  }
  const showOnboardingWall = !walled && onboarding.blocking;
  const onboardingNudge = onboarding.complete ? null : onboarding.repoState === "requested" ? "Waiting on GitHub approval" : "Finish setup";
  // One-shot message from the GitHub setup route (e.g. install_owned); the
  // cookie expires in 60 s, so a layout can read it without clearing it.
  const notice = (await cookies()).get(COOKIE.notice)?.value ?? null;
  // "Requested" does not block, so the owner reaches a Console with no repo.
  // That state must explain itself on every page — not look like a broken
  // product — so the banner lives here, above the panes.
  const pendingBanner = !showOnboardingWall && onboarding.repoState === "requested"
    ? `Waiting on your GitHub org owner to approve DevBrain${onboarding.openRequestBy ? ` (requested by ${onboarding.openRequestBy})` : ""}. Nothing here until they do — this page updates itself.`
    : null;
```

Change the `DeskNav` call to pass `onboardingNudge={onboardingNudge}`, and change the pane line

```tsx
<div className="flex min-h-0 flex-1">{walled && billing ? <PlanWall billing={billing} isAdmin={hasRole(org.role, "admin")} /> : children}</div>
```

to

```tsx
{pendingBanner && (
  <div className="flex-shrink-0 border-b border-[var(--wg-wait-line)] bg-[var(--wg-wait-bg)] px-4 py-2 text-[12.5px] text-wait">{pendingBanner}</div>
)}
<div className="flex min-h-0 flex-1">
  {walled && billing
    ? <PlanWall billing={billing} isAdmin={hasRole(org.role, "admin")} />
    : showOnboardingWall
      ? <OnboardingWall org={org} repos={repos} state={onboarding} appSlug={appSlug} openRequestBy={onboarding.openRequestBy} policies={policyMap} notice={notice} />
      : children}
</div>
```

- [ ] **Step 2: The nudge in `DeskNav`**

Add `onboardingNudge: string | null;` to the props type in `src/app/desk/nav.tsx:14-22`, and render it at the top of the nav's link list as a `Link` to `/desk/onboarding`:

```tsx
{onboardingNudge && (
  <Link href="/desk/onboarding" className={`mb-2 block rounded-lg border border-[var(--wg-wait-line)] bg-[var(--wg-wait-bg)] px-2.5 py-1.5 text-[11.5px] font-semibold text-wait ${active === "onboarding" ? "ring-1 ring-wait" : ""}`}>
    {onboardingNudge} →
  </Link>
)}
```

(`Link` from `next/link` — add the import if the file lacks it.)

- [ ] **Step 3: The voluntary route**

```tsx
// src/app/desk/onboarding/page.tsx
import { redirect } from "next/navigation";
import { teamRepos } from "@/lib/desk/repos";
import { loadOnboarding } from "@/lib/onboarding-load";
import { currentOrg } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase/server";
import { OnboardingWall } from "./wall";

export const dynamic = "force-dynamic";

// The same walkthrough, reachable on purpose: teammates, and owners coming
// back after finishing. The layout above has already handled the wall case.
export default async function OnboardingPage() {
  const org = await currentOrg();
  if (!org) redirect("/welcome");
  const repos = await teamRepos(org.orgId);
  const state = await loadOnboarding(org, repos);
  const policies: Record<string, boolean> = {};
  if (repos.length) {
    const { data } = await supabaseAdmin().from("policies").select("repo_id, rule, enabled").in("repo_id", repos.map((r) => r.id));
    for (const p of data ?? []) policies[`${p.repo_id}:${p.rule}`] = Boolean(p.enabled);
  }
  return <OnboardingWall org={org} repos={repos} state={state} appSlug={process.env.NEXT_PUBLIC_GH_APP_SLUG || "devbrain"} openRequestBy={state.openRequestBy} policies={policies} notice={null} />;
}
```

- [ ] **Step 4: Typecheck, then run the whole suite**

Run: `npm run typecheck && npm test`
Expected: clean; all tests pass (the previous 232 plus the new ones).

- [ ] **Step 5: Verify in the app**

With the Beta app pointed at the dev server (`tools/set-server.sh` if needed), sign in as the owner of a team with no repo. Expected: every `/desk` route shows the wall; "Skip for now" reveals the Console with the "Finish setup" nudge in the sidebar; `/desk/onboarding` shows the same checklist. Sign in as a member of the same team: no wall, the nudge, and step 2 reads "Waiting on your team's owner".

- [ ] **Step 6: Commit**

```bash
git add src/app/desk/layout.tsx src/app/desk/nav.tsx src/app/desk/onboarding/page.tsx
git commit -m "Onboarding: mount the wall for owners, the nudge for everyone, /desk/onboarding for all"
```

---

### Task 11: Console sign-in

**Files:**
- Modify: `src/lib/surface.ts` (add `inAppSurface`)
- Modify: `src/lib/__tests__/surface.test.ts`
- Modify: `src/app/page.tsx:30, :57`
- Modify: `src/app/sign-in-button.tsx:17`
- Modify: `src/app/auth/device/start/route.ts:24, :38, :61`
- Modify: `src/app/auth/device/route.ts:19, :49`
- Modify: `widget/src-tauri/src/setup.rs:382-386, :415-434`

**Interfaces:**
- Produces: `inAppSurface(from: string | undefined) => "widget" | "desk" | null`; a `surface` query parameter (`widget` | `desk`) carried through `/auth/device/start` → the `devbrain[-beta]://login` URL → `/auth/device`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/surface.test.ts`:

```ts
import { inAppSurface } from "@/lib/surface";

describe("inAppSurface", () => {
  it("names the two app surfaces and nothing else", () => {
    expect(inAppSurface("widget")).toBe("widget");
    expect(inAppSurface("desk")).toBe("desk");
    expect(inAppSurface(undefined)).toBeNull();
    expect(inAppSurface("")).toBeNull();
    expect(inAppSurface("browser")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/surface.test.ts`
Expected: FAIL — `inAppSurface is not a function` (or not exported)

- [ ] **Step 3: Implement `inAppSurface`**

Append to `src/lib/surface.ts`:

```ts
/** Which app webview a ?from= hint names — the 440px panel or the Console.
 *  A signed-out Console used to fall through to the marketing landing page. */
export function inAppSurface(from: string | undefined): "widget" | "desk" | null {
  return from === "widget" || from === "desk" ? from : null;
}
```

- [ ] **Step 4: The landing page**

In `src/app/page.tsx` add `import { inAppSurface } from "@/lib/surface";`, replace

```ts
  const inPanel = from === "widget";
```

with

```ts
  const surface = inAppSurface(from);
  const inPanel = surface !== null;
```

and change the sign-in button in the in-app branch to

```tsx
<SignInButton next={surface === "desk" ? "/desk" : "/widget"} size="sm" />
```

Update the copy line just above it so it no longer says "comes back here" only for the panel — "Sign in with GitHub in your browser — the app picks it up and brings you back." works for both.

- [ ] **Step 5: The button passes the surface**

In `src/app/sign-in-button.tsx` change

```ts
      try { await core.invoke("start_browser_login"); return; } catch { /* older shell: fall through */ }
```

to

```ts
      try { await core.invoke("start_browser_login", { surface: next === "/desk" ? "desk" : "widget" }); return; } catch { /* older shell: fall through */ }
```

- [ ] **Step 6: `/auth/device/start` carries the surface**

In `src/app/auth/device/start/route.ts`:

```ts
  const surface = url.searchParams.get("surface") === "desk" ? "desk" : "widget";
  const self = `/auth/device/start?channel=${channel}&surface=${surface}`;
```

replace the signed-out redirect with

```ts
    return NextResponse.redirect(`${url.origin}/?from=${surface}&next=${encodeURIComponent(self)}`);
```

and build the app URL as

```ts
  const appUrl = `${SCHEME[channel]}://login?token=${encodeURIComponent(token)}&surface=${surface}`;
```

- [ ] **Step 7: `/auth/device` lands on the right surface**

In `src/app/auth/device/route.ts`:

```ts
  const surface = url.searchParams.get("surface") === "desk" ? "desk" : "widget";
  const fail = (why: string) => NextResponse.redirect(`${url.origin}/?from=${surface}&device_error=${encodeURIComponent(why)}`);
```

and the final line

```ts
  return NextResponse.redirect(`${url.origin}${surface === "desk" ? "/desk" : "/widget"}`);
```

- [ ] **Step 8: Rust — open the browser with the surface, and return to it**

In `widget/src-tauri/src/setup.rs` change `start_browser_login`:

```rust
#[tauri::command]
pub fn start_browser_login(app: AppHandle, surface: Option<String>) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let surface = match surface.as_deref() { Some("desk") => "desk", _ => "widget" };
    let url = format!("{}/auth/device/start?channel={}&surface={}", crate::SITE, CHANNEL, surface);
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}
```

(Keep the `#[tauri::command]` attribute exactly as it is on the current definition.) And in `handle_deep_link`, replace the `login` branch body:

```rust
        let Some(token) = u.query_pairs().find(|(k, _)| k == "token").map(|(_, v)| v.into_owned()) else { continue };
        let desk = u.query_pairs().any(|(k, v)| k == "surface" && v == "desk");
        let target = format!("{}/auth/device?token={}&surface={}", crate::SITE, token, if desk { "desk" } else { "widget" });
        if desk {
            // Console sign-in: land the session in the Desk window's cookie
            // jar (shared with the panel) and bring the Desk forward.
            if let Some(w) = app.get_webview_window("desk") {
                let _ = w.eval(&format!("window.location.replace({:?})", target));
            }
            crate::show_desk(app.clone(), None);
        } else if let Some(panel) = app.get_webview_window("panel") {
            let _ = panel.eval(&format!("window.location.replace({:?})", target));
            let _ = panel.show();
            let _ = panel.set_focus();
        }
```

- [ ] **Step 9: Build and test**

Run: `npx vitest run src/lib/__tests__/surface.test.ts && npm run typecheck && (cd widget/src-tauri && cargo check)`
Expected: PASS; typecheck clean; `cargo check` clean.

- [ ] **Step 10: Verify the two paths by hand**

Panel: open the panel signed out → Sign in → browser → back in the **panel** at `/widget`. (This is the regression guard for the widget-destination cookie fix.)
Console: open the Console signed out (tray → Open Console) → it shows the bare sign-in, **not** the landing page → Sign in → browser → back in the **Console** at `/desk`.

- [ ] **Step 11: Commit**

```bash
git add src/lib/surface.ts src/lib/__tests__/surface.test.ts src/app/page.tsx src/app/sign-in-button.tsx src/app/auth/device/start/route.ts src/app/auth/device/route.ts widget/src-tauri/src/setup.rs
git commit -m "Sign-in: the Console gets its own bare sign-in and returns to /desk"
```

---

### Task 12: `solo_green` drift notice

**Files:**
- Modify: `src/app/join/[code]/route.ts:66`

**Interfaces:**
- Consumes: `soloGreenDrift` (Task 3), `alert` from `@/lib/alerts`

- [ ] **Step 1: Raise the notice after `member_joined`**

Add imports to `src/app/join/[code]/route.ts`:

```ts
import { alert } from "@/lib/alerts";
import { soloGreenDrift } from "@/lib/onboarding-presets";
```

Immediately after the `member_joined` insert (line 66) add:

```ts
    // A Solo preset outliving the solo situation: solo_green now lets the AI
    // clear PRs on a team that has a human who could review. Say so once.
    const { data: pol } = await admin.from("policies").select("repo_id, rule, enabled").eq("org_id", inv.org_id).eq("rule", "solo_green").eq("enabled", true);
    const drifting = soloGreenDrift((pol ?? []) as { repo_id: string; rule: string; enabled: boolean }[]);
    if (drifting.length) {
      await alert({
        scope: { orgId: inv.org_id },
        key: "solo_green.drift",
        severity: "warn",
        title: "Your team grew — solo_green is still on",
        detail: `${drifting.length} repo${drifting.length === 1 ? "" : "s"} let the AI review clear a PR with no teammate approval. That made sense alone; now a person can approve. Turn it off under Rules when you're ready.`,
      });
    }
```

- [ ] **Step 2: Typecheck and test**

Run: `npm run typecheck && npm test`
Expected: clean; all green.

- [ ] **Step 3: Commit**

```bash
git add "src/app/join/[code]/route.ts"
git commit -m "Rules: warn when a team grows past its Solo preset"
```

---

### Task 13: Docs

**Files:**
- Modify: `ONBOARDING.md`

- [ ] **Step 1: Replace the terminal verification with the in-app one**

In section 2, replace

> Then restart any open Claude Code session so it loads the plugin, and run `devbrain doctor` in a new terminal — every line should be a check mark.

with

> Then restart any open editor session so it loads the plugin. The app's setup checklist turns "It's working" green by itself the first time DevBrain sees your editor in a linked repo — nothing to run.

- [ ] **Step 2: Fix the false claim**

In "Security notes", replace

> DevBrain's GitHub access is read-only. All code changes happen through your own git + PRs, reviewed by a teammate.

with

> DevBrain reads your repositories through its GitHub App. It writes to them only when an admin turns on one of the three write switches under Rules (auto-merge approved green PRs, keep behind PRs updated, revert from History) — and then only ever as a pull request or the merge of a human-approved one, never a push to main.

- [ ] **Step 3: Add the first-run walkthrough to section 1**

After the roles paragraph add:

> The first time the team's owner opens the Console, it walks them through linking a repository and choosing its rules. Everyone else sees the same checklist without being held up by it — a "Finish setup" link in the sidebar until their Mac and editor are connected.

- [ ] **Step 4: Commit**

```bash
git add ONBOARDING.md
git commit -m "Docs: onboarding reflects the in-app walkthrough; GitHub access is not read-only"
```

---

## Verification before merge

- [ ] `npm run typecheck && npm test` — all green.
- [ ] `npm run build` — clean.
- [ ] Owner path, end to end, in the Beta app against production once deployed: sign in from the Console → wall → Link a repository → (as a non-owner of the GitHub org) the pending banner → approve as the org owner → the page updates on its own → preset → Set up this Mac → open the editor → "It's working" turns green.
- [ ] Member path: join by invite → no wall → nudge → Set up this Mac → green.
- [ ] Panel sign-in unchanged (lands on `/widget`).
- [ ] The two GitHub-API claims from the spec confirmed against GitHub's docs before the request path is relied on: a request redirects to the Setup URL with `setup_action=request`; `installation.created` carries `requester`.
- [ ] Deviation from the spec's test table, on purpose: `setup-request.test.ts` does not exist. The vitest suite runs with no database and no request context, and the setup route's only logic is the event write; the decision it feeds is fully covered by `onboarding-request.test.ts`. The route itself is verified by hand in Task 5, Step 5.

## Not in this plan (per the spec's non-goals)

The website's download path; the non-Mac teammate path; any change to the `writer_*` switches beyond keeping them off this screen; the invite-only signups decision (`scripts/beta.mjs signups`), which is yours to make before strangers can reach the owner path.
