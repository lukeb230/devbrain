import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { COOKIE, NEXT_COOKIE_OPTS } from "@/lib/cookies";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { hashToken } from "@/lib/token";

// ============================================================================
// Desktop sign-in, step 1 — opened in the user's NORMAL browser by the app.
//   GET /auth/device/start?channel=stable|beta
// Not signed in here yet → bounce through the usual GitHub sign-in with
// next= pointing back at this URL. Signed in → mint a one-time device token
// and hand it to the app through its custom URL scheme. Renders a tiny page
// that both auto-redirects and offers a click (macOS sometimes needs the
// click for custom schemes) plus a "close this tab" note.
// ============================================================================

const SCHEME: Record<string, string> = { stable: "devbrain", beta: "devbrain-beta" };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const channel = SCHEME[url.searchParams.get("channel") ?? ""] ? (url.searchParams.get("channel") as string) : "stable";
  const self = `/auth/device/start?channel=${channel}`;

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // The landing page's sign-in button honours ?next=; from=widget keeps the
    // copy panel-flavoured.
    return NextResponse.redirect(`${url.origin}/?from=widget&next=${encodeURIComponent(self)}`);
  }

  // Signed in but on no team yet: create/join one first (full-size, in the
  // browser), then come back here — the cookie remembers this destination.
  const admin = supabaseAdmin();
  const { count } = await admin.from("org_members").select("org_id", { count: "exact", head: true }).eq("user_id", user.id);
  if (!count) {
    const res = NextResponse.redirect(`${url.origin}/welcome`);
    res.cookies.set(COOKIE.next, self, NEXT_COOKIE_OPTS);
    return res;
  }

  const token = "dbd_" + randomBytes(24).toString("hex");
  const { error } = await admin.from("device_logins").insert({
    user_id: user.id,
    token_hash: hashToken(token),
    channel,
  });
  if (error) return NextResponse.json({ error: "could not start device login" }, { status: 500 });

  const appUrl = `${SCHEME[channel]}://login?token=${encodeURIComponent(token)}`;
  const appName = channel === "beta" ? "DevBrain Beta" : "DevBrain";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Return to ${appName}</title>
<meta http-equiv="refresh" content="0;url=${appUrl}">
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#f8fafc;color:#0f172a;display:grid;place-items:center;height:100vh;margin:0}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;max-width:420px;text-align:center;box-shadow:0 1px 3px rgba(15,23,42,.06)}
a.btn{display:inline-block;margin-top:14px;background:#d9645b;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600}
p{color:#475569;font-size:14px;line-height:1.5}</style></head>
<body><div class="card"><h2 style="margin:0 0 8px">Signed in</h2>
<p>Sending you back to <b>${appName}</b>… If nothing happens, click below, then you can close this tab.</p>
<a class="btn" href="${appUrl}">Open ${appName}</a></div></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
