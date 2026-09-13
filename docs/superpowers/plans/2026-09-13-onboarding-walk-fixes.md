# Onboarding Walk Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every defect found while walking the first-run onboarding end to end in the VM on 2026-09-13, so a fresh Mac, a Mac that already belongs to another team, and a browser hand-off all reach a green walkthrough without a dead end.

**Architecture:** Six independent fixes, each a small change on the existing onboarding, sign-in and hand-off code. Pure decisions get a pure function with a vitest; UI changes stay inside the components that already own the behaviour. No schema change, no new route except a form field on an existing one.

**Tech Stack:** Next.js 15 App Router (server components + server actions), Supabase admin client, Tauri 2 IPC from `widget/src-tauri`, vitest for `src/lib/__tests__`.

**Spec:** `docs/superpowers/specs/2026-09-12-first-run-onboarding-design.md` (the onboarding design this plan repairs). Findings come from the VM walk recorded in the session on 2026-09-13.

## Global Constraints

- Product repo only: `~/Downloads/devbrain-product`. Never touch `~/Downloads/devbrain` (frozen FlowSync).
- Step completion stays DERIVED from rows (`src/lib/onboarding.ts` header). No stored "done" flags.
- Every Desk form that redirects carries `<DeskNext />` and goes through `returnTo()` (`src/lib/surface.ts`).
- Cookies are declared in `src/lib/cookies.ts` with their path; deletion must match the path.
- Tests: `npm test` (vitest, no DB or network), `npm run typecheck`. Rust: `cd widget/src-tauri && cargo check` only if a Rust file changes (none planned).
- Do not raise notarization or code signing in any commit message or comment beyond the single line in "Out of scope" below.
- Copy rules: sentence case, no jargon a non-developer would not know, controls say what happens.

## Findings → tasks

| # | Finding from the walk | Root cause (verified in code) | Task |
|---|---|---|---|
| 1 | Step 3 "Set up this Mac" stays red when the Mac already holds a token for another team; copy does not explain it | `SetupMac` invokes `bootstrap` with `token: null`. The CLI reuses whatever token `config.json` has (`cli/bin/devbrain.mjs:710-711`), so no token is ever minted for the team being onboarded. On a Mac with no config at all the CLI exits "--token required". The panel path (`widget/app.tsx:182-190`) mints first via `mintDeviceToken`; the wall never does. | 1 |
| 2 | `/open` "Open the Console in the app" is `devbrain://`; dead on a Mac that only has the Beta build | `/open` hard-codes the stable scheme and puts beta in a footnote. The server never learns which channel the person's app is. `/auth/device/start` receives `channel=` and discards it. | 2 |
| 3 | Wall stays stale after the browser hand-off (repo linked, wall still says "Link a repository") until the user navigates | `RefreshWhile` is active only for `requested` or the it's-working wait; the blocking `none` state does not poll. The "requested" banner in the Desk layout says "this page updates itself" but the layout has no `RefreshWhile` at all. | 3 |
| 4 | No way to sign out of the Console | Only the panel has a sign-out form (`widget/app.tsx:572`). `/auth/sign-out` always redirects to `/`, which is the marketing landing, not the in-app sign-in. | 4 |
| 5 | One-shot notice (install_owned / preset_failed) repeats on every page for 60 s | The layout reads `COOKIE.notice` and nothing clears it. | 5 |
| 6 | Small follow-ups from the code reviews | `createTeam` ignores `next=/desk`; `preset_failed` is in `DeniedCode` but is a notice key, not an error code; `ExternalLink` has no tooltip saying it leaves the app; the webhook's request-event query is `.limit(200)` shared across every org the requester belongs to. | 6 |

**Reminders re-prompt after an app update** is not a code defect: the app is ad-hoc signed, so every build has a new code identity and macOS treats it as a new app. It resolves itself when the app ships with a stable signing identity (already on the release checklist). No task.

---

### Task 1: The wall mints a token for the team being set up

**Files:**
- Modify: `src/app/desk/onboarding/setup-mac.tsx`
- Modify: `src/app/desk/onboarding/wall.tsx:123-129` (the `mac` case passes org details)
- Modify: `src/app/widget/actions.ts:42` (no logic change; import path only if needed)
- Create: `src/lib/setup-mac-copy.ts`
- Test: `src/lib/__tests__/setup-mac-copy.test.ts`

**Interfaces:**
- Consumes: `mintDeviceToken(labelRaw: string, orgId?: string): Promise<{ token; label; team } | { error }>` from `src/app/widget/actions.ts` (server action, already exported). `setup_state` IPC returning `{ has_token, hostname, bootstrap_ok, bootstrap_failed, bootstrap_at, configured }`.
- Produces: `setupMacCopy({ done, hasToken, orgName }): { button: string; note: string | null }` — the only place the step's button label and explanatory note are decided.

- [ ] **Step 1: Write the failing test for the copy decision**

```ts
// src/lib/__tests__/setup-mac-copy.test.ts
import { describe, expect, it } from "vitest";
import { setupMacCopy } from "../setup-mac-copy";

describe("setupMacCopy", () => {
  it("fresh Mac: plain set-up button, no note", () => {
    expect(setupMacCopy({ done: false, hasToken: false, orgName: "Northwind" })).toEqual({ button: "Set up this Mac", note: null });
  });
  it("Mac already belongs to another team: explains the switch", () => {
    const c = setupMacCopy({ done: false, hasToken: true, orgName: "Northwind" });
    expect(c.button).toBe("Switch this Mac to Northwind");
    expect(c.note).toBe("This Mac is set up for a different team. Switching it to Northwind means your editor sessions show up here instead.");
  });
  it("done: re-run only, no note", () => {
    expect(setupMacCopy({ done: true, hasToken: true, orgName: "Northwind" })).toEqual({ button: "Re-run setup", note: null });
  });
  it("done but config lost locally still offers re-run", () => {
    expect(setupMacCopy({ done: true, hasToken: false, orgName: "Northwind" }).button).toBe("Re-run setup");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/setup-mac-copy.test.ts`
Expected: FAIL — cannot find module `../setup-mac-copy`.

- [ ] **Step 3: Write the pure function**

```ts
// src/lib/setup-mac-copy.ts
// ============================================================================
// Step 3 of the walkthrough, "Set up this Mac". `done` is the SERVER's view
// (a live dev token for this user in THIS team); `hasToken` is the MAC's view
// (config.json holds some token — for any team). The two disagree exactly
// when the Mac was set up for a different team, and that is the one case
// that needs a sentence before the click.
// ============================================================================
export function setupMacCopy(i: { done: boolean; hasToken: boolean; orgName: string }): { button: string; note: string | null } {
  if (i.done) return { button: "Re-run setup", note: null };
  if (i.hasToken) {
    return {
      button: `Switch this Mac to ${i.orgName}`,
      note: `This Mac is set up for a different team. Switching it to ${i.orgName} means your editor sessions show up here instead.`,
    };
  }
  return { button: "Set up this Mac", note: null };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/__tests__/setup-mac-copy.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Make `SetupMac` mint when the server says the step is not done**

Replace `src/app/desk/onboarding/setup-mac.tsx` in full:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { mintDeviceToken } from "@/app/widget/actions";
import { setupMacCopy } from "@/lib/setup-mac-copy";

type Core = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
type Setup = { has_token?: boolean; hostname?: string; bootstrap_ok?: boolean | null; bootstrap_failed?: string[]; bootstrap_at?: string | null; configured?: boolean };

const core = (): Core | null => (window as unknown as { __TAURI__?: { core?: Core } }).__TAURI__?.core ?? null;

// One click: mint a token for THIS team (the user never sees it), then the
// app installs the CLI, plugin and hooks (setup::bootstrap in
// widget/src-tauri/src/setup.rs). `done` is the server's view — a live token
// for this user in this team. While it is false we ALWAYS mint, even if the
// Mac already holds a token: that token belongs to another team, and the CLI
// overwrites config.json's token when one is passed (devbrain bootstrap
// --token). Re-running once done passes no token and keeps the current one.
export function SetupMac({ done, orgId, orgName }: { done: boolean; orgId: string; orgName: string }) {
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
      let token: string | null = null;
      if (!done) {
        const label = (setup?.hostname ?? "").trim().slice(0, 60) || "my-mac";
        const minted = await mintDeviceToken(label, orgId);
        if ("error" in minted) throw new Error(minted.error);
        token = minted.token;
      }
      await c.invoke("bootstrap", { server: window.location.origin, token, remindersList: null, remindersRepo: null });
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
  const copy = setupMacCopy({ done, hasToken: Boolean(setup?.has_token), orgName });
  const failed = setup?.bootstrap_failed ?? [];
  return (
    <div>
      {copy.note && <p className="mb-2 text-[12.5px] text-wait">{copy.note}</p>}
      <button type="button" onClick={run} disabled={busy || setup === null} className="rounded-lg bg-accent2 px-3.5 py-[9px] text-[12.5px] font-semibold text-white disabled:opacity-60">
        {busy ? "Setting up…" : copy.button}
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

Note the button is disabled until `setup_state` has answered, so the copy never flips from "Set up" to "Switch" under the cursor.

- [ ] **Step 6: Pass the team into the step from the wall**

In `src/app/desk/onboarding/wall.tsx`, the `body()` helper does not receive `org`. Change its context parameter and the `mac` case:

```tsx
// in OnboardingWall's <li> map, replace the body() call's context object:
{body(s, { isOwner, isAdmin, repos, installUrl, state, policies, orgId: org.orgId, orgName: org.orgName })}
```

```tsx
// body()'s signature gains the two fields:
function body(s: Step, c: { isOwner: boolean; isAdmin: boolean; repos: TeamRepo[]; installUrl: string; state: OnboardingState; policies: Record<string, boolean>; orgId: string; orgName: string }) {
```

```tsx
    case "mac":
      return (
        <>
          One click installs the DevBrain command, the editor plugin and its hooks for Claude Code, Cursor and Codex, and keeps them updated. You'll be asked to allow Notifications and Reminders.
          <div className="mt-2"><SetupMac done={s.done} orgId={c.orgId} orgName={c.orgName} /></div>
        </>
      );
```

- [ ] **Step 7: Typecheck and the full suite**

Run: `npm run typecheck && npm test`
Expected: both clean. (`mintDeviceToken` is a `"use server"` export; importing it into a client component is the same pattern the panel uses at `widget/app.tsx:10`.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/setup-mac-copy.ts src/lib/__tests__/setup-mac-copy.test.ts src/app/desk/onboarding/setup-mac.tsx src/app/desk/onboarding/wall.tsx
git commit -m "Onboarding: Set up this Mac mints a token for the team being set up

The wall called bootstrap with no token, so the CLI kept whichever token
config.json already had (another team's) or refused on a fresh Mac. Mint
for this team whenever the server says step 3 is not done, and say so
when the Mac is being switched from another team."
```

---

### Task 2: `/open` opens the app the person actually has

**Files:**
- Modify: `src/lib/cookies.ts:6-12` (add `channel`), `:17-21` (opts)
- Modify: `src/app/auth/device/start/route.ts:59-67` (set the cookie on the HTML response)
- Modify: `src/app/open/page.tsx:62-79`
- Create: `src/lib/app-channel.ts`
- Test: `src/lib/__tests__/app-channel.test.ts`, extend `src/lib/__tests__/cookies.test.ts`

**Interfaces:**
- Produces: `COOKIE.channel = "devbrain_channel"`, `CHANNEL_COOKIE_OPTS` (path `/`, one year). `appChannel(raw: string | undefined): { channel: "stable" | "beta"; scheme: "devbrain" | "devbrain-beta"; name: "DevBrain" | "DevBrain Beta"; other: { scheme; name } }`.
- The channel cookie is deliberately NOT in `ALL_DEVBRAIN_COOKIES`: signing out does not change which app is installed on the Mac.

- [ ] **Step 1: Failing test for the channel decision**

```ts
// src/lib/__tests__/app-channel.test.ts
import { describe, expect, it } from "vitest";
import { appChannel } from "../app-channel";

describe("appChannel", () => {
  it("defaults to stable", () => {
    expect(appChannel(undefined)).toEqual({ channel: "stable", scheme: "devbrain", name: "DevBrain", other: { scheme: "devbrain-beta", name: "DevBrain Beta" } });
    expect(appChannel("nonsense").channel).toBe("stable");
  });
  it("beta flips both the primary and the alternative", () => {
    expect(appChannel("beta")).toEqual({ channel: "beta", scheme: "devbrain-beta", name: "DevBrain Beta", other: { scheme: "devbrain", name: "DevBrain" } });
  });
});
```

And in `src/lib/__tests__/cookies.test.ts` add inside the `clearDevbrainCookies` describe:

```ts
  it("keeps the app-channel cookie: signing out does not change which app is installed", () => {
    expect(COOKIE.channel).toBe("devbrain_channel");
    expect(ALL_DEVBRAIN_COOKIES.some((c) => c.name === COOKIE.channel)).toBe(false);
  });
```

- [ ] **Step 2: Run both to verify they fail**

Run: `npx vitest run src/lib/__tests__/app-channel.test.ts src/lib/__tests__/cookies.test.ts`
Expected: app-channel FAIL (module missing); cookies FAIL on the `COOKIE.channel` assertion (undefined).

- [ ] **Step 3: Cookie declaration**

In `src/lib/cookies.ts`:

```ts
export const COOKIE = {
  org: "devbrain_org",           // active org (validated against membership on every read)
  lastRepo: "devbrain_last_repo", // last repo visited → widget scope
  next: "devbrain_next",         // post-login destination (desktop hand-off)
  newToken: "devbrain_new_token", // plaintext dev token, shown once
  notice: "devbrain_notice",     // one-shot message for the onboarding wall (60 s)
  channel: "devbrain_channel",   // which app build last signed in from this browser: stable | beta
} as const;
```

and after `NOTICE_COOKIE_OPTS`:

```ts
// Set by /auth/device/start when the app opens the browser to sign in; read
// by /open so its "Open in the app" button uses the scheme of the build the
// person actually has. Not cleared on sign-out (see ALL_DEVBRAIN_COOKIES).
export const CHANNEL_COOKIE_OPTS = { ...base, maxAge: 60 * 60 * 24 * 365 };
```

- [ ] **Step 4: The pure function**

```ts
// src/lib/app-channel.ts
// The two app builds and their URL schemes. The browser learns the channel
// from the sign-in hand-off (COOKIE.channel); anything unrecognised is stable.
const BUILDS = {
  stable: { scheme: "devbrain", name: "DevBrain" },
  beta: { scheme: "devbrain-beta", name: "DevBrain Beta" },
} as const;

export type Channel = keyof typeof BUILDS;

export function appChannel(raw: string | undefined): { channel: Channel; scheme: string; name: string; other: { scheme: string; name: string } } {
  const channel: Channel = raw === "beta" ? "beta" : "stable";
  const other: Channel = channel === "beta" ? "stable" : "beta";
  return { channel, ...BUILDS[channel], other: BUILDS[other] };
}
```

- [ ] **Step 5: Set the cookie where the channel is known**

In `src/app/auth/device/start/route.ts`, the final `return new NextResponse(html, …)` becomes:

```ts
  const res = new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  // Remember which build this browser signs in for, so /open can deep-link
  // to the app the person actually has (devbrain:// vs devbrain-beta://).
  res.cookies.set(COOKIE.channel, channel, CHANNEL_COOKIE_OPTS);
  return res;
```

Add `CHANNEL_COOKIE_OPTS` to the existing import from `@/lib/cookies`.

- [ ] **Step 6: `/open` reads it**

In `src/app/open/page.tsx`: add imports

```ts
import { cookies } from "next/headers";
import { COOKIE } from "@/lib/cookies";
import { appChannel } from "@/lib/app-channel";
```

After `const route = …` add:

```ts
  const build = appChannel((await cookies()).get(COOKIE.channel)?.value);
```

Replace the primary button and the footnote:

```tsx
          <a href={`${build.scheme}://desk${route}`} className="rounded-[10px] bg-accent2 px-4 py-[11px] text-center text-[13px] font-semibold text-white hover:brightness-110">Open the Console in {build.name}</a>
```

```tsx
        <p className="mt-10 text-[11.5px] leading-[1.6] text-faint">
          Using {build.other.name} instead? <a href={`${build.other.scheme}://desk${route}`} className="text-accent hover:underline">Open in {build.other.name}</a>. Setting up a new Mac by hand: <Link href="/settings/setup" className="text-accent hover:underline">setup page</Link>.
        </p>
```

- [ ] **Step 7: Tests, typecheck**

Run: `npx vitest run src/lib/__tests__/app-channel.test.ts src/lib/__tests__/cookies.test.ts && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/cookies.ts src/lib/app-channel.ts src/lib/__tests__/app-channel.test.ts src/lib/__tests__/cookies.test.ts src/app/auth/device/start/route.ts src/app/open/page.tsx
git commit -m "/open deep-links to the app build that signed in

The sign-in hand-off knows the channel; remember it in a cookie and let
/open pick devbrain:// or devbrain-beta:// from it instead of assuming
stable. The other build stays one line below."
```

---

### Task 3: The wall and the pending banner refresh themselves

**Files:**
- Modify: `src/app/desk/onboarding/wall.tsx:43` (`pendingOrWorking`)
- Modify: `src/app/desk/layout.tsx` (mount `RefreshWhile` for the banner)

**Interfaces:**
- Consumes: `RefreshWhile({ active })` from `src/app/desk/onboarding/refresh-while.tsx` (5 s `router.refresh()`; already a client component).

- [ ] **Step 1: The wall polls until it is complete**

In `wall.tsx` replace

```tsx
  const pendingOrWorking = state.repoState === "requested" || (!state.steps.find((s) => s.id === "working")!.done && repos.length > 0);
```

with

```tsx
  // Every step after "team" is completed by something OUTSIDE this window —
  // GitHub's redirect in the browser, the app's bootstrap, an editor start.
  // Poll until everything is green so the wall never shows a stale step.
  const pendingOrWorking = !state.complete;
```

and keep `<RefreshWhile active={pendingOrWorking} />` as is.

- [ ] **Step 2: The layout's "requested" banner really updates itself**

In `src/app/desk/layout.tsx` add the import

```ts
import { RefreshWhile } from "./onboarding/refresh-while";
```

and render it directly under the banner:

```tsx
          {pendingBanner && (
            <>
              <RefreshWhile active />
              <div className="flex-shrink-0 border-b border-[var(--wg-wait-line)] bg-[var(--wg-wait-bg)] px-4 py-2 text-[12.5px] text-wait">{pendingBanner}</div>
            </>
          )}
```

- [ ] **Step 3: Typecheck, suite, and a manual check**

Run: `npm run typecheck && npm test`
Expected: clean. Manual (dev server or preview): open the wall as an owner with no repo, link a repo from a browser tab; within 5 s the wall's step 2 turns green without a click.

- [ ] **Step 4: Commit**

```bash
git add src/app/desk/onboarding/wall.tsx src/app/desk/layout.tsx
git commit -m "Onboarding: the wall and the pending banner refresh until complete

Linking a repo happens in the browser; the wall in the app kept the old
step until the person navigated. Poll while any step is open, and give
the requested banner the refresh its copy already promised."
```

---

### Task 4: Sign out from the Console

**Files:**
- Modify: `src/app/auth/sign-out/route.ts`
- Modify: `src/app/desk/layout.tsx:96-99` (identity chip gains a Sign out form)
- Modify: `src/app/widget/app.tsx:572` (panel form carries `from=widget`)
- Test: `src/lib/__tests__/surface.test.ts` (extend for the new helper)
- Modify: `src/lib/surface.ts` (add `signOutDestination`)

**Interfaces:**
- Produces: `signOutDestination(from: string | null | undefined): string` — `/` for a browser, `/?from=widget` or `/?from=desk` for the app windows (reuses `inAppSurface`).

- [ ] **Step 1: Failing test**

Append to `src/lib/__tests__/surface.test.ts`:

```ts
import { signOutDestination } from "../surface";

describe("signOutDestination", () => {
  it("sends app windows back to their own sign-in screen", () => {
    expect(signOutDestination("desk")).toBe("/?from=desk");
    expect(signOutDestination("widget")).toBe("/?from=widget");
  });
  it("browser and junk go to the landing", () => {
    expect(signOutDestination(null)).toBe("/");
    expect(signOutDestination("dashboard")).toBe("/");
    expect(signOutDestination("//evil")).toBe("/");
  });
});
```

(If the file already imports from `../surface`, merge the import.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/__tests__/surface.test.ts`
Expected: FAIL — `signOutDestination` is not exported.

- [ ] **Step 3: The helper**

Append to `src/lib/surface.ts`:

```ts
/** Where /auth/sign-out lands. An app window must come back to its own
 *  bare sign-in screen (the landing page keyed by ?from=), never the
 *  marketing page — the Desk window would hand that to the browser. */
export function signOutDestination(from: string | null | undefined): string {
  const s = inAppSurface(from ?? undefined);
  return s ? `/?from=${s}` : "/";
}
```

- [ ] **Step 4: The route reads the form**

Replace `src/app/auth/sign-out/route.ts`:

```ts
import { NextResponse } from "next/server";
import { clearDevbrainCookies } from "@/lib/cookies";
import { signOutDestination } from "@/lib/surface";
import { supabaseServer } from "@/lib/supabase/server";

// POST from the panel's menu (from=widget), the Console's toolbar
// (from=desk) or any browser form (no from). Clears the Supabase session and
// every DevBrain cookie except the app-channel one, then returns the caller
// to the sign-in screen that belongs to its surface.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const from = form?.get("from");
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  const res = NextResponse.redirect(new URL(signOutDestination(typeof from === "string" ? from : null), request.url), { status: 302 });
  clearDevbrainCookies(res.cookies); // org, last repo, pending destination, shown-once token, notice
  return res;
}
```

- [ ] **Step 5: The Console control**

In `src/app/desk/layout.tsx`, replace the identity block

```tsx
            <span className="ml-auto flex items-center gap-2">
              <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-coralink text-[11px] font-semibold text-accent">{initial}</span>
              <span className="font-mono text-[10.5px] text-muted">{org.login} · {org.role}</span>
            </span>
```

with

```tsx
            <span className="ml-auto flex items-center gap-2">
              <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-coralink text-[11px] font-semibold text-accent">{initial}</span>
              <span className="font-mono text-[10.5px] text-muted">{org.login} · {org.role}</span>
              <form action="/auth/sign-out" method="post" className="ml-1">
                <input type="hidden" name="from" value="desk" />
                <button className="rounded-md px-1.5 py-0.5 font-mono text-[10.5px] text-faint hover:bg-row2 hover:text-txt" title="Sign out of DevBrain on this Mac">Sign out</button>
              </form>
            </span>
```

- [ ] **Step 6: The panel form names its surface**

In `src/app/widget/app.tsx:572` replace

```tsx
              <form action="/auth/sign-out" method="post"><button className="block w-full rounded-lg px-2.5 py-2 text-left text-[12.5px] text-muted hover:bg-row2 hover:text-txt">Sign out</button></form>
```

with

```tsx
              <form action="/auth/sign-out" method="post"><input type="hidden" name="from" value="widget" /><button className="block w-full rounded-lg px-2.5 py-2 text-left text-[12.5px] text-muted hover:bg-row2 hover:text-txt">Sign out</button></form>
```

- [ ] **Step 7: Tests, typecheck**

Run: `npx vitest run src/lib/__tests__/surface.test.ts && npm run typecheck && npm test`
Expected: clean. Note for the reviewer: the Desk window already navigates to `/?from=desk` when signed out (layout redirect, verified in the VM on 2026-09-13), so this destination is inside the window's allow-list.

- [ ] **Step 8: Commit**

```bash
git add src/lib/surface.ts src/lib/__tests__/surface.test.ts src/app/auth/sign-out/route.ts src/app/desk/layout.tsx src/app/widget/app.tsx
git commit -m "Console: a Sign out control, and sign-out returns each window to its own sign-in

The Console had no way out; the only sign-out lived in the panel and sent
every caller to the marketing landing. The form now names its surface and
the route lands on that surface's bare sign-in screen."
```

---

### Task 5: The one-shot notice shows once

**Files:**
- Modify: `src/app/desk/onboarding/actions.ts` (add `clearNotice`)
- Create: `src/app/desk/notice-once.tsx`
- Modify: `src/app/desk/layout.tsx:100-102`

**Interfaces:**
- Produces: server action `clearNotice(): Promise<void>` (expires `COOKIE.notice` on path `/desk`). `NoticeOnce({ text })` client component: renders the banner and calls `clearNotice` once on mount.

- [ ] **Step 1: The action**

Append to `src/app/desk/onboarding/actions.ts`:

```ts
// The notice cookie is read by the Desk layout on every request. It is set
// by redirects that cannot render (the GitHub setup route, a failed preset)
// and must be shown exactly once — so the banner clears it as soon as it has
// been rendered. Same path as NOTICE_COOKIE_OPTS or the delete is a no-op.
export async function clearNotice(): Promise<void> {
  (await cookies()).set(COOKIE.notice, "", { ...NOTICE_COOKIE_OPTS, maxAge: 0 });
}
```

- [ ] **Step 2: The banner component**

```tsx
// src/app/desk/notice-once.tsx
"use client";

import { useEffect } from "react";
import { clearNotice } from "./onboarding/actions";

// Renders a one-shot notice and expires its cookie on first paint, so the
// next navigation (or the 5 s wall refresh) does not repeat it.
export function NoticeOnce({ text }: { text: string }) {
  useEffect(() => { void clearNotice(); }, []);
  return <div className="flex-shrink-0 border-b border-[var(--wg-stop-line)] bg-[var(--wg-stop-bg)] px-4 py-2 text-[12.5px] text-stop">{text}</div>;
}
```

- [ ] **Step 3: Use it in the layout**

In `src/app/desk/layout.tsx` add `import { NoticeOnce } from "./notice-once";` and replace

```tsx
          {notice && NOTICES[notice] && (
            <div className="flex-shrink-0 border-b border-[var(--wg-stop-line)] bg-[var(--wg-stop-bg)] px-4 py-2 text-[12.5px] text-stop">{NOTICES[notice]}</div>
          )}
```

with

```tsx
          {notice && NOTICES[notice] && <NoticeOnce text={NOTICES[notice]} />}
```

Also update the comment above `const notice = …` to: `// One-shot message from a redirect that could not render it (e.g. install_owned). NoticeOnce clears the cookie after the first paint.`

- [ ] **Step 4: Typecheck and suite**

Run: `npm run typecheck && npm test`
Expected: clean. (`no-invented-ui.test.ts` scans `src/app` for copy; the banner text is unchanged and still comes from `NOTICES`.)

- [ ] **Step 5: Commit**

```bash
git add src/app/desk/onboarding/actions.ts src/app/desk/notice-once.tsx src/app/desk/layout.tsx
git commit -m "Desk: a one-shot notice clears its cookie after the first paint

install_owned and preset_failed repeated on every page for 60 s. The
banner now expires the cookie as soon as it has rendered."
```

---

### Task 6: Review follow-ups (one batch)

**Files:**
- Modify: `src/app/welcome/actions.ts:20-22, 85` and `:99-105`
- Modify: `src/app/welcome/page.tsx:14-21, 46, 58`
- Modify: `src/app/desk/layout.tsx:36` (`redirect("/welcome?from=desk")`)
- Modify: `src/lib/org.ts:75`
- Modify: `src/app/desk/external-link.tsx`
- Modify: `src/app/api/github/webhook/route.ts:64-70`

- [ ] **Step 1: `createTeam` and `useInvite` honour a Desk `next`**

In `src/app/welcome/page.tsx`: the page reads `from`; treat both app surfaces alike.

```tsx
  const { invite_error, from } = await searchParams;
  const inPanel = from === "widget";
  // Both app windows carry their surface so the forms return to them.
  const appNext = from === "widget" ? "/widget" : from === "desk" ? "/desk" : null;
```

Replace both `{inPanel && <input type="hidden" name="next" value="/widget" />}` (lines 46 and 58) with `{appNext && <input type="hidden" name="next" value={appNext} />}`. Keep `inPanel` for the compact-layout class decisions.

In `src/app/welcome/actions.ts`:

```ts
export async function createTeam(formData: FormData): Promise<void> {
  const formNext = safeNext(formData.get("next") as string | null, "");
  const inPanel = formNext === "/widget";
  const inApp = inPanel || formNext === "/desk";
  const backTo = inPanel ? "&from=widget" : formNext === "/desk" ? "&from=desk" : "";
```

Replace every `${inPanel ? "&from=widget" : ""}` in `createTeam` (three occurrences) and in `useInvite` (one) with `${backTo}` (add the same `inApp`/`backTo` lines at the top of `useInvite`). Change the final redirect:

```ts
  // An app window lands back on itself; the browser goes to the plan step,
  // or straight to the hand-off page during the free beta.
  redirect(inApp ? formNext : beta.free ? "/open?created=1" : "/welcome/plan");
```

In `src/app/desk/layout.tsx:36` change `if (!org) redirect("/welcome");` to `if (!org) redirect("/welcome?from=desk");`.

- [ ] **Step 2: `preset_failed` is a notice, not a denial code**

`src/lib/org.ts:75`:

```ts
export type DeniedCode = "admin_only" | "owner_only" | "link_repo_admin" | "no_access" | "install_owned";
```

Run `grep -rn 'withError(.*"preset_failed"' src` — expected: no matches (it is only ever a `COOKIE.notice` value).

- [ ] **Step 3: `ExternalLink` says it leaves the app**

In `src/app/desk/external-link.tsx` add a `title` prop with a default:

```tsx
export function ExternalLink({ href, children, className, title = "Opens in your browser" }: { href: string; children: ReactNode; className?: string; title?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className}
      title={title}
```

- [ ] **Step 4: Per-org request events in the webhook**

In `src/app/api/github/webhook/route.ts` replace the `Promise.all` block at lines 64-70:

```ts
                // Per-org, not one shared limit: one busy team must not push
                // another team's open request out of the window.
                const [perOrg, { data: links }] = await Promise.all([
                  Promise.all(orgIds.map((id) =>
                    admin.from("events").select("org_id, kind, at, payload").eq("org_id", id).in("kind", ["repo_link_requested", "repo_link_cancelled"]).order("at", { ascending: false }).limit(50),
                  )),
                  admin.from("linked_repos").select("org_id, created_at, unlinked_at").in("org_id", orgIds),
                ]);
                for (const { data: evs } of perOrg) for (const e of evs ?? []) (eventsByOrg[e.org_id as string] ??= []).push(e as RequestEvent);
                for (const l of links ?? []) (linksByOrg[l.org_id as string] ??= []).push(l as LinkRow);
```

- [ ] **Step 5: Typecheck and suite**

Run: `npm run typecheck && npm test`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/welcome/actions.ts src/app/welcome/page.tsx src/app/desk/layout.tsx src/lib/org.ts src/app/desk/external-link.tsx src/app/api/github/webhook/route.ts
git commit -m "Onboarding follow-ups: Desk-aware team creation, external-link tooltip, per-org request events

createTeam returns to the Desk when the form came from it; preset_failed
leaves DeniedCode (it is a notice key); ExternalLink says it opens the
browser; the webhook's request-event query is bounded per org."
```

---

### Task 7: Version bump and VM verification

**Files:** none. Nothing here changes the app bundle or the plugin, so no version bump is needed; the site deploys from `main`.

- [ ] **Step 1: Full suite on the merged branch**

Run: `npm test && npm run typecheck && npm run build`
Expected: all clean.

- [ ] **Step 2: Manual verification list (VM `devbrain-look`, after deploy)**

1. Mac holding lukeb230's token, sign in as sandbox240, owner of a repo-less team → wall step 3 shows "Switch this Mac to <team>" with the note; click → `~/.devbrain-beta/config.json` token changes; step 3 green within 5 s.
2. Delete `~/.devbrain-beta/config.json`, reopen the wall → "Set up this Mac"; click → token minted, bootstrap runs, step 3 green.
3. Link a repo from the wall; do not touch the app → step 2 turns green by itself within 5 s of GitHub's redirect.
4. In Safari (beta app installed), visit `/open?to=/desk` → primary button reads "Open the Console in DevBrain Beta" and opens the Beta Console.
5. Console toolbar → Sign out → the Console shows its bare sign-in card; Sign in → returns to the Console.
6. Trigger `install_owned` (claim an installation another team owns) → the banner shows once; navigate → gone.

Record pass/fail per line in the PR description.

---

## Out of scope

- Reminders permission re-prompt after updates (stable code identity; on the release checklist).
- The member "waiting on your team's owner" and the request → approval path: needs a GitHub org where the test account is not an owner. Untested, unchanged.
- `docs/HANDOFF-2026-09-13.md` (untracked): Luke's call whether to commit.

## Self-review

- **Coverage:** every row of the findings table maps to a task; Reminders is explicitly excluded with the reason.
- **Placeholders:** none; every code step is complete.
- **Type consistency:** `setupMacCopy` signature matches between test, lib and component; `appChannel` return shape matches test and `/open`; `signOutDestination` matches test, lib and route; `SetupMac` props (`done, orgId, orgName`) match the wall's call.
