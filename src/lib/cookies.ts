// ============================================================================
// DevBrain's own cookies — names, attributes, and one way to clear them.
// Kept dependency-free so middleware (edge) can import it too.
// ============================================================================

export const COOKIE = {
  org: "devbrain_org",           // active org (validated against membership on every read)
  lastRepo: "devbrain_last_repo", // last repo visited → widget scope
  next: "devbrain_next",         // post-login destination (desktop hand-off)
  newToken: "devbrain_new_token", // plaintext dev token, shown once
  notice: "devbrain_notice",     // one-shot message for the onboarding wall (60 s)
  channel: "devbrain_channel",   // which app build last signed in from this browser: stable | beta
} as const;

const secure = process.env.NODE_ENV === "production"; // Safari refuses Secure on http://localhost
const base = { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };

export const ORG_COOKIE_OPTS = { ...base, maxAge: 60 * 60 * 24 * 365 };
export const LAST_REPO_COOKIE_OPTS = { ...base, maxAge: 60 * 60 * 24 * 90 };
export const NEXT_COOKIE_OPTS = { ...base, maxAge: 3600 };
export const NEW_TOKEN_COOKIE_OPTS = { ...base, path: "/settings", maxAge: 120 };
export const NOTICE_COOKIE_OPTS = { ...base, path: "/desk", maxAge: 60 };
/** Same shape as NOTICE_COOKIE_OPTS, scoped to whichever surface is setting
 *  it — e.g. the /settings/setup by-hand page, which the Desk layout never
 *  renders for, so a cookie stuck at path /desk would never come back. */
export function noticeCookieOptsFor(path: string) {
  return { ...base, path, maxAge: 60 };
}
// Set by /auth/device/start when the app opens the browser to sign in; read
// by /open so its "Open in the app" button uses the scheme of the build the
// person actually has. Not cleared on sign-out (see ALL_DEVBRAIN_COOKIES).
export const CHANNEL_COOKIE_OPTS = { ...base, maxAge: 60 * 60 * 24 * 365 };

/** Every DevBrain cookie with the path it is set on — deletion must match. */
export const ALL_DEVBRAIN_COOKIES: { name: string; path: string }[] = [
  { name: COOKIE.org, path: "/" },
  { name: COOKIE.lastRepo, path: "/" },
  { name: COOKIE.next, path: "/" },
  { name: COOKIE.newToken, path: "/settings" },
  { name: COOKIE.newToken, path: "/desk" },
  { name: COOKIE.notice, path: "/desk" },
  { name: COOKIE.notice, path: "/settings" },
];

/** Structurally matches both `await cookies()` and `NextResponse.cookies`. */
export type CookieJar = { set(name: string, value: string, opts: Record<string, unknown>): unknown };

export function clearDevbrainCookies(jar: CookieJar, names: { name: string; path: string }[] = ALL_DEVBRAIN_COOKIES) {
  for (const { name, path } of names) jar.set(name, "", { maxAge: 0, path, httpOnly: true, secure, sameSite: "lax" });
}

/** Read one cookie from a raw Cookie header (route handlers without next/headers). */
export function readCookieHeader(header: string | null | undefined, name: string): string {
  const m = new RegExp(`(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`).exec(header ?? "");
  if (!m) return "";
  try { return decodeURIComponent(m[1]); } catch { return ""; }
}
