# Error Tracking (Sentry) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every unhandled error on the Next.js server, in the Console webview, in the panel webview, and on the public site is reported to Sentry with a readable stack, the deploy's git SHA as release, a `surface`/`host` tag, and the account and team ids (no names or emails), while the existing native ops alert keeps firing.

**Architecture:** `@sentry/nextjs` wired per Sentry's App Router layout (server/edge/client init files, `instrumentation.ts` `register` + `onRequestError`, `withSentryConfig` for source maps and a tunnel route). A pure scrub module strips PII before send. Error boundaries at root, `/desk`, and `/widget` capture render crashes. A client `SentryUser` component and a server `withSentryUser` helper set the id-only identity where the app already knows the user.

**Tech Stack:** Next.js 15 App Router, React 19, `@sentry/nextjs` (latest 9.x/10.x — the implementer records the installed version), vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-error-tracking-design.md`

## Global Constraints

- Work in `~/Downloads/devbrain-product` on branch `feat/error-tracking`. **The shell cwd resets to `~/Downloads/devbrain` (a frozen, unrelated repo) after every command. Prefix every command with `cd ~/Downloads/devbrain-product &&`.** Never edit `~/Downloads/devbrain`.
- Identity in Sentry is IDs only: `Sentry.setUser({ id })` with the auth user uuid; tag `team` = org id. `sendDefaultPii: false` everywhere. `scrubEvent` removes `user.email`, `user.username`, `user.ip_address`, `Authorization`/`Cookie` headers, any header whose lower-cased name contains `token`, and query strings from `request.url`.
- Tags: `surface` ∈ `desk` | `panel` | `site` from the path (`/desk*` → desk, `/widget*` → panel, else site); `host` ∈ `app` | `browser` (server: `isAppRequest(userAgent)`; client: `window.__TAURI__` present).
- Release: `process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "dev"`. Environment: `process.env.VERCEL_ENV ?? process.env.NODE_ENV`.
- `tracesSampleRate: 0`; no `replayIntegration`; `enabled: Boolean(dsn)`.
- Env: `NEXT_PUBLIC_SENTRY_DSN` (recommended, public), `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (build-time only). `npm run build` must pass with none of them set.
- `onRequestError` calls BOTH `Sentry.captureRequestError` and the existing `alert()`; neither can prevent the other; never throws.
- Copy, exact: root boundary `Something broke on our side. It's been reported.`; Desk boundary `This page hit an error. It's been reported.`; panel boundary `The panel hit an error. It's been reported.`
- No other new dependencies. Tests `npx vitest run` green; `npm run typecheck`; `npm run build`.
- Commit trailer on every commit:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH
  ```
- Never print a secret; never run anything against Sentry or the live database from tasks 1–5.

---

## File Structure

| file | responsibility |
|---|---|
| `src/lib/sentry-scrub.ts` | pure: `scrubEvent`, `surfaceOf`, `releaseFromEnv`, `environmentFromEnv`, `SENTRY_DSN_VAR` |
| `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts` (repo root) | SDK init per runtime |
| `src/instrumentation.ts` | `register()` + `onRequestError` (Sentry + ops alert) |
| `next.config.ts` | `withSentryConfig` wrapper |
| `src/lib/env.ts`, `.env.example` | DSN registered as recommended |
| `src/app/global-error.tsx`, `src/app/desk/error.tsx`, `src/app/widget/error.tsx` | boundaries |
| `src/components/SentryUser.tsx` | client identity + tags |
| `src/lib/sentry-scope.ts` | server identity + tags helper |
| `src/app/desk/layout.tsx`, `src/app/widget/page.tsx`, `src/lib/api-guard.ts` | wire identity |
| `src/app/api/v1/health/route.ts` | operator-gated `?boom=1` for the live gate |
| `src/lib/legal.ts`, `src/content/legal/privacy.md` | provider disclosure |
| tests | `sentry-scrub.test.ts`, `instrumentation.test.ts`, `error-boundaries.test.tsx`; edits to `env.test.ts`, `legal-doc.test.ts` |

---

### Task 1: Install the SDK; the pure scrub/surface module

**Files:**
- Modify: `package.json`, `package-lock.json` (`@sentry/nextjs`)
- Create: `src/lib/sentry-scrub.ts`
- Test: `src/lib/__tests__/sentry-scrub.test.ts`

**Interfaces:**
- Produces: `SENTRY_DSN_VAR = "NEXT_PUBLIC_SENTRY_DSN"`; `surfaceOf(pathname: string): "desk" | "panel" | "site"`; `releaseFromEnv(env = process.env): string`; `environmentFromEnv(env = process.env): string`; `scrubEvent<E extends ScrubbableEvent>(event: E): E`; `type ScrubbableEvent = { user?: { id?: string; email?: string; username?: string; ip_address?: string; [k: string]: unknown }; request?: { url?: string; headers?: Record<string, string>; [k: string]: unknown }; [k: string]: unknown }`.

- [ ] **Step 1: Install**

Run: `cd ~/Downloads/devbrain-product && npm install @sentry/nextjs && grep -n '"@sentry/nextjs"' package.json`
Expected: a caret version printed. Record it in the report. Then check the exports this plan relies on: `cd ~/Downloads/devbrain-product && node -e "const s=require('@sentry/nextjs'); console.log(['captureRequestError','captureRouterTransitionStart','withSentryConfig','init','setUser','setTag','captureException'].map(k=>k+':'+typeof s[k]).join(' '))"`. All must print `function` except that `captureRouterTransitionStart` may be `undefined` on older majors — note which.

- [ ] **Step 2: Write the failing tests**

```ts
// src/lib/__tests__/sentry-scrub.test.ts
import { describe, expect, it } from "vitest";
import { environmentFromEnv, releaseFromEnv, scrubEvent, SENTRY_DSN_VAR, surfaceOf } from "@/lib/sentry-scrub";

describe("surfaceOf", () => {
  it("maps the three surfaces", () => {
    expect(surfaceOf("/desk")).toBe("desk");
    expect(surfaceOf("/desk/help")).toBe("desk");
    expect(surfaceOf("/widget")).toBe("panel");
    expect(surfaceOf("/widget?x=1")).toBe("panel");
    expect(surfaceOf("/")).toBe("site");
    expect(surfaceOf("/support")).toBe("site");
    expect(surfaceOf("/api/v1/health")).toBe("site");
  });
});

describe("release and environment", () => {
  it("prefer the Vercel git sha, fall back to dev", () => {
    expect(releaseFromEnv({ VERCEL_GIT_COMMIT_SHA: "abc123" })).toBe("abc123");
    expect(releaseFromEnv({ NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: "def456" })).toBe("def456");
    expect(releaseFromEnv({})).toBe("dev");
    expect(environmentFromEnv({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe("preview");
    expect(environmentFromEnv({ NODE_ENV: "development" })).toBe("development");
    expect(SENTRY_DSN_VAR).toBe("NEXT_PUBLIC_SENTRY_DSN");
  });
});

describe("scrubEvent", () => {
  it("keeps the user id and drops everything else about the person", () => {
    const e = scrubEvent({ user: { id: "u1", email: "l@x.com", username: "luke", ip_address: "1.2.3.4" }, tags: { team: "o1" } });
    expect(e.user).toEqual({ id: "u1" });
    expect(e.tags).toEqual({ team: "o1" });
  });
  it("strips auth and token headers and the query string", () => {
    const e = scrubEvent({ request: { url: "https://getdevbrain.com/api/v1/guard?code=secret&x=1", headers: { Authorization: "Bearer dbk_x", cookie: "sb=1", "x-devbrain-token": "t", "content-type": "application/json" } } });
    expect(e.request?.url).toBe("https://getdevbrain.com/api/v1/guard");
    expect(e.request?.headers).toEqual({ "content-type": "application/json" });
  });
  it("leaves an event with no user or request untouched", () => {
    const e = { message: "boom", extra: { a: 1 } };
    expect(scrubEvent(e)).toEqual(e);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/sentry-scrub.test.ts`
Expected: FAIL — cannot resolve `@/lib/sentry-scrub`.

- [ ] **Step 4: Write the module**

```ts
// src/lib/sentry-scrub.ts
// ============================================================================
// Error tracking, the pure half: which surface a path belongs to, what the
// release and environment are called, and what never leaves the building.
// Sentry gets the auth user's uuid and the team id — nothing that names a
// person — and no auth material in request headers or URLs.
// ============================================================================

export const SENTRY_DSN_VAR = "NEXT_PUBLIC_SENTRY_DSN";

export type Surface = "desk" | "panel" | "site";

export function surfaceOf(pathname: string): Surface {
  const p = pathname.split("?")[0];
  if (p === "/desk" || p.startsWith("/desk/")) return "desk";
  if (p === "/widget" || p.startsWith("/widget/")) return "panel";
  return "site";
}

type Env = Record<string, string | undefined>;

export function releaseFromEnv(env: Env = process.env): string {
  return env.VERCEL_GIT_COMMIT_SHA || env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "dev";
}

export function environmentFromEnv(env: Env = process.env): string {
  return env.VERCEL_ENV || env.NODE_ENV || "development";
}

export type ScrubbableEvent = {
  user?: { id?: string; email?: string; username?: string; ip_address?: string; [k: string]: unknown };
  request?: { url?: string; headers?: Record<string, string>; [k: string]: unknown };
  [k: string]: unknown;
};

const DROP_HEADER = (name: string) => {
  const n = name.toLowerCase();
  return n === "authorization" || n === "cookie" || n.includes("token");
};

/** Returns the same event with identity reduced to `{ id }` and auth
 *  material removed from the request. Never throws — a scrubber that
 *  throws would drop the report entirely. */
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  try {
    if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
    if (event.request) {
      if (typeof event.request.url === "string") event.request.url = event.request.url.split("?")[0];
      if (event.request.headers) {
        event.request.headers = Object.fromEntries(Object.entries(event.request.headers).filter(([k]) => !DROP_HEADER(k)));
      }
    }
  } catch { /* leave the event as it is */ }
  return event;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/sentry-scrub.test.ts`
Expected: PASS, 5 tests. Note: the first test's `expect(e.user).toEqual({ id: "u1" })` requires that the scrubber sets `user` to `{ id }`, and the third requires an event with no `user` key to remain equal — `undefined` assignment on a missing key is avoided by the `if (event.user)` guard.

- [ ] **Step 6: Commit**

```bash
cd ~/Downloads/devbrain-product && git add package.json package-lock.json src/lib/sentry-scrub.ts src/lib/__tests__/sentry-scrub.test.ts && git commit -F - <<'EOF'
Error tracking: Sentry SDK installed; the pure scrub, surface and release rules

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH
EOF
```

---

### Task 2: SDK init files, instrumentation, config wrapper, env registry

**Files:**
- Create: `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts` (repo root)
- Modify: `src/instrumentation.ts`, `next.config.ts`, `src/lib/env.ts`, `.env.example`
- Test: `src/lib/__tests__/instrumentation.test.ts` (create), `src/lib/__tests__/env.test.ts` (one test)

**Interfaces:**
- Consumes: Task 1's module; `alert` from `@/lib/alerts`; `Sentry.init`, `Sentry.captureRequestError`, `withSentryConfig` from `@sentry/nextjs`.
- Produces: `register()` and `onRequestError` exports from `src/instrumentation.ts`; `NEXT_PUBLIC_SENTRY_DSN` in `RECOMMENDED_ENV`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/instrumentation.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// onRequestError must hand the error to BOTH Sentry and the native ops
// alert, and neither may stop the other. Everything is mocked; no network.
const captureRequestError = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@sentry/nextjs", () => ({ captureRequestError: (...a: unknown[]) => captureRequestError(...a) }));
const alert = vi.fn(async (_i: unknown) => {});
vi.mock("@/lib/alerts", () => ({ alert: (i: unknown) => alert(i) }));

const { onRequestError } = await import("@/instrumentation");
const req = { path: "/api/v1/guard", method: "POST", headers: {} };
const ctx = { routerKind: "App Router", routePath: "/api/v1/guard", routeType: "route" };

describe("onRequestError", () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.NEXT_RUNTIME = "nodejs"; });

  it("reports to Sentry and raises the ops alert", async () => {
    await onRequestError(new Error("boom"), req, ctx);
    expect(captureRequestError).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(expect.objectContaining({ scope: "ops", key: "http./api/v1/guard", title: "Unhandled error in POST /api/v1/guard" }));
  });

  it("a throwing Sentry call does not stop the alert, and vice versa", async () => {
    captureRequestError.mockRejectedValueOnce(new Error("sdk down"));
    await expect(onRequestError(new Error("boom"), req, ctx)).resolves.toBeUndefined();
    expect(alert).toHaveBeenCalledTimes(1);
    alert.mockRejectedValueOnce(new Error("db down"));
    await expect(onRequestError(new Error("boom"), req, ctx)).resolves.toBeUndefined();
    expect(captureRequestError).toHaveBeenCalledTimes(2);
  });

  it("does nothing on the edge runtime", async () => {
    process.env.NEXT_RUNTIME = "edge";
    await onRequestError(new Error("boom"), req, ctx);
    expect(captureRequestError).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });
});
```

Add to `src/lib/__tests__/env.test.ts` inside the existing `describe`:

```ts
  it("treats the Sentry DSN as recommended, not required", () => {
    expect(RECOMMENDED_ENV).toContain("NEXT_PUBLIC_SENTRY_DSN");
    expect(REQUIRED_ENV).not.toContain("NEXT_PUBLIC_SENTRY_DSN");
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/instrumentation.test.ts src/lib/__tests__/env.test.ts`
Expected: instrumentation FAIL (no `captureRequestError` call yet, and `@/instrumentation` resolves to the existing file which has no `register`); env FAIL on the new assertion. If `@/instrumentation` does not resolve, the vitest alias `@` → `src` covers it (`src/instrumentation.ts`).

- [ ] **Step 3: The init files**

```ts
// sentry.server.config.ts
import * as Sentry from "@sentry/nextjs";
import { environmentFromEnv, releaseFromEnv, scrubEvent, SENTRY_DSN_VAR } from "@/lib/sentry-scrub";

const dsn = process.env[SENTRY_DSN_VAR];

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: environmentFromEnv(),
  release: releaseFromEnv(),
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend: (event) => scrubEvent(event),
});
```

```ts
// sentry.edge.config.ts
import * as Sentry from "@sentry/nextjs";
import { environmentFromEnv, releaseFromEnv, scrubEvent, SENTRY_DSN_VAR } from "@/lib/sentry-scrub";

const dsn = process.env[SENTRY_DSN_VAR];

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: environmentFromEnv(),
  release: releaseFromEnv(),
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend: (event) => scrubEvent(event),
});
```

```ts
// instrumentation-client.ts
import * as Sentry from "@sentry/nextjs";
import { environmentFromEnv, releaseFromEnv, scrubEvent, SENTRY_DSN_VAR } from "@/lib/sentry-scrub";

// The browser half: the Console and panel webviews and the public site.
// No replay, no tracing — errors only, and never a name or an email.
const dsn = process.env[SENTRY_DSN_VAR];

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: environmentFromEnv(),
  release: releaseFromEnv(),
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  sendDefaultPii: false,
  beforeSend: (event) => scrubEvent(event),
});

// Present on SDK majors that instrument App Router navigations; harmless to
// export when the SDK ignores it. Task 1's install check says which.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```

If Task 1's check printed `captureRouterTransitionStart:undefined`, omit the last two lines and say so in the report.

Note on `process.env[SENTRY_DSN_VAR]` in the client file: Next inlines `NEXT_PUBLIC_*` only for the literal `process.env.NEXT_PUBLIC_SENTRY_DSN`. In **`instrumentation-client.ts` use the literal** `process.env.NEXT_PUBLIC_SENTRY_DSN` instead of the indexed form; keep the constant import for the server/edge files only.

- [ ] **Step 4: `src/instrumentation.ts`**

Replace the file with:

```ts
// Next.js instrumentation hook. register() boots the Sentry SDK for the
// runtime that is starting; onRequestError hands every unhandled error in a
// route handler, server action or server component to BOTH the error
// tracker (the record: stack, release, who was affected) and the native ops
// alert (the pager: fingerprinted by route + message so one bad deploy is
// one alert). Neither may stop the other, and nothing here may throw.
import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("../sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("../sentry.edge.config");
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const Sentry = await import("@sentry/nextjs");
    await Sentry.captureRequestError(err, request, context);
  } catch { /* the tracker being down is not our user's problem */ }
  try {
    const { alert } = await import("@/lib/alerts");
    const message = String((err as Error)?.message ?? err).slice(0, 300);
    const stack = String((err as Error)?.stack ?? "").split("\n").slice(1, 4).join("\n");
    await alert({
      scope: "ops",
      key: `http.${context.routePath || request.path}`,
      title: `Unhandled error in ${request.method} ${context.routePath || request.path}`,
      detail: `${message}\n${stack}`,
    });
  } catch { /* never throw from here */ }
};
```

If `Instrumentation.onRequestError` is not exported by the installed `next` types, fall back to the previous explicit parameter types `(err: unknown, request: { path: string; method: string; headers: Record<string, string> }, context: { routerKind: string; routePath: string; routeType: string })` and cast at the Sentry call: `Sentry.captureRequestError(err, request as never, context as never)`.

- [ ] **Step 5: `next.config.ts`, env registry, example**

```ts
// next.config.ts
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Webhook payloads can be large (PR sync events with many files).
  experimental: {
    // Spec uploads (PDFs/briefs) post through a server action.
    serverActions: { bodySizeLimit: "4mb" },
    // Console tabs are dynamic pages; keep the ones just visited in the client
    // router cache so switching back and forth is instant, and refresh from
    // the server after 30s.
    staleTimes: { dynamic: 30, static: 180 },
  },
};

// Source maps go up at build only when SENTRY_AUTH_TOKEN is set (Vercel);
// without it the wrapper is a no-op apart from the tunnel rewrite, so local
// builds and CI never need a Sentry credential.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  tunnelRoute: "/sentry-tunnel",
  disableLogger: true,
});
```

`src/lib/env.ts`: `export const RECOMMENDED_ENV = ["ANTHROPIC_API_KEY", "RESEND_API_KEY", "NEXT_PUBLIC_SENTRY_DSN"] as const;`

Append to `.env.example`:

```
# --- Error tracking (Sentry) ------------------------------------------------
# Unhandled errors on the server, in the Console and panel webviews and on
# the site go to Sentry with the deploy sha as the release. IDs only: the
# account uuid and team id, never a name or email. Without the DSN the SDK
# is disabled and nothing else changes. The three build-time variables let
# Vercel upload source maps; local builds never need them.
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
```

- [ ] **Step 6: Run tests, typecheck, build twice**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/instrumentation.test.ts src/lib/__tests__/env.test.ts && npm run typecheck && npx vitest run && npm run build`
Expected: PASS; build succeeds with no Sentry env set (no upload attempted; `silent: true` — if the wrapper prints a warning about missing auth token that is acceptable; an error is not). Then also: `cd ~/Downloads/devbrain-product && SENTRY_AUTH_TOKEN=invalid SENTRY_ORG=x SENTRY_PROJECT=y npm run build` — expected: the build still succeeds (upload failure must not fail the build; if it does, add `errorHandler: (err) => { console.warn("sentry upload:", err.message); }` to the `withSentryConfig` options if the installed version supports it, otherwise `sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN }` — record what was needed). Confirm the route list still contains `/` and `/desk/help`; the tunnel does not appear as a page.

- [ ] **Step 7: Commit**

```bash
cd ~/Downloads/devbrain-product && git add sentry.server.config.ts sentry.edge.config.ts instrumentation-client.ts src/instrumentation.ts next.config.ts src/lib/env.ts .env.example src/lib/__tests__/instrumentation.test.ts src/lib/__tests__/env.test.ts && git commit -F - <<'EOF'
Error tracking: Sentry boots per runtime; unhandled server errors go to Sentry and the ops alert

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH
EOF
```

---

### Task 3: Error boundaries

**Files:**
- Create: `src/app/global-error.tsx`, `src/app/desk/error.tsx`, `src/app/widget/error.tsx`
- Test: `src/lib/__tests__/error-boundaries.test.tsx`

**Interfaces:**
- Consumes: `Sentry.captureException` from `@sentry/nextjs`; the Desk/widget class tokens (`bg-ink`, `text-txt`, `text-muted`, `border-line2`, `bg-accent2`) already used by those surfaces.
- Produces: default exports for the three Next error files.

- [ ] **Step 1: Write the failing test**

```tsx
// src/lib/__tests__/error-boundaries.test.tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
const { default: GlobalError } = await import("@/app/global-error");
const { default: DeskError } = await import("@/app/desk/error");
const { default: WidgetError } = await import("@/app/widget/error");

const error = Object.assign(new Error("boom"), { digest: "abc" });
const reset = () => {};

describe("error boundaries", () => {
  it("root: says it was reported, offers reload and home", () => {
    const html = renderToStaticMarkup(<GlobalError error={error} reset={reset} />);
    expect(html).toContain("Something broke on our side. It&#x27;s been reported.");
    expect(html).toMatch(/<button[^>]*>Reload/);
    expect(html).toMatch(/href="\/"/);
    expect(html).not.toContain("boom"); // never show the raw message to a visitor
  });
  it("desk: retry and a way back to the Console home", () => {
    const html = renderToStaticMarkup(<DeskError error={error} reset={reset} />);
    expect(html).toContain("This page hit an error. It&#x27;s been reported.");
    expect(html).toMatch(/<button[^>]*>Retry/);
    expect(html).toMatch(/href="\/desk"/);
  });
  it("panel: reload only, sized for 440px", () => {
    const html = renderToStaticMarkup(<WidgetError error={error} reset={reset} />);
    expect(html).toContain("The panel hit an error. It&#x27;s been reported.");
    expect(html).toMatch(/<button[^>]*>Reload/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/error-boundaries.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 3: Write the boundaries**

```tsx
// src/app/global-error.tsx
"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// The last net: a render error in the root layout itself. Next replaces the
// whole document with this, so it must carry its own <html>/<body>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <main className="mx-auto flex min-h-screen max-w-[560px] flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-[22px] font-semibold">Something broke on our side. It&apos;s been reported.</h1>
          <p className="text-[14px] text-slate-600">Reload the page, or go back to the homepage.</p>
          <div className="flex gap-3">
            <button onClick={reset} className="rounded-lg bg-[#c9554a] px-4 py-2 text-[13px] font-semibold text-white">Reload</button>
            <a href="/" className="rounded-lg border border-slate-300 px-4 py-2 text-[13px] font-semibold">Homepage</a>
          </div>
        </main>
      </body>
    </html>
  );
}
```

```tsx
// src/app/desk/error.tsx
"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

// A Console page that threw while rendering. The shell (sidebar, title bar)
// stays; this fills the page area. Retry re-renders the segment.
export default function DeskError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-center">
      <h2 className="font-display text-[20px] font-medium text-txt">This page hit an error. It&apos;s been reported.</h2>
      <p className="max-w-[46ch] text-[13px] text-muted">Try again, or go back to the Console home. If it keeps happening, tell us on Help.</p>
      <div className="flex gap-2.5">
        <button onClick={reset} className="rounded-lg bg-accent2 px-3.5 py-1.5 font-display text-[12.5px] font-semibold text-white hover:opacity-90">Retry</button>
        <Link href="/desk" className="rounded-lg border border-line2 px-3.5 py-1.5 font-display text-[12.5px] font-semibold text-txt hover:border-line3">Console home</Link>
      </div>
    </div>
  );
}
```

```tsx
// src/app/widget/error.tsx
"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// The 440px panel threw while rendering. Small, one action: reload the panel.
export default function WidgetError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-ink px-5 text-center">
      <p className="text-[13.5px] font-semibold text-txt">The panel hit an error. It&apos;s been reported.</p>
      <button onClick={reset} className="rounded-lg bg-accent2 px-3.5 py-1.5 font-display text-[12.5px] font-semibold text-white hover:opacity-90">Reload</button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests, typecheck, build**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/error-boundaries.test.tsx && npm run typecheck && npm run build`
Expected: PASS, 3 tests; build lists no new routes (error files are not routes).

- [ ] **Step 5: Commit**

```bash
cd ~/Downloads/devbrain-product && git add src/app/global-error.tsx src/app/desk/error.tsx src/app/widget/error.tsx src/lib/__tests__/error-boundaries.test.tsx && git commit -F - <<'EOF'
Error tracking: boundaries for the site, the Console and the panel — reported, then retry

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH
EOF
```

---

### Task 4: Identity and tags — client component, server helper, wiring

**Files:**
- Create: `src/components/SentryUser.tsx`, `src/lib/sentry-scope.ts`
- Modify: `src/app/desk/layout.tsx`, `src/app/widget/page.tsx`, `src/lib/api-guard.ts` (`apiAuth`)
- Modify: `src/app/api/v1/health/route.ts` (operator-gated `?boom=1`)
- Test: `src/lib/__tests__/sentry-scope.test.ts`, `src/lib/__tests__/sentry-user.test.tsx`

**Interfaces:**
- Consumes: Task 1's `surfaceOf`; `isAppRequest` from `@/lib/app-only`; `Sentry.setUser`, `Sentry.setTag`.
- Produces: `withSentryUser({ userId, orgId, path, userAgent })` (server); `SentryUser({ userId, orgId })` (client, renders null).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/sentry-scope.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
const setUser = vi.fn(); const setTag = vi.fn();
vi.mock("@sentry/nextjs", () => ({ setUser: (u: unknown) => setUser(u), setTag: (k: string, v: unknown) => setTag(k, v) }));
const { withSentryUser } = await import("@/lib/sentry-scope");

describe("withSentryUser (server)", () => {
  beforeEach(() => vi.clearAllMocks());
  it("sets id-only identity and the three tags from the request", () => {
    withSentryUser({ userId: "u1", orgId: "o1", path: "/desk/help", userAgent: "Mozilla/5.0 DevBrainApp/1" });
    expect(setUser).toHaveBeenCalledWith({ id: "u1" });
    expect(setTag.mock.calls).toEqual(expect.arrayContaining([["team", "o1"], ["surface", "desk"], ["host", "app"]]));
  });
  it("a signed-out request clears the user and tags browser", () => {
    withSentryUser({ userId: null, orgId: null, path: "/support", userAgent: "Mozilla/5.0" });
    expect(setUser).toHaveBeenCalledWith(null);
    expect(setTag.mock.calls).toEqual(expect.arrayContaining([["surface", "site"], ["host", "browser"]]));
    expect(setTag.mock.calls.find((c) => c[0] === "team")).toBeUndefined();
  });
  it("never throws if the SDK does", () => {
    setUser.mockImplementationOnce(() => { throw new Error("no sdk"); });
    expect(() => withSentryUser({ userId: "u1", orgId: "o1", path: "/", userAgent: null })).not.toThrow();
  });
});
```

```tsx
// src/lib/__tests__/sentry-user.test.tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@sentry/nextjs", () => ({ setUser: vi.fn(), setTag: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/widget" }));
const { SentryUser } = await import("@/components/SentryUser");

describe("SentryUser (client)", () => {
  it("renders nothing", () => {
    expect(renderToStaticMarkup(<SentryUser userId="u1" orgId="o1" />)).toBe("");
    expect(renderToStaticMarkup(<SentryUser userId={null} orgId={null} />)).toBe("");
  });
});
```

(The effect cannot run under `renderToStaticMarkup`; the server helper test covers the tag logic, and the component delegates to the same pure functions.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/sentry-scope.test.ts src/lib/__tests__/sentry-user.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 3: The server helper and the client component**

```ts
// src/lib/sentry-scope.ts
import * as Sentry from "@sentry/nextjs";
import { isAppRequest } from "@/lib/app-only";
import { surfaceOf } from "@/lib/sentry-scrub";

// Who and where, for the server side of an error: the auth user's uuid and
// the team id (never a name), the surface the path belongs to, and whether
// the request came from the desktop app. Called where the app already
// resolved the user; never throws.
export function withSentryUser(i: { userId: string | null; orgId: string | null; path: string; userAgent: string | null | undefined }): void {
  try {
    Sentry.setUser(i.userId ? { id: i.userId } : null);
    if (i.orgId) Sentry.setTag("team", i.orgId);
    Sentry.setTag("surface", surfaceOf(i.path));
    Sentry.setTag("host", isAppRequest(i.userAgent) ? "app" : "browser");
  } catch { /* the tracker is optional */ }
}
```

```tsx
// src/components/SentryUser.tsx
"use client";

import * as Sentry from "@sentry/nextjs";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { surfaceOf } from "@/lib/sentry-scrub";

// The browser side of "who and where": id-only identity plus surface/host
// tags on every client-side error from the Console, the panel, or the site.
// Renders nothing. Mounted by the Desk layout and the panel page, which
// already know the user; site pages mount it with nulls.
export function SentryUser({ userId, orgId }: { userId: string | null; orgId: string | null }) {
  const pathname = usePathname();
  useEffect(() => {
    try {
      Sentry.setUser(userId ? { id: userId } : null);
      if (orgId) Sentry.setTag("team", orgId);
      Sentry.setTag("surface", surfaceOf(pathname ?? "/"));
      Sentry.setTag("host", typeof window !== "undefined" && (window as unknown as { __TAURI__?: unknown }).__TAURI__ ? "app" : "browser");
    } catch { /* optional */ }
  }, [userId, orgId, pathname]);
  return null;
}
```

- [ ] **Step 4: Wire it**

`src/app/desk/layout.tsx`: after `const org = await currentOrg();` succeeds (below the `if (!org)` block), add
```ts
  withSentryUser({ userId: user.id, orgId: org.orgId, path: "/desk", userAgent: (await headers()).get("user-agent") });
```
(import `withSentryUser` from `@/lib/sentry-scope` and `headers` from `next/headers` if not already imported), and render `<SentryUser userId={user.id} orgId={org.orgId} />` next to `<ThemeFollow />` (import from `@/components/SentryUser`).

`src/app/widget/page.tsx`: after `if (!org) return <NoTeamPanel />;` add the same `withSentryUser({ …, path: "/widget", … })` call, and return `<><SentryUser userId={user.id} orgId={org.orgId} /><WidgetApp data={data} /></>`.

`src/lib/api-guard.ts`, in `apiAuth` right before the final successful `return auth` (read the function first; `auth` carries `user_id`, `org_id`): add `withSentryUser({ userId: auth.user_id, orgId: auth.org_id, path: new URL(request.url).pathname, userAgent: request.headers.get("user-agent") });`.

`src/app/api/v1/health/route.ts`: read the handler; after the operator check succeeds, add
```ts
  if (new URL(request.url).searchParams.get("boom") === "1") throw new Error("health: deliberate test error (boom=1)");
```
with a one-line comment: `// Live-gate switch for error tracking: operator token only; throws so onRequestError runs end to end.` If the handler has no request object in scope, adapt to how it reads its URL; if it has no operator gate, put the switch behind `auth.org_id === (await operatorOrgId())` using the already-imported `operatorOrgId`.

- [ ] **Step 5: Run tests, typecheck, build**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/sentry-scope.test.ts src/lib/__tests__/sentry-user.test.tsx && npm run typecheck && npx vitest run && npm run build`
Expected: PASS (3 + 1); suite green (if `api-guard-behaviour.test.ts` or `api-guard.test.ts` now need `@/lib/sentry-scope` mocked, add `vi.mock("@/lib/sentry-scope", () => ({ withSentryUser: () => {} }))` to those tests); build ok.

- [ ] **Step 6: Commit**

```bash
cd ~/Downloads/devbrain-product && git add src/components/SentryUser.tsx src/lib/sentry-scope.ts src/app/desk/layout.tsx src/app/widget/page.tsx src/lib/api-guard.ts src/app/api/v1/health/route.ts src/lib/__tests__/sentry-scope.test.ts src/lib/__tests__/sentry-user.test.tsx src/lib/__tests__ && git commit -F - <<'EOF'
Error tracking: id-only identity and surface/host tags on the Console, the panel and the API

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH
EOF
```

---

### Task 5: Privacy disclosure

**Files:**
- Modify: `src/lib/legal.ts` (`errorProvider`), `src/content/legal/privacy.md` (§2, §5, §7)
- Test: `src/lib/__tests__/legal-doc.test.ts`

- [ ] **Step 1: Write the failing test**

Add inside the first `describe` in `legal-doc.test.ts`:

```ts
  it("the privacy policy discloses error tracking and its provider", () => {
    const privacy = legalMarkdown("privacy");
    expect(privacy).toContain(`Error tracking: ${LEGAL.errorProvider}`);
    expect(privacy).toContain("account and team identifiers, never your name or email");
    expect(privacy).toContain("**Error reports:**");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/legal-doc.test.ts`
Expected: FAIL — `errorProvider` undefined.

- [ ] **Step 3: Edit**

`src/lib/legal.ts`: after `emailProvider: "Resend",` add `errorProvider: "Sentry",`.

`src/content/legal/privacy.md`:
- In the `**Usage and technical data.**` paragraph (§2), replace the sentence `The Service records operational error events, such as a failed GitHub webhook, in its own database.` with `The Service records operational error events, such as a failed GitHub webhook, in its own database, and sends error reports (the error, its stack trace, the page or request it happened on, the app version, and your account and team identifiers, never your name or email) to an error tracking provider (section 5).`
- In §5's provider list, after the `- **Email delivery: {{emailProvider}}.**` bullet add:
  `- **Error tracking: {{errorProvider}}.** Receives error reports as described in section 2, so we can find and fix what broke.`
- In §7's retention list, after the `- **Support requests:**` bullet add:
  `- **Error reports:** kept by the error tracking provider for 90 days.`

- [ ] **Step 4: Run to verify it passes; commit**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/legal-doc.test.ts && npm run typecheck`
Expected: PASS.

```bash
cd ~/Downloads/devbrain-product && git add src/lib/legal.ts src/content/legal/privacy.md src/lib/__tests__/legal-doc.test.ts && git commit -F - <<'EOF'
Privacy: error reports and their provider are disclosed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH
EOF
```

---

### Task 6: Credentials, deploy, live gate

**Files:** none new; results into `docs/HANDOFF-2026-09-15.md` under "Error tracking".

- [ ] **Step 1: Luke's credentials** (he does these; the controller relays)

Sentry.io: org + project (platform Next.js); an auth token with `project:releases` + `org:read`. Vercel: `NEXT_PUBLIC_SENTRY_DSN` (production + preview, not sensitive), `SENTRY_AUTH_TOKEN` (production + preview, sensitive), `SENTRY_ORG`, `SENTRY_PROJECT` (production + preview). `.env.local`: DSN, org, project. Verify by name: `cd ~/Downloads/devbrain-product && vercel env ls --scope dev-brain1 | grep -i sentry` shows four rows for production.

- [ ] **Step 2: Merge, push, deploy**

`git checkout main && git merge --ff-only feat/error-tracking`; Luke pushes; CI green; production SHA matches; the Vercel build log shows the source-map upload (search "Uploaded" or "sourcemaps" in `vercel logs` / the deployment build output).

- [ ] **Step 3: Live gate**

1. Server: with Luke's operator device token, `curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer <token>" "https://getdevbrain.com/api/v1/health?boom=1"` → 500; in Sentry within a minute: one issue titled `health: deliberate test error (boom=1)`, release = the deploy SHA, tags `surface: site`, `host: browser`, user id = Luke's uuid, no email anywhere in the event; on Luke's Mac, the native ops alert "Unhandled error in GET /api/v1/health" arrives.
2. Console: in the installed app open any Console page while offline-toggling nothing — instead use the Desk boundary by visiting a page known to throw only under `?boom=1` is not available client-side; so: open the Console's Help page and, in the app's devtools (or Luke's Chrome with the same session at `/desk/help`), run `throw new Error("console boom")` in the console → Sentry shows it with `surface: desk`, `host: app` (or `browser` from Chrome), user id set, readable stack (source maps applied: frames name `help-forms.tsx`, not `chunk-….js`).
3. Panel: same from the panel webview (`/widget`) → `surface: panel`.
4. Scrub check: open the server event's request section — no `Authorization` header, no query string; the user block shows only `id`.
5. Boundary check: temporarily, from Luke's Chrome, navigate to `/desk/help?boom=1` — nothing throws (the switch is server-side on health only); confirm instead by the devtools throw above that the Desk boundary copy renders when a React render throws: use React DevTools "throw error" on the HelpForms component if available; otherwise accept the unit test as the evidence and note it.

- [ ] **Step 4: Record**

Append results to the handoff (pass/fail per check, the Sentry issue links) and commit:

```bash
cd ~/Downloads/devbrain-product && git add docs/HANDOFF-2026-09-15.md && git commit -F - <<'EOF'
Docs: error tracking live-gate results

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH
EOF
```
