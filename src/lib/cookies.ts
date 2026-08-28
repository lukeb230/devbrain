// ============================================================================
// DevBrain's own cookies — names, attributes, and one way to clear them.
// Kept dependency-free so middleware (edge) can import it too.
// ============================================================================

export const COOKIE = {
  org: "devbrain_org",           // active org (validated against membership on every read)
  lastRepo: "devbrain_last_repo", // last repo visited → widget scope
  next: "devbrain_next",         // post-login destination (desktop hand-off)
  newToken: "devbrain_new_token", // plaintext dev token, shown once
} as const;

const secure = process.env.NODE_ENV === "production"; // Safari refuses Secure on http://localhost
const base = { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };

export const ORG_COOKIE_OPTS = { ...base, maxAge: 60 * 60 * 24 * 365 };
export const LAST_REPO_COOKIE_OPTS = { ...base, maxAge: 60 * 60 * 24 * 90 };
export const NEXT_COOKIE_OPTS = { ...base, maxAge: 3600 };
export const NEW_TOKEN_COOKIE_OPTS = { ...base, path: "/settings", maxAge: 120 };

/** Every DevBrain cookie with the path it is set on — deletion must match. */
export const ALL_DEVBRAIN_COOKIES: { name: string; path: string }[] = [
  { name: COOKIE.org, path: "/" },
  { name: COOKIE.lastRepo, path: "/" },
  { name: COOKIE.next, path: "/" },
  { name: COOKIE.newToken, path: "/settings" },
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
