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
  user?: { id?: string | number; email?: string; username?: string; ip_address?: string | null };
  request?: { url?: string; headers?: Record<string, string> };
  tags?: Record<string, unknown>;
};

const DROP_HEADER = (name: string) => {
  const n = name.toLowerCase();
  return (
    n === "authorization" ||
    n === "cookie" ||
    n.includes("token") ||
    n.startsWith("x-vercel-ip") ||
    n.includes("forwarded") ||
    n.endsWith("-ip")
  );
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
