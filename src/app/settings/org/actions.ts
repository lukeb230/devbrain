"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { COOKIE, ORG_COOKIE_OPTS, clearDevbrainCookies } from "@/lib/cookies";
import { currentOrg, requireRoleOrRedirect } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function switchOrg(formData: FormData): Promise<void> {
  const me = await currentOrg();
  const id = String(formData.get("orgId") || "");
  if (!me || !me.orgs.some((o) => o.id === id)) return;
  const jar = await cookies();
  jar.set(COOKIE.org, id, ORG_COOKIE_OPTS);
  clearDevbrainCookies(jar, [{ name: COOKIE.lastRepo, path: "/" }]); // never carry a repo across teams
  redirect(formData.get("stay") ? "/widget" : "/dashboard");
}

export async function renameOrg(formData: FormData): Promise<void> {
  const me = await requireRoleOrRedirect("owner", "/settings/org");
  const name = String(formData.get("name") || "").trim().slice(0, 60);
  if (!name) return;
  await supabaseAdmin().from("orgs").update({ name }).eq("id", me.orgId);
  revalidatePath("/", "layout");
}

export async function deleteOrg(formData: FormData): Promise<void> {
  const me = await requireRoleOrRedirect("owner", "/settings/org");
  if (String(formData.get("confirm") || "").trim() !== me.orgName) return;
  await supabaseAdmin().from("orgs").delete().eq("id", me.orgId); // cascades everything
  clearDevbrainCookies(await cookies(), [{ name: COOKIE.org, path: "/" }, { name: COOKIE.lastRepo, path: "/" }]);
  redirect("/welcome");
}
