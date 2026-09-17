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
