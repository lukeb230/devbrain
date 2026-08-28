import { NextResponse } from "next/server";
import { clearDevbrainCookies } from "@/lib/cookies";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  const res = NextResponse.redirect(new URL("/", request.url), { status: 302 });
  clearDevbrainCookies(res.cookies); // org, last repo, pending destination, shown-once token
  return res;
}
