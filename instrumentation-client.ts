import * as Sentry from "@sentry/nextjs";
import { environmentFromEnv, releaseFromEnv, scrubEvent } from "@/lib/sentry-scrub";

// The browser half: the Console and panel webviews and the public site.
// No replay, no tracing — errors only, and never a name or an email.
//
// Next inlines NEXT_PUBLIC_* only for literal `process.env.NEXT_PUBLIC_*`
// member expressions in client code; a bare `process.env` is `{}` in the
// browser bundle. So these are read as literals and handed in explicitly —
// never pass `process.env` itself into the *FromEnv helpers here.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const release = releaseFromEnv({ NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA });
const environment = environmentFromEnv({ VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV, NODE_ENV: process.env.NODE_ENV });

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment,
  release,
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  sendDefaultPii: false,
  // Sentry's ErrorEvent#user.id can be a number; the pure scrubEvent helper
  // (shared with other surfaces) only knows string ids. The cast is local to
  // this boundary — scrubEvent's own typing stays strict.
  beforeSend: (event) => scrubEvent(event as never) as never,
});

// Present on SDK majors that instrument App Router navigations; harmless to
// export when the SDK ignores it. Confirmed present in this SDK's client
// build (node_modules/@sentry/nextjs/build/esm/index.client.js).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
