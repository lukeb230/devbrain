# App Testing Findings Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every product defect found in the 2026-09-14 two-VM test pass (dead Console tokens, false "set up" state, wrong-team re-runs, cross-team token list, wrong CLI command in copy, silent Codex hooks, stale server host on old installs, and team creation bouncing to Safari) without touching the Rust app or the database schema.

**Architecture:** All fixes are in the Next.js app, the Node CLI, and docs. The three token bugs share one root: the Console assumed "the account has a token" meant "this Mac has a token", and the token form ignored an insert error caused by the existing `dev_tokens_live_label_per_user` unique index. The set-up step becomes per-machine by having the server hand the wall the live token *labels* for this team and letting the client compare them with the Mac's hostname (which the app already exposes over IPC as `setup_state.hostname`). The re-run button always mints, so it always re-points the Mac. Team creation moves into the app by removing the one branch in the device sign-in route that bounced teamless users to the browser, and by letting the Console layout render the create-or-join forms itself; the forms and their server actions already support returning to `/desk` and `/widget`.

**Tech Stack:** Next.js 15 App Router (React 19, server actions), Supabase (service-role client), vitest (`src/lib/__tests__`, `cli/bin/__tests__`), Node ESM CLI (`cli/bin/*.mjs`), `npm run typecheck`, `npm run build`.

**Spec:** `docs/APP-TESTING-2026-09-14.md` (sections "Findings added", "Session 3", "Session 4") and the memory note "team creation must move into the Console" (`~/.claude/projects/-Users-lukebrowne-Downloads-devbrain/memory/devbrain-first-run-decisions.md`).

## Global Constraints

- Repo is `~/Downloads/devbrain-product`. **`~/Downloads/devbrain` is a different, frozen repo: never read or write it.** The shell cwd resets to it after each command, so start commands with `cd ~/Downloads/devbrain-product/.worktrees/<name>`.
- Work in a worktree on branch `fix/app-testing-findings` off `main`. Commit after each task. Never push (the user pushes). No new dependencies.
- **No changes under `widget/` (Rust/Tauri) and no database migrations.** `setup_state` already returns `hostname`, `has_token`, `bootstrap_ok`; the unique index `dev_tokens_live_label_per_user` on `(user_id, lower(label)) WHERE revoked_at IS NULL` already exists. Everything here builds on those.
- Tests: `npx vitest run <file>` while iterating; `npx vitest run && npm run typecheck && npm run build` once before each commit. `npm run build` passes on `main` today; keep it that way.
- Copy in the app matches the surrounding voice (the app's own copy uses em dashes; the public site's copy must not, but no site copy changes here except Task 11's one sentence, which must not contain an em dash).
- Do not add `bypass_hook_trust` or any trust override to `~/.codex/config.toml`. Codex reviews hooks on purpose; DevBrain tells the user, it does not switch the review off.
- `mintDeviceToken` already revokes the user's live top-level tokens with the same label across all teams before inserting. Keep that; nothing else revokes tokens implicitly.
- Existing behaviour to preserve: the wall's heading and `state.complete` stay server-side (they cannot know the hostname); only the "Set up this Mac" row becomes per-machine.

---

## File Structure

| File | Responsibility after this plan |
|---|---|
| `src/lib/token-mint.ts` (new) | Pure: classify a `dev_tokens` insert error into an outcome the action can act on. |
| `src/app/settings/tokens/actions.ts` | `createToken` checks the insert result; on failure sets a notice cookie and clears any stale shown-once token instead of overwriting it. `revokeToken` is scoped to the current team. |
| `src/app/desk/submit-button.tsx` (new) | Client submit button that disables itself while its form is pending (stops the double-submit). |
| `src/lib/onboarding-notices.ts` | Two new one-shot notices: `token_label_taken`, `token_failed`. |
| `src/app/desk/(team)/tokens/page.tsx` | Lists only this team's tokens; uses `SubmitButton`; the manual-setup hint names `devbrain bootstrap`. |
| `src/lib/onboarding.ts`, `src/lib/onboarding-load.ts` | `OnboardingState.macLabels`: live top-level token labels for this user in this team. |
| `src/lib/setup-mac-copy.ts` | `macSetupState()` replaces `shouldMint()`; `setupMacCopy()` unchanged. |
| `src/app/desk/onboarding/mac-step.tsx` (new, client) | The whole "Set up this Mac" row: number/check, title, body, button. Owns the `setup_state` IPC read. Replaces `setup-mac.tsx`. |
| `src/app/desk/onboarding/wall.tsx` | Renders `MacStep` for the mac step; other steps unchanged. |
| `cli/bin/hosts.mjs` | Codex `SessionEnd` hook timeout 3 s. |
| `cli/bin/lib.mjs` | `migrateServer()` for the legacy Vercel host. |
| `cli/bin/devbrain.mjs` | Uses `migrateServer` in `updateAll`; Codex wiring message and `doctor` line about hook review. |
| `src/app/auth/device/start/route.ts` | No longer bounces a teamless user to `/welcome`. |
| `src/app/welcome/team-forms.tsx` (new) | The create-team and join-with-invite forms, shared by `/welcome` and the Console. |
| `src/app/welcome/page.tsx` | Uses `TeamForms`. |
| `src/app/desk/team-wall.tsx` (new) | The Console's no-team screen (Desk chrome + `TeamForms` returning to `/desk`). |
| `src/app/desk/layout.tsx` | Renders `TeamWall` when the user has no team instead of redirecting. |
| `src/app/widget/no-team.tsx` (new, client) | The panel's no-team screen: one button that opens the Console. |
| `src/app/widget/page.tsx` | Renders `NoTeamPanel` when the user has no team. |
| `docs/HANDOFF-2026-09-13.md`, `src/app/start/start-body.tsx` | Tool count 15; Safari download-permission sentence. |
| `src/app/widget/theme.ts`, three inline `early` scripts | (Optional Task 12) "system" instead of "light" when nothing is stored. |

---

### Task 1: A token the Console shows must be one it stored

**Files:**
- Create: `src/lib/token-mint.ts`
- Create: `src/app/desk/submit-button.tsx`
- Modify: `src/app/settings/tokens/actions.ts` (the `createToken` body from `const token = …` to the end)
- Modify: `src/lib/onboarding-notices.ts`
- Modify: `src/app/desk/(team)/tokens/page.tsx:67-70` (the form)
- Test: `src/lib/__tests__/token-mint.test.ts`

**Why:** `createToken` runs `await admin.from("dev_tokens").insert(…)` and never reads the result. With a duplicate live label the insert violates `dev_tokens_live_label_per_user`, no row is written, and the plaintext is still stashed in the `devbrain_new_token` cookie, so the page shows and copies a token that does not exist. That is exactly what the test pass hit: a second click on "New token" with the same label. (`mintDeviceToken` in `src/app/widget/actions.ts` does check its insert; it is not the problem.)

**Interfaces:**
- Produces: `export function tokenInsertOutcome(error: { code?: string | null; message?: string } | null | undefined): { ok: true } | { ok: false; notice: "token_label_taken" | "token_failed" }` in `src/lib/token-mint.ts`.
- Produces: `export function SubmitButton({ children, pendingLabel, size }: { children: React.ReactNode; pendingLabel: string; size?: "md" | "sm" | "lg" })` in `src/app/desk/submit-button.tsx`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/token-mint.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { tokenInsertOutcome } from "@/lib/token-mint";

describe("tokenInsertOutcome", () => {
  it("no error means the row was written", () => {
    expect(tokenInsertOutcome(null)).toEqual({ ok: true });
    expect(tokenInsertOutcome(undefined)).toEqual({ ok: true });
  });
  it("a unique violation is a taken label", () => {
    expect(tokenInsertOutcome({ code: "23505", message: 'duplicate key value violates unique constraint "dev_tokens_live_label_per_user"' })).toEqual({ ok: false, notice: "token_label_taken" });
  });
  it("any other error is a generic failure", () => {
    expect(tokenInsertOutcome({ code: "42501", message: "permission denied" })).toEqual({ ok: false, notice: "token_failed" });
    expect(tokenInsertOutcome({ message: "network" })).toEqual({ ok: false, notice: "token_failed" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/__tests__/token-mint.test.ts`
Expected: FAIL, `@/lib/token-mint` cannot resolve.

- [ ] **Step 3: Write the helper**

Create `src/lib/token-mint.ts`:

```ts
// The one thing createToken must never do is show a token it did not store.
// Postgres reports a unique-index violation as SQLSTATE 23505; the index that
// fires here is dev_tokens_live_label_per_user (one live label per user).
export type TokenInsertOutcome = { ok: true } | { ok: false; notice: "token_label_taken" | "token_failed" };

export function tokenInsertOutcome(error: { code?: string | null; message?: string } | null | undefined): TokenInsertOutcome {
  if (!error) return { ok: true };
  if (error.code === "23505") return { ok: false, notice: "token_label_taken" };
  return { ok: false, notice: "token_failed" };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/__tests__/token-mint.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the two notices**

In `src/lib/onboarding-notices.ts`, add two entries to `NOTICES` after `preset_failed`:

```ts
  token_label_taken: "A live token with that label already exists. Revoke it first, or pick another label. Nothing was created.",
  token_failed: "The token could not be created. Try again; if it keeps failing, check Team settings.",
```

- [ ] **Step 6: Make createToken honest**

In `src/app/settings/tokens/actions.ts`, add to the imports:

```ts
import { NOTICE_COOKIE_OPTS } from "@/lib/cookies";
import { tokenInsertOutcome } from "@/lib/token-mint";
```

(`COOKIE` and `NEW_TOKEN_COOKIE_OPTS` are already imported from `@/lib/cookies`; merge the new name into that existing import line rather than adding a second import of the same module.)

Replace the block from `const token = "dbk_" + …` through the `(await cookies()).set(COOKIE.newToken, …)` line with:

```ts
  const token = "dbk_" + randomBytes(24).toString("hex");
  const admin = supabaseAdmin();
  const { error } = await admin.from("dev_tokens").insert({
    org_id: member.orgId,
    user_id: member.userId,
    label,
    token_hash: hashToken(token),
  });

  // Scoped to the surface that asked: /settings for the dashboard (so the
  // Setup page can embed it in the connect command), /desk for the Desk.
  const path = surfaceOf(returnTo(formData, "/settings/tokens")) === "desk" ? "/desk" : "/settings";
  const jar = await cookies();
  const outcome = tokenInsertOutcome(error);
  if (!outcome.ok) {
    // Never show a token that was not stored: drop any earlier shown-once
    // value on this surface and say why nothing was created.
    jar.set(COOKIE.newToken, "", { ...NEW_TOKEN_COOKIE_OPTS, path, maxAge: 0 });
    jar.set(COOKIE.notice, outcome.notice, NOTICE_COOKIE_OPTS);
  } else {
    // Stash the plaintext once in a short-lived cookie so the page can show it
    // after the redirect, then it exists nowhere server-side except as a hash.
    jar.set(COOKIE.newToken, token, { ...NEW_TOKEN_COOKIE_OPTS, path });
  }
```

Leave the three `revalidatePath(...)` calls that follow in place.

- [ ] **Step 7: Stop the double submit**

Create `src/app/desk/submit-button.tsx`:

```tsx
"use client";

import { useFormStatus } from "react-dom";

// A submit button that goes quiet while its form is in flight, so a second
// click cannot re-post the same form (the token form minted twice that way
// and showed a token the second insert never stored).
export function SubmitButton({ children, pendingLabel, size = "md" }: { children: React.ReactNode; pendingLabel: string; size?: "md" | "sm" | "lg" }) {
  const { pending } = useFormStatus();
  const s = { md: "px-3.5 py-2 text-[12.5px]", sm: "px-[11px] py-1.5 font-display text-[11.5px] font-semibold", lg: "px-4 py-[9px] text-[12.5px]" }[size];
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`whitespace-nowrap rounded-lg bg-accent2 font-semibold text-white hover:brightness-110 disabled:opacity-50 ${s}`}>
      {pending ? pendingLabel : children}
    </button>
  );
}
```

In `src/app/desk/(team)/tokens/page.tsx` replace `<Button size="lg">New token</Button>` with `<SubmitButton size="lg" pendingLabel="Minting…">New token</SubmitButton>` and add `import { SubmitButton } from "../../submit-button";`. Remove `Button` from the `../../ui` import if nothing else on the page uses it (it does not).

- [ ] **Step 8: Typecheck and the full suite**

Run: `npx vitest run && npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/token-mint.ts src/lib/__tests__/token-mint.test.ts src/app/desk/submit-button.tsx src/app/settings/tokens/actions.ts src/lib/onboarding-notices.ts "src/app/desk/(team)/tokens/page.tsx"
git commit -m "Tokens: never show a token the insert did not store; block the double submit"
```

---

### Task 2: The token list shows this team only

**Files:**
- Modify: `src/app/desk/(team)/tokens/page.tsx:38` (the `dev_tokens` query)
- Modify: `src/app/settings/tokens/actions.ts` (`revokeToken`)

**Why:** The page selects `dev_tokens` with no `org_id` filter, so it lists the signed-in user's tokens from every team they belong to, with nothing on a row to say which team owns it. Revoking from there can kill a machine on another team.

- [ ] **Step 1: Scope the list**

In `src/app/desk/(team)/tokens/page.tsx` change the query to:

```ts
    supabase.from("dev_tokens").select("id, label, created_at, revoked_at, last_used_at, parent_token_id").eq("org_id", org.orgId).order("created_at", { ascending: false })
```

- [ ] **Step 2: Scope the revoke**

In `src/app/settings/tokens/actions.ts` `revokeToken`, add `.eq("org_id", member.orgId)` after `.eq("user_id", member.userId)`:

```ts
  await admin
    .from("dev_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", member.userId) // can only revoke your own
    .eq("org_id", member.orgId);  // and only in the team you are looking at
```

- [ ] **Step 3: Check for any other unscoped token query in the Console**

Run: `grep -rn "dev_tokens" src/app/desk src/lib/desk`
For every hit that filters by `user_id` but not `org_id`, add `.eq("org_id", <the org id in scope>)`. The sidebar's "Tokens & sessions" count is the likely one. If the grep returns only the page you just edited, nothing else to do; say so in the report.

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck`
Expected: clean.

```bash
git add "src/app/desk/(team)/tokens/page.tsx" src/app/settings/tokens/actions.ts
git commit -m "Tokens: list and revoke only the selected team's tokens"
```

---

### Task 3: The manual-setup hint names a real command

**Files:**
- Modify: `src/app/desk/(team)/tokens/page.tsx:61`
- Test: `src/lib/__tests__/console-copy.test.ts` (new)

**Why:** The page says `devbrain connect --token …`. The CLI has no `connect`; the command is `devbrain bootstrap --server URL --token TOKEN`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/console-copy.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/desk/(team)/tokens/page.tsx", "utf8");

describe("the tokens page's manual-setup hint", () => {
  it("names the bootstrap command with the server, and never the nonexistent connect command", () => {
    expect(page).toContain("devbrain bootstrap --server");
    expect(page).not.toContain("devbrain connect");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/__tests__/console-copy.test.ts`
Expected: FAIL on the first assertion.

- [ ] **Step 3: Fix the copy**

In `src/app/desk/(team)/tokens/page.tsx` add `import { SITE_URL } from "@/lib/site-url";` and replace the hint paragraph with:

```tsx
              <p className="text-[12px] text-accent">For a manual, CI or headless setup: <code className="font-mono">devbrain bootstrap --server {SITE_URL} --token …</code>. Whoever holds it is that teammate.</p>
```

- [ ] **Step 4: Run the test, then commit**

Run: `npx vitest run src/lib/__tests__/console-copy.test.ts && npm run typecheck`
Expected: PASS.

```bash
git add "src/app/desk/(team)/tokens/page.tsx" src/lib/__tests__/console-copy.test.ts
git commit -m "Tokens: the manual-setup hint names devbrain bootstrap"
```

---

### Task 4: The onboarding state carries this team's live Mac labels

**Files:**
- Modify: `src/lib/onboarding.ts` (`OnboardingInput.tokens`, `OnboardingState`, `onboardingState`)
- Modify: `src/lib/onboarding-load.ts` (the `dev_tokens` select and the `tokens:` cast)
- Test: `src/lib/__tests__/onboarding.test.ts`

**Interfaces:**
- Produces: `OnboardingInput.tokens: { label: string; revoked_at: string | null; parent_token_id: string | null }[]` and `OnboardingState.macLabels: string[]` (labels of this user's live, top-level tokens in this team, in the order given). `steps[].done` for `"mac"` is unchanged (any live top-level token).

- [ ] **Step 1: Write the failing test**

In `src/lib/__tests__/onboarding.test.ts`, first update the fixture type. Run `grep -n "tokens:" src/lib/__tests__/onboarding.test.ts` and change every literal token object to carry all three fields. For example `{ revoked_at: null }` becomes `{ label: "mac", revoked_at: null, parent_token_id: null }` and `{ revoked_at: "…" }` becomes `{ label: "mac", revoked_at: "…", parent_token_id: null }`. Then append:

```ts
describe("onboardingState — macLabels", () => {
  it("lists live, top-level labels only, in order", () => {
    const s = onboardingState(base({ tokens: [
      { label: "codex-mac", revoked_at: null, parent_token_id: null },
      { label: "old-mac", revoked_at: ago(60_000), parent_token_id: null },
      { label: "codex-mac · 2", revoked_at: null, parent_token_id: "t-1" },
      { label: "cursor-mac", revoked_at: null, parent_token_id: null },
    ] }));
    expect(s.macLabels).toEqual(["codex-mac", "cursor-mac"]);
    expect(step(s, "mac").done).toBe(true);
  });
  it("is empty with no live token, and the mac step is not done", () => {
    const s = onboardingState(base({ tokens: [{ label: "gone", revoked_at: ago(60_000), parent_token_id: null }] }));
    expect(s.macLabels).toEqual([]);
    expect(step(s, "mac").done).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/__tests__/onboarding.test.ts`
Expected: FAIL (type error on `label`, and `macLabels` undefined).

- [ ] **Step 3: Implement**

In `src/lib/onboarding.ts`:

```ts
  /** THIS user's dev tokens. */
  tokens: { label: string; revoked_at: string | null; parent_token_id: string | null }[];
```

and in `OnboardingState`, after `complete: boolean;`:

```ts
  /** Labels of this user's live, top-level tokens in this team — the wall
   *  compares them with the Mac's hostname to say whether THIS Mac is set up. */
  macLabels: string[];
```

In `onboardingState`, replace the `macDone` line with:

```ts
  const liveTop = i.tokens.filter((t) => t.revoked_at === null && t.parent_token_id === null);
  const macDone = liveTop.length > 0;
  const macLabels = liveTop.map((t) => t.label);
```

and add `macLabels` to the returned object: `return { steps, repoState, blocking, dismissed, nextStep, complete: nextStep === null, macLabels };`

In `src/lib/onboarding-load.ts` change the select and the cast:

```ts
    admin.from("dev_tokens").select("label, revoked_at, parent_token_id").eq("org_id", org.orgId).eq("user_id", org.userId),
```

```ts
    tokens: (tokens ?? []) as { label: string; revoked_at: string | null; parent_token_id: string | null }[],
```

- [ ] **Step 4: Run the test, typecheck, commit**

Run: `npx vitest run src/lib/__tests__/onboarding.test.ts && npm run typecheck`
Expected: PASS.

```bash
git add src/lib/onboarding.ts src/lib/onboarding-load.ts src/lib/__tests__/onboarding.test.ts
git commit -m "Onboarding: expose this team's live Mac labels"
```

---

### Task 5: Per-machine set-up state replaces the reuse guess

**Files:**
- Modify: `src/lib/setup-mac-copy.ts`
- Test: `src/lib/__tests__/setup-mac-copy.test.ts`

**Why:** `shouldMint` reused the Mac's token whenever the server saw *any* live token and the Mac had *some* token; it cannot tell "set up for this team" from "set up for another team", which is how a re-run after switching teams kept the old team's token. Minting on every click costs one row, and `mintDeviceToken` revokes the previous same-label token, so nothing accumulates.

**Interfaces:**
- Produces: `export function macSetupState(i: { liveLabels: string[]; hostname: string | null | undefined; hasToken: boolean; bootstrapOk: boolean | null | undefined }): { doneHere: boolean }`.
- Removes: `shouldMint` (Task 6 deletes its last caller).

- [ ] **Step 1: Rewrite the tests**

Replace the `describe("shouldMint", …)` block in `src/lib/__tests__/setup-mac-copy.test.ts` with:

```ts
describe("macSetupState", () => {
  const live = ["codex-mac", "Sam's MacBook"];
  it("fresh Mac: no local token, nothing done here even if the team has tokens", () => {
    expect(macSetupState({ liveLabels: live, hostname: "codex-mac", hasToken: false, bootstrapOk: null })).toEqual({ doneHere: false });
  });
  it("a token from a deleted Mac with the same name does not count without a local token", () => {
    expect(macSetupState({ liveLabels: ["Managed's Virtual Machine"], hostname: "Managed's Virtual Machine", hasToken: false, bootstrapOk: null })).toEqual({ doneHere: false });
  });
  it("local token whose label is live in this team, last bootstrap fine: done", () => {
    expect(macSetupState({ liveLabels: live, hostname: "codex-mac", hasToken: true, bootstrapOk: true })).toEqual({ doneHere: true });
    expect(macSetupState({ liveLabels: live, hostname: "codex-mac", hasToken: true, bootstrapOk: null })).toEqual({ doneHere: true });
  });
  it("hostname match is case-insensitive and trims whitespace", () => {
    expect(macSetupState({ liveLabels: ["Codex-Mac"], hostname: " codex-mac ", hasToken: true, bootstrapOk: true })).toEqual({ doneHere: true });
  });
  it("local token but this team has no live token with this Mac's name: not done (it is another team's token)", () => {
    expect(macSetupState({ liveLabels: [], hostname: "codex-mac", hasToken: true, bootstrapOk: true })).toEqual({ doneHere: false });
  });
  it("last bootstrap failed: not done", () => {
    expect(macSetupState({ liveLabels: live, hostname: "codex-mac", hasToken: true, bootstrapOk: false })).toEqual({ doneHere: false });
  });
  it("no hostname from the app: not done", () => {
    expect(macSetupState({ liveLabels: live, hostname: null, hasToken: true, bootstrapOk: true })).toEqual({ doneHere: false });
  });
});
```

and change the import line to `import { macSetupState, setupMacCopy } from "../setup-mac-copy";`. Leave the `setupMacCopy` tests exactly as they are.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/__tests__/setup-mac-copy.test.ts`
Expected: FAIL, `macSetupState` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/setup-mac-copy.ts`, delete `shouldMint` and its doc comment, and append:

```ts
/** Whether THIS Mac is set up for THIS team. The server hands over the live
 *  top-level token labels for the team; the app reports the Mac's hostname
 *  (its token label), whether config.json holds a token, and how the last
 *  bootstrap ended. All three must agree — a token from another machine with
 *  the same name, or a token for another team, is not "done here". */
export function macSetupState(i: { liveLabels: string[]; hostname: string | null | undefined; hasToken: boolean; bootstrapOk: boolean | null | undefined }): { doneHere: boolean } {
  const host = (i.hostname ?? "").trim().toLowerCase();
  if (!host || !i.hasToken || i.bootstrapOk === false) return { doneHere: false };
  const named = i.liveLabels.some((l) => l.trim().toLowerCase() === host);
  return { doneHere: named };
}
```

Update the file's header comment so it no longer describes `done` as "the SERVER's view"; say: `done` is per-machine, computed by `macSetupState`.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/__tests__/setup-mac-copy.test.ts`
Expected: PASS. (`npm run typecheck` will fail until Task 6 removes the `shouldMint` import in `setup-mac.tsx`; that is expected and is why Tasks 5 and 6 are committed together.)

- [ ] **Step 5: Do not commit yet**

Continue straight into Task 6; commit both there.

---

### Task 6: The wall's "Set up this Mac" row tells the truth about this Mac

**Files:**
- Create: `src/app/desk/onboarding/mac-step.tsx`
- Delete: `src/app/desk/onboarding/setup-mac.tsx`
- Modify: `src/app/desk/onboarding/wall.tsx` (the `<li>` loop and the `case "mac"` in `body`)

**Interfaces:**
- Consumes: `OnboardingState.macLabels` (Task 4), `macSetupState`, `setupMacCopy` (Task 5), `mintDeviceToken(label, orgId)` from `@/app/widget/actions`, the Tauri IPC commands `setup_state` and `bootstrap` exactly as `setup-mac.tsx` used them.
- Produces: `export function MacStep({ n, liveLabels, orgId, orgName }: { n: number; liveLabels: string[]; orgId: string; orgName: string })`, a client component rendering the entire list row for the mac step.

- [ ] **Step 1: Create the row component**

Create `src/app/desk/onboarding/mac-step.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { mintDeviceToken } from "@/app/widget/actions";
import { macSetupState, setupMacCopy } from "@/lib/setup-mac-copy";

type Core = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
type Setup = { has_token?: boolean; hostname?: string; bootstrap_ok?: boolean | null; bootstrap_failed?: string[]; bootstrap_at?: string | null; configured?: boolean };

const core = (): Core | null => (window as unknown as { __TAURI__?: { core?: Core } }).__TAURI__?.core ?? null;

// The whole "Set up this Mac" row, client-side, because only the app knows
// which machine it is running on. The server hands over the live token labels
// for this team (liveLabels); the app reports its hostname, whether a token is
// on disk, and how the last bootstrap ended; macSetupState combines them.
//
// The button ALWAYS mints a fresh token for this team and hands it to the
// bootstrap, so a click always points this Mac at the team on screen.
// mintDeviceToken revokes the Mac's previous same-name token, so a re-run
// leaves one live token per machine.
export function MacStep({ n, liveLabels, orgId, orgName }: { n: number; liveLabels: string[]; orgId: string; orgName: string }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [bridge, setBridge] = useState<boolean | null>(null);

  useEffect(() => {
    const c = core();
    setBridge(Boolean(c));
    c?.invoke("setup_state").then((s) => setSetup(s as Setup)).catch(() => setSetup({}));
  }, []);

  const { doneHere } = macSetupState({ liveLabels, hostname: setup?.hostname, hasToken: Boolean(setup?.has_token), bootstrapOk: setup?.bootstrap_ok });
  const copy = setupMacCopy({ done: doneHere, hasToken: Boolean(setup?.has_token), orgName });
  const failed = setup?.bootstrap_failed ?? [];

  async function run() {
    const c = core();
    if (!c) return;
    setBusy(true); setErr(null);
    try {
      const label = (setup?.hostname ?? "").trim().slice(0, 60) || "my-mac";
      const minted = await mintDeviceToken(label, orgId);
      if ("error" in minted) throw new Error(minted.error);
      await c.invoke("bootstrap", { server: window.location.origin, token: minted.token, remindersList: null, remindersRepo: null });
      setSetup((await c.invoke("setup_state")) as Setup);
      router.refresh();
    } catch (e) {
      setErr(String(e).slice(0, 200));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="grid grid-cols-[32px_1fr] gap-4 border-t border-line py-[18px]">
      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold ${doneHere ? "bg-go text-white" : "border border-line2 text-txt"}`}>{doneHere ? "✓" : n}</span>
      <div className="min-w-0">
        <div className={`font-display text-[18px] font-medium ${doneHere ? "text-go" : "text-txt"}`}>Set up this Mac</div>
        <div className="mt-1.5 text-[12.5px] leading-[1.6] text-muted">
          One click installs the DevBrain command, the editor plugin and its hooks for Claude Code, Cursor and Codex, and keeps them updated. You&apos;ll be asked to allow Notifications and Reminders.
          <div className="mt-2">
            {bridge === false ? (
              <p className="text-[12.5px] text-muted">Open this page inside the DevBrain app to set up this Mac.</p>
            ) : (
              <div>
                {copy.note && <p className="mb-2 text-[12.5px] text-wait">{copy.note}</p>}
                <button type="button" onClick={run} disabled={busy || setup === null} className="rounded-lg bg-accent2 px-3.5 py-[9px] text-[12.5px] font-semibold text-white disabled:opacity-60">
                  {busy ? "Setting up…" : copy.button}
                </button>
                {setup?.bootstrap_at && (
                  <p className="mt-2 text-[12.5px] text-muted">
                    {setup.bootstrap_ok === false ? `${failed.join(", ") || "a part"} failed — re-running is safe and only fixes what's missing.` : doneHere ? "All parts installed on this Mac." : `This Mac was last set up for another team. Set it up for ${orgName} to point it here.`}
                  </p>
                )}
                {err && <p className="mt-2 text-[12.5px] text-stop">{err}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Use it from the wall**

In `src/app/desk/onboarding/wall.tsx`:

1. Replace `import { SetupMac } from "./setup-mac";` with `import { MacStep } from "./mac-step";`.
2. In the `<ol>` loop, render the mac step with the new component. Change the loop body to:

```tsx
          {state.steps.map((s, n) => s.id === "mac" ? (
            <MacStep key={s.id} n={n + 1} liveLabels={state.macLabels} orgId={org.orgId} orgName={org.orgName} />
          ) : (
            <li key={s.id} className="grid grid-cols-[32px_1fr] gap-4 border-t border-line py-[18px]">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold ${s.done ? "bg-go text-white" : "border border-line2 text-txt"}`}>{s.done ? "✓" : n + 1}</span>
              <div className="min-w-0">
                <div className={`font-display text-[18px] font-medium ${s.done ? "text-go" : "text-txt"}`}>{TITLES[s.id]}{s.by && s.done ? <span className="ml-2 font-body text-[12px] font-normal text-muted">by {s.by}</span> : null}</div>
                <div className="mt-1.5 text-[12.5px] leading-[1.6] text-muted">{body(s, { isOwner, isAdmin, repos, installUrl, state, policies, orgId: org.orgId, orgName: org.orgName })}</div>
              </div>
            </li>
          ))}
```

3. In `body()`, the `case "mac":` branch is now unreachable; replace its body with `return null;` so the switch stays exhaustive.

4. Delete `src/app/desk/onboarding/setup-mac.tsx` (`git rm`).

- [ ] **Step 3: Full suite, typecheck, build**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: all green. If `wall.tsx` still references `SetupMac` anywhere, the typecheck names the line.

- [ ] **Step 4: Commit Tasks 5 and 6 together**

```bash
git add src/lib/setup-mac-copy.ts src/lib/__tests__/setup-mac-copy.test.ts src/app/desk/onboarding/mac-step.tsx src/app/desk/onboarding/wall.tsx
git rm -q src/app/desk/onboarding/setup-mac.tsx
git commit -m "Set up this Mac: per-machine truth, and every click points the Mac at the team on screen"
```

---

### Task 7: Codex hooks: a timeout Codex accepts, and a word about review

**Files:**
- Modify: `cli/bin/hosts.mjs:166` (the `SessionEnd` entry in `mergeCodexHooks`)
- Modify: `cli/bin/devbrain.mjs` (`wireCodex` return message; `doctor` after the `claude CLI` note)
- Test: `cli/bin/__tests__/hosts.test.ts`

**Why:** Codex prints `warning: clamping SessionEnd hook timeout to 3s` on every run because DevBrain writes 8; and Codex does not run new hooks until the user approves them once in an interactive session (`' hooks need review before they can run.'`, in the Codex binary). Nothing after "Set up this Mac" says so, so a Codex user's sessions are silently invisible.

- [ ] **Step 1: Write the failing test**

In `cli/bin/__tests__/hosts.test.ts`, inside the existing `describe` that covers `mergeCodexHooks` (find it with `grep -n "mergeCodexHooks" cli/bin/__tests__/hosts.test.ts`), add:

```ts
  it("writes the SessionEnd timeout Codex actually allows (3 s), and keeps the others", () => {
    const out = mergeCodexHooks({}, { node, hooksDir });
    expect(out.hooks.SessionEnd[0].hooks[0].timeout).toBe(3);
    expect(out.hooks.SessionStart[0].hooks[0].timeout).toBe(12);
    expect(out.hooks.PreToolUse[0].hooks[0].timeout).toBe(10);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run cli/bin/__tests__/hosts.test.ts`
Expected: FAIL, expected 3, received 8.

- [ ] **Step 3: Fix the timeout**

In `cli/bin/hosts.mjs` `mergeCodexHooks`, change `SessionEnd: entry(c.sessionEnd, 8),` to:

```js
    SessionEnd: entry(c.sessionEnd, 3), // Codex clamps SessionEnd to 3 s and warns on every run above that
```

- [ ] **Step 4: Say what Codex needs**

In `cli/bin/devbrain.mjs` `wireCodex`, change the final return to:

```js
  const changed = t1 !== t0 || JSON.stringify(h0) !== JSON.stringify(h1);
  return changed
    ? "config.toml + hooks written — Codex reviews new hooks: start codex once in a repo and approve the DevBrain hooks when it asks"
    : "ok";
```

In `doctor`, directly after the line `if (others.length) note("claude CLI", …)` (line 937 today), add:

```js
    if (existsSync(CODEX_DIR)) note("codex hooks", "run only after you approve them once in an interactive codex session (codex exec needs --dangerously-bypass-hook-trust)");
```

- [ ] **Step 5: Run the CLI tests and commit**

Run: `npx vitest run cli/bin/__tests__/hosts.test.ts && node --check cli/bin/devbrain.mjs`
Expected: PASS; `node --check` prints nothing.

```bash
git add cli/bin/hosts.mjs cli/bin/devbrain.mjs cli/bin/__tests__/hosts.test.ts
git commit -m "Codex: 3 s SessionEnd hook, and say that Codex reviews new hooks"
```

---

### Task 8: Old installs move to getdevbrain.com on their next update

**Files:**
- Modify: `cli/bin/lib.mjs` (append)
- Modify: `cli/bin/devbrain.mjs` (`updateAll`, right after `const cfg = loadConfig();`)
- Test: `cli/bin/__tests__/lib.test.ts`

**Why:** `updateAll` never rewrites `config.server`, so a Mac set up against `https://devbrain-seven.vercel.app` keeps posting there after every update. That host still answers today; it will not forever.

**Interfaces:**
- Produces: `export const LEGACY_SERVERS = ["https://devbrain-seven.vercel.app"]` and `export function migrateServer(cfg, current): { cfg, changed: boolean, from: string | null }` in `cli/bin/lib.mjs`.

- [ ] **Step 1: Write the failing test**

Append to `cli/bin/__tests__/lib.test.ts`:

```ts
import { LEGACY_SERVERS, migrateServer } from "../lib.mjs";

describe("migrateServer", () => {
  const current = "https://getdevbrain.com";
  it("moves a legacy host to the current one", () => {
    const r = migrateServer({ server: "https://devbrain-seven.vercel.app", token: "t" }, current);
    expect(r.changed).toBe(true);
    expect(r.from).toBe("https://devbrain-seven.vercel.app");
    expect(r.cfg).toEqual({ server: current, token: "t" });
  });
  it("tolerates a trailing slash on the legacy host", () => {
    expect(migrateServer({ server: "https://devbrain-seven.vercel.app/" }, current).changed).toBe(true);
  });
  it("leaves the current host and any unknown host alone", () => {
    expect(migrateServer({ server: current }, current)).toEqual({ cfg: { server: current }, changed: false, from: null });
    expect(migrateServer({ server: "https://preview-abc.vercel.app" }, current).changed).toBe(false);
    expect(migrateServer({}, current).changed).toBe(false);
  });
  it("lists the legacy host", () => {
    expect(LEGACY_SERVERS).toContain("https://devbrain-seven.vercel.app");
  });
});
```

(Put the `import` at the top of the file with the existing import; `describe`/`it`/`expect` are already imported.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run cli/bin/__tests__/lib.test.ts`
Expected: FAIL, `migrateServer` is not exported.

- [ ] **Step 3: Implement**

Append to `cli/bin/lib.mjs`:

```js
/** Hosts DevBrain used before its own domain. An install still pointed at one
 *  is moved to `current` on its next update — the token is the same either way. */
export const LEGACY_SERVERS = ["https://devbrain-seven.vercel.app"];

export function migrateServer(cfg, current) {
  const server = String(cfg?.server ?? "").replace(/\/+$/, "");
  if (!server || !LEGACY_SERVERS.includes(server)) return { cfg, changed: false, from: null };
  return { cfg: { ...cfg, server: current }, changed: true, from: server };
}
```

In `cli/bin/devbrain.mjs`:
1. Add `migrateServer` to the import from `./lib.mjs` (the line that imports `compareVersions, …`).
2. In `updateAll`, replace `const cfg = loadConfig();` with:

```js
  const loaded = loadConfig();
  const mig = migrateServer(loaded, DEFAULT_SERVER);
  const cfg = mig.cfg;
  if (mig.changed) { saveConfig(cfg); log(`  server    moved from ${mig.from} to ${DEFAULT_SERVER}`); }
```

- [ ] **Step 4: Run the tests and commit**

Run: `npx vitest run cli/bin/__tests__/lib.test.ts && node --check cli/bin/devbrain.mjs`
Expected: PASS.

```bash
git add cli/bin/lib.mjs cli/bin/devbrain.mjs cli/bin/__tests__/lib.test.ts
git commit -m "CLI: move installs still on the old Vercel host to getdevbrain.com on update"
```

---

### Task 9: Signing in with no team hands back to the app

**Files:**
- Modify: `src/app/auth/device/start/route.ts` (delete the teamless branch)

**Why:** This route counts the user's memberships and, on zero, redirects the browser to `/welcome` and stashes a return cookie. That is the only reason a brand-new account ends up creating its team in Safari. The panel and the Console can both show the team forms themselves (Task 10), so the route should mint the device token and hand off like it does for everyone else.

- [ ] **Step 1: Delete the branch**

In `src/app/auth/device/start/route.ts` remove this block entirely:

```ts
  // Signed in but on no team yet: create/join one first (full-size, in the
  // browser), then come back here — the cookie remembers this destination.
  const admin = supabaseAdmin();
  const { count } = await admin.from("org_members").select("org_id", { count: "exact", head: true }).eq("user_id", user.id);
  if (!count) {
    const res = NextResponse.redirect(`${url.origin}/welcome`);
    res.cookies.set(COOKIE.next, self, NEXT_COOKIE_OPTS);
    return res;
  }
```

and put `const admin = supabaseAdmin();` back on its own line just before `const token = "dbd_" + …` (the insert below still needs it). Then remove `NEXT_COOKIE_OPTS` from the `@/lib/cookies` import (still import `CHANNEL_COOKIE_OPTS` and `COOKIE`). Update the header comment: the "Signed in →" sentence should read "Signed in (with or without a team) → mint a one-time device token and hand it to the app; the app's own window shows the team step if there is none yet."

- [ ] **Step 2: Typecheck and commit**

Run: `npm run typecheck`
Expected: clean (an unused-import error here means Step 1 missed the import line).

```bash
git add src/app/auth/device/start/route.ts
git commit -m "Sign-in: hand back to the app even with no team yet"
```

---

### Task 10: The Console owns team creation; the panel points to it

**Files:**
- Create: `src/app/welcome/team-forms.tsx`
- Modify: `src/app/welcome/page.tsx` (use `TeamForms`)
- Create: `src/app/desk/team-wall.tsx`
- Modify: `src/app/desk/layout.tsx:39` (the `if (!org) redirect(...)` line)
- Create: `src/app/widget/no-team.tsx`
- Modify: `src/app/widget/page.tsx:21` (the `if (!org) redirect(...)` line)
- Test: `src/lib/__tests__/team-forms.test.tsx`

**Why:** `createTeam` and `useInvite` already return to `/desk` or `/widget` when the form carries `next`, `/welcome` and `/join/` are already on both windows' allowlists (`src/lib/panel-routes.ts`), and `open_desk` is an existing Tauri command the panel already invokes (`src/app/widget/app.tsx:376`). The only missing pieces are a Console screen for a user with no team and a panel screen that opens it.

**Interfaces:**
- Produces: `export function TeamForms({ appNext, full, inviteError, compact, createAction, joinAction }: { appNext: string | null; full: string | null; inviteError?: string | null; compact: boolean; createAction: (fd: FormData) => Promise<void>; joinAction: (fd: FormData) => Promise<void> })` in `src/app/welcome/team-forms.tsx`.
- Produces: `export function TeamWall({ login, full }: { login: string; full: string | null })` in `src/app/desk/team-wall.tsx`.
- Produces: `export function NoTeamPanel()` (client) in `src/app/widget/no-team.tsx`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/team-forms.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TeamForms } from "@/app/welcome/team-forms";

const noop = async () => {};

describe("TeamForms", () => {
  it("carries the app surface back in both forms", () => {
    const html = renderToStaticMarkup(<TeamForms appNext="/desk" full={null} compact={false} createAction={noop} joinAction={noop} />);
    expect(html.match(/name="next" value="\/desk"/g)).toHaveLength(2);
    expect(html).toContain("Create a team");
    expect(html).toContain("Join with an invite");
  });
  it("omits the hidden next field in the browser", () => {
    const html = renderToStaticMarkup(<TeamForms appNext={null} full={null} compact={false} createAction={noop} joinAction={noop} />);
    expect(html).not.toContain('name="next"');
  });
  it("hides the create form and explains when the beta is full", () => {
    const html = renderToStaticMarkup(<TeamForms appNext="/widget" full="DevBrain's beta is full right now." compact createAction={noop} joinAction={noop} />);
    expect(html).toContain("DevBrain's beta is full right now.");
    expect(html).not.toContain('name="name"');
    expect(html).toContain('name="invite"');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/__tests__/team-forms.test.tsx`
Expected: FAIL, `@/app/welcome/team-forms` cannot resolve.

- [ ] **Step 3: Extract the forms**

Create `src/app/welcome/team-forms.tsx`:

```tsx
// The two ways into a team — create one, or paste an invite link — as one
// component, so the browser page, the Console and the panel render the same
// forms. The actions are passed in (they are server actions; keeping them out
// of this file keeps it renderable in tests). `appNext` is "/desk" or
// "/widget" inside the app, null in the browser.
export function TeamForms({ appNext, full, inviteError = null, compact, createAction, joinAction }: {
  appNext: string | null;
  full: string | null;
  inviteError?: string | null;
  compact: boolean;
  createAction: (fd: FormData) => Promise<void>;
  joinAction: (fd: FormData) => Promise<void>;
}) {
  const input = "min-w-0 flex-1 rounded-lg border border-line2 bg-ink px-3 py-[9px] text-[13px] text-txt placeholder:text-faint focus:border-accent focus:outline-none";
  const row = compact ? "flex flex-col gap-2" : "flex gap-2";
  return (
    <>
      {inviteError && <p className="mt-4 rounded-[10px] border border-[var(--wg-wait-line)] bg-[var(--wg-wait-bg)] px-3.5 py-2.5 text-[13px] text-wait">{inviteError}</p>}

      <section className="mt-6 rounded-xl border border-line bg-row p-4">
        <div className="font-display text-[17px] font-medium text-txt">Create a team</div>
        {full ? (
          <p className="mt-1 text-[12.5px] leading-[1.6] text-muted">{full} An invite link from someone already on DevBrain still works.</p>
        ) : (
          <>
            <p className="mb-2.5 mt-1 text-[12.5px] text-muted">You&apos;ll be its owner. Link repos and invite people next.</p>
            <form action={createAction} className={row}>
              {appNext && <input type="hidden" name="next" value={appNext} />}
              <input name="name" required maxLength={60} placeholder="Team name" className={input} />
              <button className="whitespace-nowrap rounded-lg bg-accent2 px-3.5 py-[9px] text-[12.5px] font-semibold text-white">Create team</button>
            </form>
          </>
        )}
      </section>

      <section className="mt-3 rounded-xl border border-line bg-row p-4">
        <div className="font-display text-[17px] font-medium text-txt">Join with an invite</div>
        <p className="mb-2.5 mt-1 text-[12.5px] text-muted">Paste the link a teammate sent you.</p>
        <form action={joinAction} className={row}>
          {appNext && <input type="hidden" name="next" value={appNext} />}
          <input name="invite" required placeholder="https://…/join/…" className={input} />
          <button className="whitespace-nowrap rounded-lg border border-line2 bg-row px-3.5 py-[9px] text-[12.5px] font-medium text-txt hover:border-line3">Join</button>
        </form>
      </section>
    </>
  );
}
```

In `src/app/welcome/page.tsx`, add `import { TeamForms } from "./team-forms";`, delete the `input`/`row` constants and the two `<section>` blocks plus the `invite_error` paragraph, and render in their place:

```tsx
        <TeamForms appNext={appNext} full={full} inviteError={invite_error} compact={inPanel} createAction={createTeam} joinAction={useInvite} />
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/__tests__/team-forms.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: The Console's no-team screen**

Create `src/app/desk/team-wall.tsx`:

```tsx
import { FONT_VARS } from "@/app/fonts";
import { createTeam, useInvite } from "@/app/welcome/actions";
import { TeamForms } from "@/app/welcome/team-forms";

// Mounted by desk/layout.tsx INSTEAD of the Desk when the signed-in person is
// on no team yet: step zero of the walkthrough, in the app. The forms return
// to /desk (createTeam and useInvite honour next=/desk), and the layout then
// renders the onboarding wall for the new team.
export function TeamWall({ login, full }: { login: string; full: string | null }) {
  const early = `try{var t=localStorage.getItem("devbrain_theme");if(t==="dark"||t==="system")document.documentElement.dataset.wgTheme=t;}catch(e){}`;
  return (
    <div className={`wg ${FONT_VARS} font-body flex h-screen flex-col bg-ink text-[13.5px] text-txt`}>
      <script dangerouslySetInnerHTML={{ __html: early }} />
      <div data-tauri-drag-region className="h-[34px] flex-shrink-0 bg-row" />
      <main className="mx-auto flex w-full max-w-[520px] flex-1 flex-col justify-center px-11 pb-16">
        <div className="font-mono text-[10px] uppercase tracking-[.12em] text-muted">Step 1 of 5</div>
        <h1 className="mt-2 font-display text-[32px] font-medium tracking-[-.02em] text-txt">Hi {login}</h1>
        <p className="mt-2 text-[13.5px] leading-[1.6] text-muted">You&apos;re signed in. Now you need a team — create one, or join with an invite link from a teammate. Linking a repository and setting up this Mac come next, right here.</p>
        <TeamForms appNext="/desk" full={full} compact={false} createAction={createTeam} joinAction={useInvite} />
        <form action="/auth/sign-out" method="post" className="mt-8 text-[12px] text-faint">
          <input type="hidden" name="from" value="desk" />
          <button className="hover:text-txt">Sign out</button>
        </form>
      </main>
    </div>
  );
}
```

In `src/app/desk/layout.tsx`, replace `if (!org) redirect("/welcome?from=desk");` with:

```tsx
  if (!org) {
    const m = (user.user_metadata ?? {}) as Record<string, unknown>;
    const login = String(m.user_name || m.preferred_username || user.email?.split("@")[0] || "there");
    return <TeamWall login={login} full={await signupBlock("team")} />;
  }
```

and add the imports `import { TeamWall } from "./team-wall";` and `import { signupBlock } from "@/lib/beta";`. (`user` is the value from `currentUser()` two lines above; `redirect` stays imported for the signed-out case.)

- [ ] **Step 6: The panel's no-team screen**

Create `src/app/widget/no-team.tsx`:

```tsx
"use client";

// The panel is 440 px and the team step is the start of the walkthrough, so
// the panel does not host the forms; it opens the Console, which does.
// Outside the app (no Tauri bridge) the link falls back to the browser page.
type Core = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
const core = (): Core | null => (window as unknown as { __TAURI__?: { core?: Core } }).__TAURI__?.core ?? null;

export function NoTeamPanel() {
  const open = () => {
    const c = core();
    if (!c) { window.location.href = "/welcome?from=widget"; return; }
    void c.invoke("open_desk", { route: "/desk" }).catch(() => { window.location.href = "/welcome?from=widget"; });
  };
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-6 text-center">
      <div className="font-display text-[22px] font-medium tracking-[-.02em] text-txt">One more step</div>
      <p className="mt-2 text-[13.5px] leading-[1.6] text-muted">You&apos;re signed in. Your team is set up in the Console — create one, or join with an invite link.</p>
      <button type="button" onClick={open} className="mx-auto mt-5 rounded-lg bg-accent2 px-4 py-[9px] text-[12.5px] font-semibold text-white">Open the Console</button>
    </main>
  );
}
```

In `src/app/widget/page.tsx`, replace `if (!org) redirect("/welcome?from=widget");` with `if (!org) return <NoTeamPanel />;` and add `import { NoTeamPanel } from "./no-team";`. Keep the `redirect` import (still used for the signed-out case).

- [ ] **Step 7: Full suite, typecheck, build**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/app/welcome/team-forms.tsx src/app/welcome/page.tsx src/app/desk/team-wall.tsx src/app/desk/layout.tsx src/app/widget/no-team.tsx src/app/widget/page.tsx src/lib/__tests__/team-forms.test.tsx
git commit -m "Team creation lives in the Console; the panel opens it"
```

---

### Task 11: Docs and the one site sentence

**Files:**
- Modify: `docs/HANDOFF-2026-09-13.md:17,184,196`
- Modify: `src/app/start/start-body.tsx:9`

- [ ] **Step 1: The tool count**

In `docs/HANDOFF-2026-09-13.md`, line 17: change `16 tools:` to `15 tools:` and delete `, \`devbrain\`` from the end of that list. Lines 184 and 196: change `all 16 tools` to `all 15 tools`. Confirm with `grep -n "16 tools" docs/HANDOFF-2026-09-13.md` returning nothing.

- [ ] **Step 2: The Safari sentence**

In `src/app/start/start-body.tsx`, change the first step's body to:

```ts
  { title: "Open the DMG", body: "It is in your Downloads folder, named DevBrain.dmg. Safari asks once whether to allow downloads from getdevbrain.com. Allow it. If the download still did not start, use the button below." },
```

(No em dash: `src/lib/__tests__/site-copy.test.tsx` sweeps this file.)

- [ ] **Step 3: Run the site tests and commit**

Run: `npx vitest run src/lib/__tests__/site-copy.test.tsx`
Expected: PASS.

```bash
git add docs/HANDOFF-2026-09-13.md src/app/start/start-body.tsx
git commit -m "Docs: 15 MCP tools; start page mentions Safari's download prompt"
```

---

### Task 12 (optional): Follow macOS appearance when nothing is stored

**This reverses a deliberate 2026-09-08 decision** ("Nothing stored = light", `src/app/globals.css:40-43`, `src/app/widget/theme.ts:3`). The test pass found that on a dark-mode Mac the panel opens light. Do this task only if the user has not struck it from the plan.

**Files:**
- Modify: `src/app/widget/theme.ts` (`readThemePref`)
- Modify: the three inline `early` scripts: `src/app/browser-shell.tsx:8`, `src/app/desk/layout.tsx:68`, `src/app/widget/layout.tsx:9`, and the copy of it in `src/app/desk/team-wall.tsx` from Task 10
- Modify: `src/app/globals.css:40-43` (the comment)

- [ ] **Step 1: The stored-nothing default becomes "system"**

In `src/app/widget/theme.ts`:

```ts
export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch { return "system"; }
}
```

and update the file's header comment: `"system" (the default when nothing is stored) | "light" | "dark"`.

- [ ] **Step 2: The before-paint scripts agree**

In each of the four files, replace the `early` string with:

```ts
  const early = `try{var t=localStorage.getItem("devbrain_theme");document.documentElement.dataset.wgTheme=(t==="dark"||t==="light")?t:"system";}catch(e){document.documentElement.dataset.wgTheme="system";}`;
```

`globals.css` already handles `html[data-wg-theme="system"]` under `prefers-color-scheme: dark`; a value of `"light"` matches no rule and keeps the light base, which is the intent.

- [ ] **Step 3: Update the CSS comment**

In `src/app/globals.css` lines 40-43, change `Nothing stored = light.` to `Nothing stored = system (follows macOS).` and the inline note on the `.wg` block to match.

- [ ] **Step 4: Full suite, typecheck, build, commit**

Run: `npx vitest run && npm run typecheck && npm run build`

```bash
git add src/app/widget/theme.ts src/app/browser-shell.tsx src/app/desk/layout.tsx src/app/widget/layout.tsx src/app/desk/team-wall.tsx src/app/globals.css
git commit -m "Theme: follow macOS appearance until the person picks one"
```

---

### Task 13: Verify on the live VMs after the user pushes

No code. After `main` is pushed and Vercel shows the deploy Ready, use the two VMs from the test pass (`cursor-mac` 192.168.64.8, `codex-mac` 192.168.64.9; ssh password `admin`; both apps auto-update from `main` on the next `devbrain update`, or run `~/.devbrain/bin/node ~/.devbrain/src/cli/bin/devbrain.mjs update` over ssh). Then, in the Console on `codex-mac` (deep link `open "devbrain://desk/tokens"` over ssh, then the mouse over VNC per `docs/APP-TESTING-2026-09-14.md` "Driving the VMs"):

1. Tokens: mint `verify-1`; copy it with the Copy button; `pbpaste` over ssh; `curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $(pbpaste)" https://getdevbrain.com/api/v1/context?repo=lukeb230/devbrain-playground` must print `200`. Mint `verify-1` again: the page must show the "already exists" notice and no token banner. Switch teams: the list must change.
2. Set up this Mac: on `codex-mac`, switch the Console to `northwind` (where the Mac is not set up) — the row must show step number 3, not a check. Press the button; `~/.devbrain/config.json` over ssh must now hold a different token, and `curl` with it against `/api/v1/context?repo=sandbox240/northwind-app` must not be `401`. Switch back to `lukeb230's team`: the row must show not-done (the token is now northwind's).
3. Codex: `codex exec --dangerously-bypass-hook-trust "Reply OK"` in `~/work/pg` must no longer print the clamping warning, and `devbrain doctor` must print the `codex hooks` line.
4. Sign-in with a fresh account: sign out in the panel on `cursor-mac`, sign in as `Luke-test-cursor` (the user does this), and confirm the panel shows "Open the Console", the Console shows the team forms, and creating a team lands on the onboarding wall — all inside the app, Safari untouched after the GitHub page.
5. Record the outcome of each in `docs/APP-TESTING-2026-09-14.md` under a new "Fix verification" heading.

---

## Self-Review

- **Spec coverage.** Findings and where they land: false green (Tasks 4-6), wrong-team re-run (Task 6, always mint), dead Console tokens (Task 1), `devbrain connect` (Task 3), cross-team list (Task 2), Codex hook review and timeout (Task 7), updater host (Task 8), team creation in the Console (Tasks 9-10), tool count and Safari sentence (Task 11), dark mode default (Task 12, optional), New-token double click (Task 1's `SubmitButton`). Not addressed on purpose: the one-off guard miss (unreproduced), Gatekeeper (needs assessment on, and a decision the user has parked), journals/PR review (not defects), label auto-capitalisation (macOS text-field behaviour; a `autoCapitalize="off"` attribute on the label `Field` would fix it and is a one-line follow-up if wanted).
- **Placeholders.** None: every code step carries the code; Task 2 Step 3 is an instruction with an exact command and criterion.
- **Type consistency.** `tokenInsertOutcome` (Task 1) returns `notice` names that exist in `NOTICES` (Task 1 Step 5). `OnboardingState.macLabels` (Task 4) is what `wall.tsx` passes to `MacStep` (Task 6). `macSetupState` (Task 5) is what `MacStep` calls (Task 6). `TeamForms` props (Task 10 Step 3) match the test (Step 1), `welcome/page.tsx`, and `TeamWall`. `migrateServer` return shape (Task 8) matches its test and its caller. `shouldMint` is removed in Task 5 and its only caller deleted in Task 6, committed together so `typecheck` never sees a half state.
- **Known limitation, stated.** The wall's heading ("You're set up") and `state.complete` remain server-side and can still say "set up" on a Mac that isn't; only the row is per-machine. Making the heading per-machine would need the hostname on the server (a Rust change to send it, or a cookie), which this plan avoids.

---

## Addendum (found in the live two-editor run, 2026-09-14 afternoon)

### Task 14: The guard and activity see Codex's `apply_patch` edits

**Files:**
- Modify: `plugin/hooks/host.mjs:85-89` (`editedFile`)
- Test: `plugin/hooks/__tests__/host.test.ts`

**Why:** Codex edits files through its `apply_patch` tool, whose input is the patch text (`*** Begin Patch\n*** Add File: src/hello.ts\n+// codex\n*** End Patch`), with no `file_path`/`path` field. `editedFile()` returns `null` for it, so `check-collision.mjs` exits before asking the guard and `presence.mjs` records no activity. Proven on `codex-mac`: a real Codex session wrote `src/hello.ts` while a live Cursor session on the other Mac was in that file; the guard counter never moved, and every Codex session in the digest shows `files=[]`. An identical edit expressed with a `file_path` returned "ask" with the DevBrain warning. The refusals Codex produced earlier in the day were the model obeying the injected brief, not the hook. (Edits Codex makes through `exec_command` shell commands remain outside the guard on every host; that is by design and unchanged here.)

**Interfaces:**
- Produces: `editedFile(input)` additionally returns the first path named by an `*** Add File:` / `*** Update File:` / `*** Delete File:` line when the tool input carries a patch body (`tool_input.input`, `tool_input.patch`, or `tool_input` itself as a string). Paths in patches are repo-relative; `check-collision.mjs` already leaves a non-absolute `rel` as is.

- [ ] **Step 1: Write the failing test**

In `plugin/hooks/__tests__/host.test.ts`, inside the `describe` that already tests `editedFile`, add:

```ts
  it("reads the file out of a Codex apply_patch body", () => {
    const patch = "*** Begin Patch\n*** Add File: src/hello.ts\n+// codex\n*** End Patch\n";
    expect(editedFile({ tool_name: "apply_patch", tool_input: { input: patch } })).toBe("src/hello.ts");
    expect(editedFile({ tool_name: "apply_patch", tool_input: { patch } })).toBe("src/hello.ts");
    expect(editedFile({ tool_name: "apply_patch", tool_input: patch })).toBe("src/hello.ts");
    expect(editedFile({ tool_name: "apply_patch", tool_input: { input: "*** Begin Patch\n*** Update File: src/b.ts\n@@\n+// x\n*** End Patch" } })).toBe("src/b.ts");
    expect(editedFile({ tool_name: "apply_patch", tool_input: { input: "*** Begin Patch\n*** Delete File: old.ts\n*** End Patch" } })).toBe("old.ts");
  });
  it("still prefers an explicit path and ignores non-patch strings", () => {
    expect(editedFile({ tool_input: { file_path: "/r/a.ts", input: "*** Add File: x.ts" } })).toBe("/r/a.ts");
    expect(editedFile({ tool_name: "exec_command", tool_input: { cmd: "echo hi >> src/a.ts" } })).toBeNull();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run plugin/hooks/__tests__/host.test.ts`
Expected: FAIL, `editedFile` returns `null` for the patch inputs.

- [ ] **Step 3: Implement**

Replace `editedFile` in `plugin/hooks/host.mjs` with:

```js
/** The file a tool call is about to change. Claude and Cursor name it
 *  (file_path / path / filePath). Codex's apply_patch carries a patch body
 *  instead, so read the first "*** Add|Update|Delete File: <path>" line —
 *  a repo-relative path, which the guard already accepts as-is. */
const PATCH_FILE = /^\*\*\* (?:Add|Update|Delete) File: (.+?)\s*$/m;
export function editedFile(input) {
  const ti = input?.tool_input;
  const cand = ti?.file_path ?? ti?.path ?? ti?.filePath ?? input?.file_path ?? input?.path ?? null;
  if (typeof cand === "string" && cand) return cand;
  const body = typeof ti === "string" ? ti : (typeof ti?.input === "string" ? ti.input : (typeof ti?.patch === "string" ? ti.patch : null));
  const m = body ? PATCH_FILE.exec(body) : null;
  return m ? m[1] : null;
}
```

- [ ] **Step 4: Run the test, then the whole hook suite**

Run: `npx vitest run plugin/hooks/__tests__/`
Expected: PASS. (`isEditTool` already matches `apply_patch` via `/patch|apply/`, and `check-collision.mjs` derives `rel` correctly for a path that does not start with the repo root.)

- [ ] **Step 5: Commit**

```bash
git add plugin/hooks/host.mjs plugin/hooks/__tests__/host.test.ts
git commit -m "Hooks: the guard and activity see Codex apply_patch edits"
```

Add to the plan's Task 13 live checklist: on `codex-mac`, with a live Cursor session on a file, `codex exec --dangerously-bypass-hook-trust "append a line to <that file>"` must now print `hook: PreToolUse` with the DevBrain "ask" reason, and the Codex session in the digest must list the file under `files`.

### Note for Task 7 (Codex): MCP tool calls in headless mode
`codex exec` runs with approval policy "never", and Codex refuses DevBrain's MCP tools with `MCP tool call requires approval, but approval policy is never`; the model then reported "CLAIMED" anyway. `codex exec --approve-for-me` (which cannot be combined with `--sandbox`) makes them run. Interactive `codex` asks the person, which worked in the live run. Add one sentence to the `codex hooks` doctor line from Task 7: "for codex exec, pass --approve-for-me so DevBrain's tools can run".

---

## Addendum 2 (three more findings from the live two-editor run, 2026-09-14 evening)

Also add these rows to the File Structure table:

| File | Responsibility after this plan |
|---|---|
| `src/lib/session-open.ts` (new) | Open a presence session: end this teammate's other open sessions for the same agent and repo, then insert. |
| `src/app/api/v1/ingest/route.ts` | `session_start` goes through `openSession`. |
| `plugin/hooks/host.mjs`, `plugin/hooks/presence.mjs` | `endsOwnSession()`: only the conversation the sidecar tracks ends a session. |
| `src/app/settings/org/actions.ts` | `pickOrg(orgId)` sets the team cookie and reports success; `switchOrg` is `pickOrg` + redirect. |
| `src/app/desk/nav.tsx`, `src/app/desk/jump.tsx`, `src/app/desk/layout.tsx` | Team switches call `pickOrg` and then do a full navigation to `/desk`; a failed switch says so. |
| `src/app/desk/picker.tsx` | Unchanged API; the sidebar passes widths that fit inside it. |
| `widget/src-tauri/src/main.rs` | `fit_desk()`: the Console window is sized and placed inside the screen's work area (menu bar and Dock excluded). |

### Task 15: One live session per teammate, agent and repo

**Files:**
- Create: `src/lib/session-open.ts`
- Modify: `src/app/api/v1/ingest/route.ts:58-72` (the `session_start` branch)
- Modify: `plugin/hooks/host.mjs` (add `endsOwnSession`), `plugin/hooks/presence.mjs` (the `session_end` branch, ~line 242)
- Test: `src/lib/__tests__/session-open.test.ts` (new), `plugin/hooks/__tests__/host.test.ts`

**Why:** `presence.mjs` keeps one sidecar per repo on the machine (`~/.devbrain/session-<owner>_<name>` holding the server session id, plus `.convo` holding the host conversation id). Every Cursor chat has a new `conversation_id`, so its `sessionStart` posts a new server session and overwrites the sidecar; the previous chat's row is orphaned with `ended_at` null. Switching back to an older chat tab fires `touch` with a conversation the sidecar no longer matches, which opens yet another session. When Cursor does send `sessionEnd` for an old chat, the hook reads the sidecar and ends whichever session is current, not the old one. Codex fires `SessionStart` twice around its hook-trust prompt (two conversation ids) and leaves two. Seen live: eight `cursor-mac` sessions open at once in the digest, all one person in one editor; they only leave when `last_seen` falls out of the 15-minute window.

The server is the one place every host passes through, so it enforces the rule the hooks already imply: a teammate (a token label) has one live session per agent per repo. A `session_start` ends this label's other open sessions for the same repo and agent, then inserts. Two Claude Code terminals in the same repo on the same Mac already share one sidecar (the second start overwrites the first's id, and every later post uses the newer id), so ending the first server-side matches what the hooks can track; it is not a regression. On the client, `session_end` only posts when the ending conversation is the one the sidecar tracks.

**Interfaces:**
- Produces: `openSession(admin, start: SessionStart, now?: Date): Promise<string | null>` in `src/lib/session-open.ts`, where `SessionStart = { org_id, repo_id, user_id, dev_label, agent_kind, branch, summary }`. `labelPattern(label)` escapes `%`, `_`, `\` for `ilike`.
- Produces: `endsOwnSession(convoFile: string, convo: string): boolean` in `plugin/hooks/host.mjs`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/session-open.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { labelPattern, openSession } from "@/lib/session-open";
import type { supabaseAdmin } from "@/lib/supabase/server";

// A recording stand-in for the admin client: every builder call is appended to
// the current chain's record as [method, ...args]; awaiting a chain resolves it.
function fakeAdmin(calls: unknown[][][], insertId: string | null = "s-new") {
  return {
    from(table: string) {
      const rec: unknown[][] = [["from", table]];
      calls.push(rec);
      const api: Record<string, unknown> = {};
      for (const m of ["update", "insert", "select", "eq", "ilike", "is", "single"]) {
        api[m] = (...a: unknown[]) => { rec.push([m, ...a]); return api; };
      }
      api.then = (resolve: (v: unknown) => void) => resolve({ data: insertId ? { id: insertId } : null, error: null });
      return api;
    },
  } as unknown as ReturnType<typeof supabaseAdmin>;
}

const START = { org_id: "org-1", repo_id: "r-1", user_id: "u-1", dev_label: "cursor-mac", agent_kind: "cursor", branch: "main", summary: null };

describe("openSession", () => {
  it("ends the teammate's other open sessions for this agent and repo, then inserts", async () => {
    const calls: unknown[][][] = [];
    const id = await openSession(fakeAdmin(calls), START, new Date("2026-09-14T15:00:00Z"));
    expect(id).toBe("s-new");
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual([
      ["from", "sessions"],
      ["update", { ended_at: "2026-09-14T15:00:00.000Z" }],
      ["eq", "org_id", "org-1"],
      ["eq", "repo_id", "r-1"],
      ["ilike", "dev_label", "cursor-mac"],
      ["eq", "agent_kind", "cursor"],
      ["is", "ended_at", null],
    ]);
    expect(calls[1]).toEqual([["from", "sessions"], ["insert", START], ["select", "id"], ["single"]]);
  });

  it("returns null when the insert stores nothing", async () => {
    expect(await openSession(fakeAdmin([], null), START)).toBeNull();
  });
});

describe("labelPattern", () => {
  it("matches a label literally under ilike", () => {
    expect(labelPattern("Luke's MacBook")).toBe("Luke's MacBook");
    expect(labelPattern("a_b%c\\d")).toBe("a\\_b\\%c\\\\d");
  });
});
```

In `plugin/hooks/__tests__/host.test.ts`, extend the imports and add a describe:

```ts
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectHost, editedFile, endsOwnSession, hostLabel, isEditTool, normalizeHost, relative, sessionKey, workdir } from "../host.mjs";
```

```ts
describe("endsOwnSession", () => {
  it("only the conversation the sidecar tracks ends the session", () => {
    const f = join(mkdtempSync(join(tmpdir(), "dbk-")), "session-acme_app.convo");
    expect(endsOwnSession(f, "c1")).toBe(true); // no record (pre-hooks session) → ours
    writeFileSync(f, "c1\n");
    expect(endsOwnSession(f, "c1")).toBe(true);
    expect(endsOwnSession(f, "c2")).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/__tests__/session-open.test.ts plugin/hooks/__tests__/host.test.ts`
Expected: FAIL — `@/lib/session-open` cannot be resolved; `endsOwnSession` is not exported.

- [ ] **Step 3: Implement the server side**

Create `src/lib/session-open.ts`:

```ts
import type { supabaseAdmin } from "@/lib/supabase/server";

// ============================================================================
// Opening a presence session. A teammate (a token label) runs one live session
// per agent per repo: the hooks keep one sidecar per repo on the machine, so a
// second start from the same host already makes the first untrackable there.
// Ending it here keeps the digest honest — Cursor opens a new conversation per
// chat and never formally ends the old one; Codex restarts around its hook
// trust prompt. Ownership is org + label, never user_id (see ingest/route.ts).
// ============================================================================

export type SessionStart = {
  org_id: string;
  repo_id: string;
  user_id: string;
  dev_label: string;
  agent_kind: string;
  branch: string | null;
  summary: string | null;
};

/** Escape ilike wildcards so a label is matched literally, case-insensitively. */
export function labelPattern(label: string): string {
  return label.replace(/[%_\\]/g, "\\$&");
}

/** Ends this teammate's other open sessions for the same agent and repo, then
 *  opens the new one. Returns the new session id, or null if nothing was stored. */
export async function openSession(admin: ReturnType<typeof supabaseAdmin>, s: SessionStart, now = new Date()): Promise<string | null> {
  await admin
    .from("sessions")
    .update({ ended_at: now.toISOString() })
    .eq("org_id", s.org_id)
    .eq("repo_id", s.repo_id)
    .ilike("dev_label", labelPattern(s.dev_label))
    .eq("agent_kind", s.agent_kind)
    .is("ended_at", null);
  const { data } = await admin.from("sessions").insert(s).select("id").single();
  return data?.id ?? null;
}
```

In `src/app/api/v1/ingest/route.ts`, add `import { openSession } from "@/lib/session-open";` and replace the `session_start` branch (lines 58–72) with:

```ts
  if (kind === "session_start") {
    const session_id = await openSession(admin, {
      org_id: repo.org_id,
      repo_id: repo.id,
      user_id: auth.user_id,
      dev_label: auth.label,
      branch: cap(body.branch, 200),
      summary: cap(body.summary, 200),
      agent_kind: cap(body.agent, 40) ?? "claude-code",
    });
    return NextResponse.json({ ok: true, session_id });
  }
```

- [ ] **Step 4: Implement the hook side**

In `plugin/hooks/host.mjs` (it already imports `readFileSync` from `node:fs`), add next to `sessionKey`:

```js
/** True when the conversation ending now is the one the sidecar tracks. A
 *  sidecar with no record (a session that predates the hooks) counts as ours.
 *  A chat closed after a newer one opened was already superseded by that
 *  start server-side; ending "the current id" would close the live chat. */
export function endsOwnSession(convoFile, convo) {
  try { return readFileSync(convoFile, "utf8").trim() === convo; } catch { return true; }
}
```

In `plugin/hooks/presence.mjs`, add `endsOwnSession` to the import from `./host.mjs` and replace the `session_end` branch with:

```js
  if (kind === "session_end") {
    const mine = endsOwnSession(sessionFile + ".convo", sessionKey(hookInput));
    if (session_id && mine) await post({ kind: "session_end", repo, session_id });
    queueJournal({ cfg, repo, session_id: mine ? session_id : undefined, hookInput });
    process.exit(0);
  }
```

- [ ] **Step 5: Run the tests, then the whole suite**

Run: `npx vitest run`
Expected: PASS. (`digest.test.ts` is unaffected: `active_sessions` still lists whatever open rows the context route returns; there are simply fewer of them.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/session-open.ts src/lib/__tests__/session-open.test.ts src/app/api/v1/ingest/route.ts plugin/hooks/host.mjs plugin/hooks/presence.mjs plugin/hooks/__tests__/host.test.ts
git commit -m "Presence: one live session per teammate, agent and repo"
```

Add to Task 13's live checklist: on `cursor-mac`, open three agent chats in a row in the linked repo and send one prompt in each; `curl -s -H "Authorization: Bearer <token>" "https://getdevbrain.com/api/v1/context?repo=sandbox240/neap" | python3 -c 'import json,sys; print([s["agent"] for s in json.load(sys.stdin)["active_sessions"] if s["dev"]=="cursor-mac"])'` must print one `cursor` entry, not three. Then close the oldest chat: the remaining entry must still be there (the live chat's session was not ended by the old one).

### Task 16: A click on a team in the switcher switches the team

**Files:**
- Modify: `src/app/settings/org/actions.ts:11-19` (`switchOrg`; add `pickOrg`)
- Modify: `src/app/desk/nav.tsx:1-6, 14-24, 37-42, 59` (imports, props, `pickTeam`, the team `Picker`)
- Modify: `src/app/desk/jump.tsx:32-36, 89` (props, the Teams entries)
- Modify: `src/app/desk/layout.tsx:5, 85, 95` (pass `pickOrg`)
- Test: `src/lib/__tests__/pick-org.test.ts` (new)

**Why:** Live on `codex-mac`, three of four mouse clicks on a team in the sidebar switcher did nothing; the keyboard path (open, ↓, Return) worked; BUG 3 on day one was the same control showing the old team's name after the page had in fact switched. The click cannot be made to fail deterministically from the code, but the path has three ways to go silently wrong, and this task removes all three:

1. `switchOrg` returns `void` without doing anything when `currentOrg()` comes back null or does not list the org; the click then does nothing and nobody is told.
2. `pickTeam` calls the action inside `startTransition` and relies on the action's `redirect()` to navigate. The onboarding wall runs `RefreshWhile`, which calls `router.refresh()` every 5 s; a redirect issued from a client transition while a refresh is in flight can be superseded by the refresh's response, which then renders the layout with the cookie state the refresh started with (BUG 3's stale label, or nothing visible at all).
3. The popover is 200 px wide inside a 180 px sidebar whose `overflow-y-auto` also clips horizontally, so the current-team tick and the right of each row are cut off; you cannot see which team is current, and the repo popover (232 px) loses its owner hints too.

The fix: a server action that only sets the cookie and reports the outcome, a full navigation to `/desk` on success (a full load cannot be dropped by a pending refresh, and the whole shell re-renders under the new team), a visible message on failure, and popovers that fit in the sidebar.

**Interfaces:**
- Produces: `pickOrg(orgId: string): Promise<PickOrgResult>` with `PickOrgResult = { ok: true } | { ok: false; reason: "signed_out" | "not_member" }` in `src/app/settings/org/actions.ts`. `switchOrg(formData)` keeps its signature for the `<form>` callers on `/settings/org` and the widget.
- `DeskNav` and `Jump` take `pickOrg: (orgId: string) => Promise<PickOrgResult>` instead of `switchOrg`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/pick-org.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// pickOrg with next/headers and the org context stubbed: it must set the team
// cookie for a member, refuse a non-member without touching cookies, and say
// "signed_out" when there is no session — never a silent void.
const jar = { set: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => jar }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
const currentOrg = vi.fn(async () => null as null | { orgs: { id: string }[] });
vi.mock("@/lib/org", () => ({ currentOrg: () => currentOrg(), requireRoleOrRedirect: async () => null }));

const { pickOrg, switchOrg } = await import("@/app/settings/org/actions");

describe("pickOrg", () => {
  beforeEach(() => { jar.set.mockClear(); currentOrg.mockResolvedValue(null); });

  it("sets the team cookie and forgets the last repo for a member", async () => {
    currentOrg.mockResolvedValue({ orgs: [{ id: "org-1" }, { id: "org-2" }] });
    expect(await pickOrg("org-2")).toEqual({ ok: true });
    const names = jar.set.mock.calls.map((c) => [c[0], c[1]]);
    expect(names).toContainEqual(["devbrain_org", "org-2"]);
    expect(names).toContainEqual(["devbrain_last_repo", ""]);
  });

  it("refuses a team the person is not in, without touching cookies", async () => {
    currentOrg.mockResolvedValue({ orgs: [{ id: "org-1" }] });
    expect(await pickOrg("org-9")).toEqual({ ok: false, reason: "not_member" });
    expect(jar.set).not.toHaveBeenCalled();
  });

  it("says signed_out when there is no session", async () => {
    expect(await pickOrg("org-1")).toEqual({ ok: false, reason: "signed_out" });
    expect(jar.set).not.toHaveBeenCalled();
  });
});

describe("switchOrg", () => {
  it("is pickOrg plus the redirect", async () => {
    currentOrg.mockResolvedValue({ orgs: [{ id: "org-1" }] });
    const fd = new FormData();
    fd.set("orgId", "org-1");
    fd.set("next", "/desk");
    await expect(switchOrg(fd)).rejects.toThrow("REDIRECT:/desk");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/__tests__/pick-org.test.ts`
Expected: FAIL — `pickOrg` is not exported.

- [ ] **Step 3: Implement the action**

In `src/app/settings/org/actions.ts`, replace `switchOrg` with:

```ts
export type PickOrgResult = { ok: true } | { ok: false; reason: "signed_out" | "not_member" };

/** Make `orgId` the active team. Sets the cookie and reports the outcome;
 *  never redirects, so the Desk's client-side switchers can do a full
 *  navigation themselves — one that no in-flight router.refresh() can drop. */
export async function pickOrg(orgId: string): Promise<PickOrgResult> {
  const me = await currentOrg();
  if (!me) return { ok: false, reason: "signed_out" };
  if (!me.orgs.some((o) => o.id === orgId)) return { ok: false, reason: "not_member" };
  const jar = await cookies();
  jar.set(COOKIE.org, orgId, ORG_COOKIE_OPTS);
  clearDevbrainCookies(jar, [{ name: COOKIE.lastRepo, path: "/" }]); // never carry a repo across teams
  return { ok: true };
}

/** The <form> version (settings page, widget): pick, then go back. */
export async function switchOrg(formData: FormData): Promise<void> {
  const r = await pickOrg(String(formData.get("orgId") || ""));
  if (!r.ok) return;
  redirect(returnTo(formData, "/dashboard"));
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/__tests__/pick-org.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the sidebar**

In `src/app/desk/nav.tsx`:

Replace line 5 `import { useTransition } from "react";` with `import { useState } from "react";` and add `import type { PickOrgResult } from "@/app/settings/org/actions";`.

Replace the prop `switchOrg: (fd: FormData) => Promise<void>;` (and the name in the destructuring on line 14) with `pickOrg: (orgId: string) => Promise<PickOrgResult>;`.

Delete `const [, start] = useTransition();` and replace `pickTeam` (lines 37–42) with:

```tsx
  const [switching, setSwitching] = useState<string | null>(null);
  const [switchFailed, setSwitchFailed] = useState(false);
  const pickTeam = async (id: string) => {
    if (switching) return;
    setSwitching(id);
    setSwitchFailed(false);
    const r = await pickOrg(id).catch((): PickOrgResult => ({ ok: false, reason: "signed_out" }));
    if (r.ok) { window.location.assign("/desk"); return; } // full load: nothing pending can drop it
    setSwitching(null);
    setSwitchFailed(true);
  };
```

Replace the team `Picker` line (59) with:

```tsx
          <>
            <Picker items={orgs.map((o) => ({ key: o.id, label: o.name }))} value={orgId} onPick={(id) => { void pickTeam(id); }} width={160} title="Team" label={switching ? "Switching…" : undefined} />
            {switchFailed && <p className="px-1.5 pt-0.5 text-[11px] leading-snug text-stop">Couldn't switch teams. Try again.</p>}
          </>
```

Change the repo `Picker`'s `width={232}` to `width={164}` (the sidebar is 180 px with 8 px padding; both popovers now sit inside it, tick and hints visible; long names truncate as the rows already do).

In `src/app/desk/jump.tsx`: replace the prop `switchOrg: (fd: FormData) => Promise<void>;` (and the name in the destructuring on line 32) with `pickOrg: (orgId: string) => Promise<PickOrgResult>;`, add `import type { PickOrgResult } from "@/app/settings/org/actions";`, and replace the Teams line (89) with:

```tsx
    for (const o of orgs) add({ key: `o:${o.id}`, group: "Teams", label: o.name, current: o.id === orgId, go: () => { close(); void pickOrg(o.id).then((r) => { if (r.ok) window.location.assign("/desk"); }); } }, o.name);
```

If `start` from `useTransition` is now unused in `jump.tsx`, remove it and the `useTransition` import (keep it if the repo/page `go()` still uses it).

In `src/app/desk/layout.tsx`: change line 5 to `import { pickOrg } from "@/app/settings/org/actions";` and pass `pickOrg={pickOrg}` in place of `switchOrg={switchOrg}` on both the `DeskNav` (line 85) and `Jump` (line 95) elements.

- [ ] **Step 6: Typecheck, lint, tests**

Run: `npx tsc --noEmit && npx next lint && npx vitest run`
Expected: all clean. The only remaining `switchOrg` callers are `<form action={switchOrg}>` elements (`grep -rn "switchOrg" src/` must show only `actions.ts` and form usages).

- [ ] **Step 7: Commit**

```bash
git add src/app/settings/org/actions.ts src/lib/__tests__/pick-org.test.ts src/app/desk/nav.tsx src/app/desk/jump.tsx src/app/desk/layout.tsx
git commit -m "Console: a team click switches the team, and says so when it can't"
```

Add to Task 13's live checklist: in the Console on `codex-mac`, click a different team in the sidebar switcher five times in a row (alternating); every click must land on `/desk` under the clicked team with the sidebar label updated, including with the onboarding wall showing (it refreshes every 5 s). With the popover open, the ✓ next to the current team must be visible.

### Task 17: The Console window fits the screen it opens on

**Files:**
- Modify: `widget/src-tauri/src/main.rs:396-400` (`raise_desk`), `:659-707` (the Desk window build), plus a new `fit_desk` fn and a `#[cfg(test)]` module
- Modify: `widget/src-tauri/tauri.conf.json:4` (version `0.4.11` → `0.4.12`; the app ships through GitHub Releases, so the Rust change reaches a Mac only in a new build)
- Test: Rust unit tests in `main.rs` (`cargo test desk_fit`)

**Why:** The Desk opens at `DESK_W × DESK_H` = 1180 × 760 points and is only ever clamped *up* to `DESK_MIN_*` (880 × 560). On the VMs' 1024 × 768 display the work area (screen minus menu bar and Dock) is about 1024 × 673, so the window's bottom 90-odd points sit under the Dock: the onboarding wall's last row, "Skip for now — I'll finish later", could only be clicked after hiding the Dock. The same happens when remembered bounds come from a bigger display (a laptop unplugged from its monitor). `work_area()` already exists in `main.rs` (the panel uses it to sit above the Dock); the Desk just never asked. The web layout is not at fault: `desk/layout.tsx` and `wall.tsx` already form a correct `min-h-0` scroll chain, and once the window is inside the work area the row is reachable by scrolling.

**Interfaces:**
- Produces: `fn fit_desk(want: Option<Bounds>, wa: (f64, f64, f64, f64)) -> Bounds` — size clamped to `[DESK_MIN, work area]`, position kept inside the work area, or centred in it when nothing is remembered.

- [ ] **Step 1: Write the failing tests**

At the end of `widget/src-tauri/src/main.rs`, add:

```rust
#[cfg(test)]
mod desk_fit_tests {
    use super::*;
    /// 1024×768 with the menu bar (25 pt) and a 70 pt Dock.
    const SMALL: (f64, f64, f64, f64) = (0.0, 25.0, 1024.0, 673.0);

    #[test]
    fn default_size_shrinks_to_a_small_work_area() {
        let b = fit_desk(None, SMALL);
        assert_eq!((b.w, b.h), (1024.0, 673.0));
        assert_eq!((b.x, b.y), (0.0, 25.0));
    }

    #[test]
    fn remembered_bounds_from_a_bigger_display_are_pulled_inside() {
        let b = fit_desk(Some(Bounds { x: 300.0, y: 200.0, w: 1400.0, h: 900.0 }), SMALL);
        assert_eq!((b.x, b.y, b.w, b.h), (0.0, 25.0, 1024.0, 673.0));
    }

    #[test]
    fn a_window_that_already_fits_is_left_alone() {
        let b = fit_desk(Some(Bounds { x: 10.0, y: 40.0, w: 900.0, h: 600.0 }), SMALL);
        assert_eq!((b.x, b.y, b.w, b.h), (10.0, 40.0, 900.0, 600.0));
    }

    #[test]
    fn a_big_display_centres_the_default() {
        let b = fit_desk(None, (0.0, 25.0, 1728.0, 1030.0));
        assert_eq!((b.w, b.h), (DESK_W, DESK_H));
        assert_eq!((b.x, b.y), (274.0, 160.0));
    }

    #[test]
    fn never_below_the_minimum() {
        let b = fit_desk(None, (0.0, 25.0, 800.0, 500.0));
        assert_eq!((b.w, b.h), (DESK_MIN_W, DESK_MIN_H));
        assert_eq!((b.x, b.y), (0.0, 25.0));
    }
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd widget/src-tauri && cargo test desk_fit`
Expected: compile error, `fit_desk` not found.

- [ ] **Step 3: Implement**

Add after `fn work_area` in `main.rs`:

```rust
/// Size and place the Desk so it sits inside the work area (the screen minus
/// the menu bar and the Dock). Remembered bounds from a bigger display, or the
/// 1180×760 default on a small one, otherwise leave the bottom of the window
/// under the Dock — the onboarding wall's last row was unreachable at 1024×768.
/// Never smaller than DESK_MIN_*: if the work area is smaller still, the
/// window keeps the minimum and sits at the work area's top-left.
fn fit_desk(want: Option<Bounds>, wa: (f64, f64, f64, f64)) -> Bounds {
    let (wx, wy, ww, wh) = wa;
    let w = want.map(|b| b.w).unwrap_or(DESK_W).max(DESK_MIN_W).min(ww.max(DESK_MIN_W));
    let h = want.map(|b| b.h).unwrap_or(DESK_H).max(DESK_MIN_H).min(wh.max(DESK_MIN_H));
    let (x, y) = match want {
        Some(b) => (
            b.x.max(wx).min((wx + ww - w).max(wx)),
            b.y.max(wy).min((wy + wh - h).max(wy)),
        ),
        None => (wx + ((ww - w) / 2.0).max(0.0), wy + ((wh - h) / 2.0).max(0.0)),
    };
    Bounds { x, y, w, h }
}
```

In the Desk window build (around line 659), replace

```rust
            let desk_bounds = settings.desk;
```
with
```rust
            let desk_fit = fit_desk(settings.desk, work_area(app.handle()));
```
replace the `.inner_size(...)` line (699) with
```rust
                .inner_size(desk_fit.w, desk_fit.h)
```
and replace the `if let Some(b) = desk_bounds { … } else { let _ = desk.center(); }` block (703–707) with
```rust
            let _ = desk.set_position(LogicalPosition::new(desk_fit.x, desk_fit.y));
```

In `raise_desk` (line 398–401), replace the body of the `if let Some(b)` with:

```rust
    if let Some(b) = *app.state::<State>().desk.lock().unwrap() {
        let fit = fit_desk(Some(b), work_area(&app));
        let _ = desk.set_size(LogicalSize::new(fit.w, fit.h));
        let _ = desk.set_position(LogicalPosition::new(fit.x, fit.y));
    }
```

Bump `"version"` in `widget/src-tauri/tauri.conf.json` to `0.4.12`.

- [ ] **Step 4: Test and check**

Run: `cd widget/src-tauri && cargo test desk_fit && cargo check`
Expected: 5 tests pass; check clean (no unused-variable warning for `desk_bounds`).

- [ ] **Step 5: Commit**

```bash
git add widget/src-tauri/src/main.rs widget/src-tauri/tauri.conf.json
git commit -m "App: the Console window fits the screen's work area"
```

Add to Task 13's live checklist: after the 0.4.12 build is installed on `cursor-mac` (1024×768, Dock visible), open the Console with `open "devbrain://desk"`; the window's bottom edge must sit above the Dock, and on the onboarding wall the "Skip for now" row must be clickable after scrolling, without hiding the Dock. Quit and reopen the Console: the position must survive and still be inside the work area.
