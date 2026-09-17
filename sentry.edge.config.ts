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
