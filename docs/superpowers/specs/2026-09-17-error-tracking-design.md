# Error tracking (Sentry) — design

Decided 2026-09-17 with Luke. Second of the three tooling specs (support
channel shipped; analytics next). Direction: best-of-breed, Sentry.

## Goal

When something breaks in production, Luke sees it in Sentry with a readable
stack, the release that introduced it, which surface it happened on, and
how many accounts it hit — before anyone writes a support report. The
native macOS ops alert keeps paging him; Sentry becomes the record.

## Non-goals (first cut)

- The Rust shell, the CLI, and the editor hooks. Later cuts; this one sets
  up the DSN, release tagging and privacy posture they reuse.
- Performance tracing, session replay, profiling, feedback widget.
- Replacing `alert()` / `alert_log`. Both fire.
- Any name, email or login in Sentry.

## Decisions

- **Vendor:** Sentry, account created directly at sentry.io (portable off
  Vercel), one project, platform Next.js.
- **Surfaces:** Next.js server (route handlers, server actions, server
  components, middleware), the Console webview (`/desk/*`), the panel
  webview (`/widget`), and the public site pages — all the same Next app.
- **Identity:** IDs only. `Sentry.setUser({ id: <auth user uuid> })` and
  tag `team` = org id. `sendDefaultPii: false`. No email, login, or IP.
- **Surface tag:** `surface` ∈ `desk` | `panel` | `site`, from the path;
  `host` ∈ `app` | `browser`, from the DevBrain user-agent marker.
- **Release:** `VERCEL_GIT_COMMIT_SHA` (server) /
  `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` (client); environment from
  `VERCEL_ENV` (`production` | `preview` | `development`).
- **Sampling:** errors 100 %; `tracesSampleRate: 0`; no replay
  integration; free tier holds.
- **Source maps:** uploaded at build by `withSentryConfig` when
  `SENTRY_AUTH_TOKEN` is set (Vercel builds); local builds skip silently.
- **Tunnel:** `tunnelRoute: "/sentry-tunnel"` so ad blockers in browsers
  don't drop client events. It rewrites through Next; no CSP exists to
  update.
- **Native alerts stay:** the existing `onRequestError` → `alert()` hand
  becomes one of two hands; `Sentry.captureRequestError` is the other.
- **Env vars:** `NEXT_PUBLIC_SENTRY_DSN` (public), `SENTRY_AUTH_TOKEN`
  (secret, build-time only), `SENTRY_ORG`, `SENTRY_PROJECT` (slugs,
  build-time only). DSN registered as RECOMMENDED in `src/lib/env.ts`
  (absent ⇒ SDK disabled, nothing else changes).

## What already exists

- `src/instrumentation.ts` — `onRequestError` → ops alert keyed by route.
  Keep it; add Sentry alongside.
- `next.config.ts` — plain config object; wraps cleanly.
- No `error.tsx` / `global-error.tsx` anywhere. Root layout:
  `src/app/layout.tsx`; Desk: `src/app/desk/layout.tsx`; panel:
  `src/app/widget/layout.tsx`.
- `src/lib/app-only.ts` `isAppRequest(ua)` / `APP_UA_MARKER` for the host
  tag; `src/lib/desk/load.ts` already stamps `deploy` from the git SHA.
- `currentUser()` gives the uuid server-side; `WidgetData`/desk layout hand
  props to client trees.
- `src/lib/env.ts` `RECOMMENDED_ENV`; `.env.example`; `legal.ts` +
  `privacy.md` provider list (Resend precedent).
- Middleware runs on the **edge** runtime (no `runtime` export, no
  `nodeMiddleware`), so a middleware error reaches Sentry only through the
  SDK's automatic wrapping under the edge init, never the ops alert
  (`onRequestError` returns early off `nodejs`). Pre-existing behaviour;
  noted, not changed.

## Architecture

### SDK files (repo root, per Sentry's Next.js layout)

- `sentry.server.config.ts` — `Sentry.init({ dsn, environment, release,
  tracesSampleRate: 0, sendDefaultPii: false, enabled: Boolean(dsn),
  beforeSend: scrub })`.
- `sentry.edge.config.ts` — same, minimal.
- `instrumentation-client.ts` — `Sentry.init({...same..., no
  replayIntegration })`; its `beforeSend` also stamps `surface` (from the
  current pathname) and `host` (`app` when `window.__TAURI__` exists) on
  every client event, so errors on the public site are tagged without a
  mount; `export const onRouterTransitionStart =
  Sentry.captureRouterTransitionStart`.
- `src/instrumentation.ts` — adds `register()` importing the two configs by
  `NEXT_RUNTIME`; `onRequestError` calls `Sentry.captureRequestError(err,
  request, context)` **and** the existing `alert()`; both wrapped, never
  throw.
- `next.config.ts` — `withSentryConfig(nextConfig, { org, project,
  authToken, silent: true, widenClientFileUpload: true, tunnelRoute:
  "/sentry-tunnel", disableLogger: true })`; when `SENTRY_AUTH_TOKEN` is
  unset the wrapper skips upload (documented behaviour; the plan asserts
  `npm run build` works without it).

### Shared scrub + tags: `src/lib/sentry-scrub.ts` (pure)

- `scrubEvent(event)`: drops `user.email`, `user.username`,
  `user.ip_address`; strips `Authorization`/`Cookie` headers, any header
  whose name contains `token` or `forwarded`, ends in `-ip`, or starts with
  `x-vercel-ip` (Vercel's geo headers: city, country, coordinates,
  timezone); strips query strings from `request.url`; returns the event.
  Unit-tested.
- `surfaceOf(pathname)` → `desk` | `panel` | `site` (`/desk*` → desk,
  `/widget*` → panel, else site). Unit-tested.

### Identity + tags on the client: `src/components/SentryUser.tsx`

Client component rendered by the Desk layout and the widget page (both
already know the user and org server-side): props `{ userId, orgId }`;
effect calls `Sentry.setUser({ id: userId })` (or `null`) and
`Sentry.setTag("team", orgId)`. Renders nothing. Surface/host tags are
applied at send time in the client `beforeSend` (above), so site pages
need no mount.

### Identity on the server

`onRequestError` cannot call `currentUser()` cheaply for every error;
instead the route/action code that already has the user sets scope where
it matters: `src/lib/sentry-scope.ts` exports `withSentryUser(user, org)`
(a helper calling `Sentry.setUser({ id })` + `setTag("team")`) used in
`desk/layout.tsx`, `widget/page.tsx`, and `api/v1` `apiAuth()` (device
tokens carry `user_id` + `org_id`). Tags `surface`/`host` set from the
request path and user agent in the same places.

### Error boundaries

- `src/app/global-error.tsx` — Sentry's recommended component, styled with
  the site shell's tokens; copy: "Something broke on our side. It's been
  reported. Reload, or go to the homepage."; button `reset()`.
- `src/app/desk/error.tsx` — Desk-styled boundary: captures via
  `Sentry.captureException(error)`, shows "This page hit an error. It's
  been reported." with Retry (`reset()`) and a link to `/desk`.
- `src/app/widget/error.tsx` — panel-sized boundary: same capture; "The
  panel hit an error. It's been reported." with Reload.

### Ops alert stays the pager

`onRequestError` keeps raising `alert({ scope: "ops", key: "http.<route>" })`.
Client-side boundaries do not page (they'd be noisy); Sentry's own alert
rules can email later if wanted — out of scope.

### Privacy

`LEGAL.errorProvider = "Sentry"`. `privacy.md`: §2 "Usage and technical
data" gains a sentence that error reports (stack trace, page, app version,
account and team identifiers, no name or email) are sent to an error
tracking provider; §5 gains `- **Error tracking: {{errorProvider}}.**
Receives error reports as described in section 2.`; retention §7: "Error
reports: 90 days at the provider."

## Failure handling

| case | behaviour |
|---|---|
| DSN unset (local, or misconfigured) | `enabled: false`; boundaries still render; `onRequestError` still alerts |
| Sentry unreachable | SDK buffers/drops; nothing blocks a request |
| `captureRequestError` throws | caught; `alert()` still runs |
| build without `SENTRY_AUTH_TOKEN` | no source-map upload, build passes |
| tunnel route hit without the SDK | Next returns 404 for `/sentry-tunnel` |

## Testing

- `src/lib/__tests__/sentry-scrub.test.ts`: `scrubEvent` drops
  email/username/ip and auth headers, keeps `user.id` and tags;
  `surfaceOf` mapping.
- `src/lib/__tests__/instrumentation.test.ts`: with `@sentry/nextjs` and
  `@/lib/alerts` mocked, `onRequestError` calls both; a throwing
  `captureRequestError` still alerts; runs only on `nodejs`.
- `src/lib/__tests__/error-boundaries.test.tsx`: `renderToStaticMarkup` of
  the three boundaries with a fake error (Sentry mocked) — copy present,
  reset button present.
- `src/lib/__tests__/site-copy.test.tsx` untouched; `legal-doc.test.ts`
  gains the provider assertion; `env.test.ts` gains the DSN as recommended.
- `npm run build` passes with and without `SENTRY_AUTH_TOKEN`.

Live gate: a hidden route `GET /api/v1/health?boom=1` (admin-token only,
existing `apiAuth`) throws → event in Sentry with release = deploy SHA,
`surface: site`, user id set; in the Console, a `?boom=1` on `/desk/help`
renders the Desk boundary and the event carries `surface: desk`,
`host: app`; the ops alert still arrives natively for the server one.
Remove nothing — the boom switch is gated by the operator's token.

## Rollout order

1. Install SDK; pure scrub/surface module + tests.
2. Config files + instrumentation + `next.config` wrapper; env registry;
   build passes with and without token.
3. Error boundaries + tests.
4. Client `SentryUser` + server scope helper wired into Desk, panel, API auth.
5. Privacy + legal test.
6. Luke: Sentry org/project/token/env vars. Deploy, live gate.
