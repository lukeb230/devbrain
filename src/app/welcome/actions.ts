"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ORG_COOKIE, ORG_COOKIE_OPTS } from "@/lib/org";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

// First sign-in with no team: create one (you become its owner) or paste an
// invite link. Team creation is open — anyone with a GitHub account.

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "team";
}

export async function createTeam(formData: FormData): Promise<void> {
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
  if (!org) redirect("/welcome?invite_error=" + encodeURIComponent("Could not create the team. Try again."));
  await admin.from("org_members").insert({ org_id: org.id, user_id: user.id, role: "owner", github_login: login });
  await admin.from("events").insert({ org_id: org.id, repo_id: null, kind: "org_created", payload: { by: login, name } });

  const jar = await cookies();
  jar.set(ORG_COOKIE, org.id, ORG_COOKIE_OPTS);
  const next = jar.get("devbrain_next")?.value ?? "";
  if (next) jar.set("devbrain_next", "", { maxAge: 0, path: "/" });
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard?created=1");
}

export async function useInvite(formData: FormData): Promise<void> {
  const raw = String(formData.get("invite") || "").trim();
  const code = raw.replace(/^.*\/join\//, "").split(/[?#\s]/)[0];
  if (!code) redirect("/welcome?invite_error=" + encodeURIComponent("Paste the whole invite link."));
  redirect(`/join/${encodeURIComponent(code)}`);
}
