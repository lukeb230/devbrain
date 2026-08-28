"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ORG_COOKIE, ORG_COOKIE_OPTS, currentOrg, requireRole } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function switchOrg(formData: FormData): Promise<void> {
  const me = await currentOrg();
  const id = String(formData.get("orgId") || "");
  if (!me || !me.orgs.some((o) => o.id === id)) return;
  (await cookies()).set(ORG_COOKIE, id, ORG_COOKIE_OPTS);
  redirect("/dashboard");
}

export async function renameOrg(formData: FormData): Promise<void> {
  const me = await requireRole("owner");
  if (!me) return;
  const name = String(formData.get("name") || "").trim().slice(0, 60);
  if (!name) return;
  await supabaseAdmin().from("orgs").update({ name }).eq("id", me.orgId);
  revalidatePath("/", "layout");
}

export async function deleteOrg(formData: FormData): Promise<void> {
  const me = await requireRole("owner");
  if (!me) return;
  if (String(formData.get("confirm") || "").trim() !== me.orgName) return;
  await supabaseAdmin().from("orgs").delete().eq("id", me.orgId); // cascades everything
  (await cookies()).set(ORG_COOKIE, "", { maxAge: 0, path: "/" });
  redirect("/welcome");
}
