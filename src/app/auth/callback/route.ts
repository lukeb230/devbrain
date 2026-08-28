import { NextResponse } from "next/server";
import { COOKIE, NEXT_COOKIE_OPTS, readCookieHeader } from "@/lib/cookies";
import { safeNext } from "@/lib/panel-routes";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// OAuth code exchange. Newcomers without a team are sent to /welcome.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Where to land: ?next= from the sign-in button, else the devbrain_next
  // cookie it set (the desktop panel relies on this — it must return to
  // /widget, never /dashboard, which the panel opens in the browser).
  const cookieNext = readCookieHeader(request.headers.get("cookie"), COOKIE.next);
  const next = safeNext(searchParams.get("next") || cookieNext, "/dashboard");

  if (code) {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Team creation is open: no allowlist. A newcomer with no membership
      // goes to /welcome (create a team or paste an invite) — unless they
      // arrived through an invite link, which /join handles itself.
      const { data: memberships } = await supabaseAdmin()
        .from("org_members")
        .select("org_id")
        .eq("user_id", data.user.id)
        .limit(1);
      if (!memberships || memberships.length === 0) {
        if (next.startsWith("/join/")) return NextResponse.redirect(`${origin}${next}`);
        const res = NextResponse.redirect(`${origin}/welcome`);
        // Keep the desktop hand-off destination alive across /welcome.
        if (next !== "/dashboard") res.cookies.set(COOKIE.next, next, NEXT_COOKIE_OPTS);
        return res;
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/?auth_error=1`);
}
