"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { COOKIE, ORG_COOKIE_OPTS, clearDevbrainCookies } from "@/lib/cookies";
import { currentOrg, requireRoleOrRedirect } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase/server";
import { returnTo } from "@/lib/surface";

export async function switchOrg(formData: FormData): Promise<void> {
  const me = await currentOrg();
  const id = String(formData.get("orgId") || "");
  if (!me || !me.orgs.some((o) => o.id === id)) return;
  const jar = await cookies();
  jar.set(COOKIE.org, id, ORG_COOKIE_OPTS);
  clearDevbrainCookies(jar, [{ name: COOKIE.lastRepo, path: "/" }]); // never carry a repo across teams
  redirect(returnTo(formData, "/dashboard"));
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

/** Monthly overage spend limit for the AI layer (admins). 0 = pause at the
 *  daily allowance instead of running overage. Comped teams have no limit. */
export async function setOverageLimit(formData: FormData): Promise<void> {
  const me = await requireRoleOrRedirect("admin", "/desk/team");
  const dollars = Number(String(formData.get("limit") || "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(dollars) || dollars < 0 || dollars > 10000) return;
  await supabaseAdmin().from("orgs").update({ overage_limit_cents: Math.round(dollars * 100) }).eq("id", me.orgId);
  revalidatePath("/desk/team");
  redirect(returnTo(formData, "/desk/team"));
}
