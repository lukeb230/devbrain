// ============================================================================
// The front door of the v1 API: authenticate the Bearer token, then count the
// request against the token, the team and the platform before the route does
// any work. One helper so a new route cannot forget either half.
//
// 429 carries Retry-After and says which ceiling was hit, because the client
// on the other end is a hook inside someone's editor and the person needs to
// know it is a limit, not a broken token.
// ============================================================================

import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { durableDenied, durableTake, limits } from "@/lib/ratelimit";
import { resolveDevToken } from "@/lib/token";

export type ApiAuth = NonNullable<Awaited<ReturnType<typeof resolveDevToken>>>;

const UNAUTHORIZED = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });

function tooMany(bucket: string, retryAfter: number) {
  const what = bucket.startsWith("bad:")
    ? "too many rejected tokens from this address"
    : bucket.startsWith("tok:")
    ? "this token is sending too many requests"
    : bucket.startsWith("org:")
      ? "your team is sending too many requests"
      : "DevBrain is at capacity";
  return NextResponse.json({ error: `rate limited — ${what}`, retry_after: retryAfter }, { status: 429, headers: { "retry-after": String(retryAfter) } });
}

/** Resolve the caller and charge the request against every ceiling.
 *  Returns the token's identity, or the response the route must return. */
export async function apiAuth(request: Request): Promise<ApiAuth | { denied: NextResponse }> {
  const l = limits();
  // Anyone can send a made-up token, and resolving one costs a database read.
  // Failures are counted per address, and an address that has burned through
  // its budget is refused before the read — so a flood of garbage is cheap to
  // say no to. Success costs nothing here: a whole office behind one address
  // is normal, and their real ceilings are the token and the team below.
  const ip = clientIp(request);
  const bad = `bad:${ip}`;
  if (durableDenied(bad, 60)) return { denied: tooMany(bad, 60) };

  const auth = await resolveDevToken(request.headers.get("authorization"));
  if (!auth) {
    durableTake([{ bucket: bad, limit: l.ip_per_min, window: 60 }]);
    return { denied: UNAUTHORIZED() };
  }
  const over = durableTake([
    { bucket: `tok:${auth.token_id}`, limit: l.token_per_min, window: 60 },
    { bucket: `org:${auth.org_id}`, limit: l.org_per_min, window: 60 },
    { bucket: `orgd:${auth.org_id}`, limit: l.org_per_day, window: 86_400 },
    { bucket: "all", limit: l.global_per_min, window: 60 },
  ]);
  if (over) return { denied: tooMany(over, over.startsWith("orgd:") ? 600 : 60) };
  return auth;
}

/** Per-IP ceiling for the endpoints anyone can reach without a token. */
export function publicLimit(ip: string, what: string): NextResponse | null {
  const l = limits();
  const over = durableTake([
    { bucket: `ip:${what}:${ip}`, limit: l.ip_per_min, window: 60 },
    { bucket: `ipd:${ip}`, limit: l.ip_per_min * 60, window: 86_400 },
  ]);
  return over ? tooMany(over, 60) : null;
}
