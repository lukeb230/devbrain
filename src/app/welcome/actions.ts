"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, ORG_COOKIE_OPTS, clearDevbrainCookies } from "@/lib/cookies";
import { safeNext } from "@/lib/panel-routes";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

// First sign-in with no team: create one (you become its owner) or paste an
// invite link. Team creation is open — anyone with a GitHub account.
// Inside the desktop panel the forms carry next=/widget so the panel lands
// back on itself; in the browser the devbrain_next cookie (set by the
// desktop sign-in hand-off) wins, else the dashboard.

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "team";
}

export async function createTeam(formData: FormData): Promise<void> {
  const formNext = safeNext(formData.get("next") as string | null, "");
  const inPanel = formNext === "/widget";
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const m = (user.user_metadata ?? {}) as Record<string, unknown>;
  const login = String(m.user_name || m.preferred_username || user.email?.split("@")[0] || "member");
  const name = String(formData.get("name") || "").trim().slice(0, 60) || `${login}'s team`;

  const admin = supabaseAdmin();
  const base = slugify(name);
  let org: { id: string } | null = null;
  for (let attempt = 0; attempt < 3 && !org; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const { data } = await admin.from("orgs").insert({ name, slug }).select("id").single();
    org = data;
  }
  if (!org) redirect(`/welcome?invite_error=${encodeURIComponent("Could not create the team. Try again.")}${inPanel ? "&from=widget" : ""}`);
  await admin.from("org_members").insert({ org_id: org.id, user_id: user.id, role: "owner", github_login: login });
  await admin.from("events").insert({ org_id: org.id, repo_id: null, kind: "org_created", payload: { by: login, name } });

  const jar = await cookies();
  jar.set(COOKIE.org, org.id, ORG_COOKIE_OPTS);
  const cookieNext = jar.get(COOKIE.next)?.value ?? "";
  clearDevbrainCookies(jar, [{ name: COOKIE.lastRepo, path: "/" }, ...(cookieNext ? [{ name: COOKIE.next, path: "/" }] : [])]);
  redirect(formNext || safeNext(cookieNext, "/dashboard?created=1"));
}

export async function useInvite(formData: FormData): Promise<void> {
  const formNext = safeNext(formData.get("next") as string | null, "");
  const inPanel = formNext === "/widget";
  const raw = String(formData.get("invite") || "").trim();
  const code = raw.replace(/^.*\/join\//, "").split(/[?#\s]/)[0];
  if (!code) redirect(`/welcome?invite_error=${encodeURIComponent("Paste the whole invite link.")}${inPanel ? "&from=widget" : ""}`);
  redirect(`/join/${encodeURIComponent(code)}${formNext ? `?next=${encodeURIComponent(formNext)}` : ""}`);
}
