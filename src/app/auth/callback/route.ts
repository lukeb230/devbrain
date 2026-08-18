import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// OAuth code exchange. On first sign-in, provision a personal org and
// membership so the user lands on a working dashboard.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next") ?? "";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/dashboard";

  if (code) {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Allowlist: if DEVBRAIN_ALLOWED_LOGINS is set (comma-separated GitHub
      // usernames), only those accounts may use the app. Unset = open (dev).
      const allowRaw = process.env.DEVBRAIN_ALLOWED_LOGINS || "";
      if (allowRaw.trim()) {
        const allowed = allowRaw
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        const login = (
          (data.user.user_metadata?.user_name as string | undefined) ?? ""
        ).toLowerCase();
        if (!allowed.includes(login)) {
          await supabase.auth.signOut();
          return NextResponse.redirect(`${origin}/?denied=1`);
        }
      }
      const admin = supabaseAdmin();
      const { data: memberships } = await admin
        .from("org_members")
        .select("org_id")
        .eq("user_id", data.user.id)
        .limit(1);

      if (!memberships || memberships.length === 0) {
        const login =
          (data.user.user_metadata?.user_name as string | undefined) ??
          data.user.email?.split("@")[0] ??
          "team";
        // Single-team instance: an allowlisted newcomer JOINS the existing
        // team org (so they see the same repos, tasks, and brain as everyone
        // else). Only the very first user ever bootstraps a new org.
        const { data: existingOrg } = await admin
          .from("orgs")
          .select("id")
          .order("created_at")
          .limit(1)
          .single();
        if (existingOrg) {
          await admin.from("org_members").insert({
            org_id: existingOrg.id,
            user_id: data.user.id,
            role: "member",
            github_login: login,
          });
        } else {
          const slug = `${login}-${data.user.id.slice(0, 6)}`.toLowerCase();
          const { data: org } = await admin
            .from("orgs")
            .insert({ name: `${login}'s team`, slug })
            .select("id")
            .single();
          if (org) {
            await admin.from("org_members").insert({
              org_id: org.id,
              user_id: data.user.id,
              role: "owner",
              github_login: login,
            });
          }
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/?auth_error=1`);
}
