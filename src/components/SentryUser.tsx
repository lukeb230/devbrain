"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// The browser side of "who": id-only identity plus the team tag. Renders
// nothing. Mounted by the Desk layout and the panel page, which already
// know the user; site pages need no mount — there is no user there, and
// surface/host are applied at send time in instrumentation-client.ts's
// beforeSend, not here.
export function SentryUser({ userId, orgId }: { userId: string | null; orgId: string | null }) {
  useEffect(() => {
    try {
      Sentry.setUser(userId ? { id: userId } : null);
      if (orgId) Sentry.setTag("team", orgId);
    } catch { /* optional */ }
  }, [userId, orgId]);
  return null;
}
