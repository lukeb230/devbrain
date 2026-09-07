// ============================================================================
// The browser dashboard is retired (phase 5). Every old dashboard / settings
// URL maps to its Desk route; the middleware sends the visitor to /open with
// that route, where they can open it in the app or continue in the browser.
// Pure so it's unit-tested; the middleware just calls it.
// ============================================================================

const UUID = "[0-9a-f-]{36}";
const REPO_PAGE = new RegExp(`^/dashboard/(${UUID})(?:/(tasks|specs|brain|history|rules))?(?:/(${UUID}))?/?$`);

/** Desk route for a retired dashboard/settings path, or null if the path is
 *  not a retired one (keep serving it). */
export function deskRouteFor(pathname: string): string | null {
  if (pathname === "/dashboard" || pathname === "/dashboard/") return "/desk";
  const m = pathname.match(REPO_PAGE);
  if (m) {
    const [, repo, page, sub] = m;
    const q = `?repo=${repo}`;
    switch (page) {
      case undefined: return `/desk${q}`;
      case "tasks": return `/desk/board${q}`;
      case "specs": return sub ? `/desk/specs/${sub}${q}` : `/desk/specs${q}`;
      case "brain": return `/desk/brain${q}`;
      case "history": return `/desk/history${q}`;
      case "rules": return `/desk/rules${q}`;
    }
  }
  const settings: Record<string, string> = {
    "/settings/members": "/desk/members",
    "/settings/org": "/desk/team",
    "/settings/tokens": "/desk/tokens",
    "/settings/reminders": "/desk/reminders",
  };
  const clean = pathname.replace(/\/$/, "");
  if (settings[clean]) return settings[clean];
  return null;
}

/** Where a retired URL redirects: the /open page carrying the Desk route. */
export function retiredRedirect(pathname: string): string | null {
  const to = deskRouteFor(pathname);
  return to ? `/open?to=${encodeURIComponent(to)}` : null;
}

/** Only Desk routes may be opened from /open (never an arbitrary URL). */
export function safeDeskRoute(raw: string | null | undefined): string {
  const s = String(raw ?? "");
  return /^\/desk(\/|\?|$)/.test(s) && !s.includes("//") ? s : "/desk";
}
