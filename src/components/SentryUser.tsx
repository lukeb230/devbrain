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
      const w = window as unknown as { __TAURI__?: unknown };
      Sentry.setTag("host", typeof window !== "undefined" && w.__TAURI__ ? "app" : "browser");
    } catch { /* optional */ }
  }, [userId, orgId, pathname]);
  return null;
}
