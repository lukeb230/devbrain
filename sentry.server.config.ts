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
  // Sentry's ErrorEvent#user.id can be a number; the pure scrubEvent helper
  // (shared with other surfaces) only knows string ids. The cast is local to
  // this boundary — scrubEvent's own typing stays strict.
  beforeSend: (event) => scrubEvent(event as never) as never,
});
