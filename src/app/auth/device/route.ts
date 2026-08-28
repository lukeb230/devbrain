import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { hashToken } from "@/lib/token";

// ============================================================================
// Desktop sign-in, step 2 — loaded INSIDE the app's panel after the deep link.
//   GET /auth/device?token=<one-time token from /auth/device/start>
// Verifies the token (unused, unexpired), marks it used, and establishes a
// session in the panel's own cookie jar by minting a magic-link OTP for the
// same user server-side and verifying it here. Then lands on /widget.
// ============================================================================

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const fail = (why: string) => NextResponse.redirect(`${url.origin}/?from=widget&device_error=${encodeURIComponent(why)}`);
  if (!token.startsWith("dbd_")) return fail("bad token");

  const admin = supabaseAdmin();
  const { data: row } = await admin
    .from("device_logins")
    .select("id, user_id, expires_at, used_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!row) return fail("unknown token");
  if (row.used_at) return fail("token already used");
  if (new Date(row.expires_at).getTime() < Date.now()) return fail("token expired");
  await admin.from("device_logins").update({ used_at: new Date().toISOString() }).eq("id", row.id);

  const { data: userRes } = await admin.auth.admin.getUserById(row.user_id);
  const email = userRes?.user?.email;
  if (!email) return fail("no email on account");

  // A magic link for this user, consumed immediately by THIS request, so the
  // session cookies are written into the panel's jar — never shown to anyone.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const hashed = link?.properties?.hashed_token;
  if (linkErr || !hashed) return fail("could not create session");

  const supabase = await supabaseServer();
  const { error: verifyErr } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: hashed });
  if (verifyErr) return fail("session verification failed");

  return NextResponse.redirect(`${url.origin}/widget`);
}
