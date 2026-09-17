import * as Sentry from "@sentry/nextjs";
import { environmentFromEnv, releaseFromEnv, scrubEvent, surfaceOf } from "@/lib/sentry-scrub";

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
  beforeSend: (event) => {
    if (typeof window !== "undefined") {
      event.tags = {
        ...event.tags,
        surface: surfaceOf(window.location.pathname),
        host: "__TAURI__" in window ? "app" : "browser",
      };
    }
    return scrubEvent(event);
  },
});

// Present on SDK majors that instrument App Router navigations; harmless to
// export when the SDK ignores it. Confirmed present in this SDK's client
// build (node_modules/@sentry/nextjs/build/esm/index.client.js).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
