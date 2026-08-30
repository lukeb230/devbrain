import { NextResponse } from "next/server";
import { COOKIE, ORG_COOKIE_OPTS, clearDevbrainCookies, readCookieHeader } from "@/lib/cookies";
import { safeNext } from "@/lib/panel-routes";
import { joinLimiter } from "@/lib/ratelimit";
import { clientIp } from "@/lib/client-ip";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

// ============================================================================
// Invite links — GET /join/<code>[?next=/widget]
// Not signed in → GitHub sign-in with next= back here (the invite is the
// authorisation, so no allowlist applies). Signed in → validate the code,
// add the membership with the invite's role, make that org the active one,
// and land on the dashboard — or wherever ?next= / devbrain_next points
// (the desktop panel passes next=/widget; the browser sign-in hand-off sets
// the cookie so the deep link back to the app still fires).
// ============================================================================

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const url = new URL(request.url);
  if (!joinLimiter.take(clientIp(request))) {
    return NextResponse.redirect(`${url.origin}/welcome?invite_error=${encodeURIComponent("Too many attempts — wait a minute and try again.")}`);
  }
  const explicitNext = safeNext(url.searchParams.get("next"), "");
  const inPanel = explicitNext === "/widget";
  const self = `/join/${encodeURIComponent(code)}${explicitNext ? `?next=${encodeURIComponent(explicitNext)}` : ""}`;
  const fail = (why: string) =>
    NextResponse.redirect(`${url.origin}/welcome?invite_error=${encodeURIComponent(why)}${inPanel ? "&from=widget" : ""}`);

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${url.origin}/?next=${encodeURIComponent(self)}`);

  const admin = supabaseAdmin();
  const { data: inv } = await admin
    .from("org_invites")
    .select("id, org_id, role, max_uses, uses, expires_at, revoked_at")
    .eq("code", code)
    .maybeSingle();
  if (!inv) return fail("That invite link isn't valid.");
  if (inv.revoked_at) return fail("That invite was revoked. Ask for a new link.");
  if (new Date(inv.expires_at).getTime() < Date.now()) return fail("That invite has expired. Ask for a new link.");
  if (inv.max_uses != null && inv.uses >= inv.max_uses) return fail("That invite has already been used.");

  const m = (user.user_metadata ?? {}) as Record<string, unknown>;
  const login = String(m.user_name || m.preferred_username || user.email?.split("@")[0] || "member");
  const { data: existing } = await admin.from("org_members").select("org_id").eq("org_id", inv.org_id).eq("user_id", user.id).maybeSingle();
  if (!existing) {
    const { error } = await admin.from("org_members").insert({ org_id: inv.org_id, user_id: user.id, role: inv.role, github_login: login });
    if (error) return fail("Could not join the team. Try the link again.");
    await admin.from("org_invites").update({ uses: inv.uses + 1 }).eq("id", inv.id);
    await admin.from("events").insert({ org_id: inv.org_id, repo_id: null, kind: "member_joined", payload: { login, role: inv.role, invite: inv.id } });
  }

  const cookieNext = readCookieHeader(request.headers.get("cookie"), COOKIE.next);
  const candidate = explicitNext || cookieNext;
  const next = candidate && !candidate.startsWith("/join/") ? safeNext(candidate, "/dashboard?joined=1") : "/dashboard?joined=1";
  const res = NextResponse.redirect(`${url.origin}${next}`);
  res.cookies.set(COOKIE.org, inv.org_id, ORG_COOKIE_OPTS);
  clearDevbrainCookies(res.cookies, [{ name: COOKIE.lastRepo, path: "/" }, ...(cookieNext ? [{ name: COOKIE.next, path: "/" }] : [])]);
  return res;
}
