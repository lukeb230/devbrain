// ============================================================================
// The Console belongs to the app, not to a browser tab.
//
// Every DevBrain webview identifies itself in its user agent (APP_USER_AGENT
// in widget/src-tauri/src/main.rs). A request without that marker is a
// browser, and browsers get the "Open this in DevBrain" page instead of the
// working surfaces.
//
// What stays reachable in a browser, deliberately:
//   /                landing + GitHub sign-in
//   /welcome*        create or join a team
//   /join/*          invite links (people click these in email)
//   /open            the hand-off page, and the download
//   /pricing         the plans
//   /desk/plan       billing — someone whose app will not open, or whose
//                    trial lapsed on a Mac they no longer have, must still
//                    be able to pay or cancel
//   /settings/setup  the by-hand setup page
//   /privacy /terms /auth/* /api/*
//
// Enforcement is behind a switch (system_state.app_only.enabled) so it can be
// turned on only once installs carry the marker — otherwise every existing
// app would be bounced out of its own Console.
// ============================================================================

export const APP_UA_MARKER = "DevBrainApp/";

/** Routes that keep working in a browser even when the gate is on. */
const BROWSER_OK = [
  /^\/$/,
  /^\/welcome(\/|$)/,
  /^\/join(\/|$)/,
  /^\/open(\/|$)/,
  /^\/pricing(\/|$)/,
  /^\/desk\/plan(\/|$)/,
  /^\/settings\/setup(\/|$)/,
  /^\/privacy(\/|$)/,
  /^\/terms(\/|$)/,
  /^\/auth(\/|$)/,
  /^\/api(\/|$)/,
];

export function isAppRequest(userAgent: string | null | undefined): boolean {
  return (userAgent ?? "").includes(APP_UA_MARKER);
}

/** Where a browser should be sent instead of this path, or null to allow it. */
export function browserRedirect(pathname: string, userAgent: string | null | undefined, enabled: boolean): string | null {
  if (!enabled || isAppRequest(userAgent)) return null;
  if (BROWSER_OK.some((r) => r.test(pathname))) return null;
  if (!pathname.startsWith("/desk")) return null; // only the Console is app-only
  return `/open?to=${encodeURIComponent(pathname)}`;
}
