import { NextResponse } from "next/server";
import { clearDevbrainCookies } from "@/lib/cookies";
import { signOutDestination } from "@/lib/surface";
import { supabaseServer } from "@/lib/supabase/server";

// POST from the panel's menu (from=widget), the Console's toolbar
// (from=desk) or any browser form (no from). Clears the Supabase session and
// every DevBrain cookie except the app-channel one, then returns the caller
// to the sign-in screen that belongs to its surface.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const from = form?.get("from");
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  const res = NextResponse.redirect(new URL(signOutDestination(typeof from === "string" ? from : null), request.url), { status: 302 });
  clearDevbrainCookies(res.cookies); // org, last repo, pending destination, shown-once token, notice
  return res;
}
