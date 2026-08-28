"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/org";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

// Settings → Reminders: map an Apple Reminders list to a linked repo, or
// remove a mapping. Admins and owners only; the repo is re-read under RLS
// before writing with the service role.

async function member() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const ctx = await requireRole("admin");
  if (!ctx) return null;
  return { supabase, orgId: ctx.orgId, label: ctx.login };
}

export async function mapList(formData: FormData): Promise<void> {
  const me = await member();
  if (!me) return;
  const list = String(formData.get("list") || "").trim().slice(0, 120);
  const repoId = String(formData.get("repoId") || "");
  if (!list || !/^[0-9a-f-]{36}$/.test(repoId)) return;
  const { data: repo } = await me.supabase.from("linked_repos").select("id, org_id").eq("id", repoId).single();
  if (!repo || repo.org_id !== me.orgId) return;
  const admin = supabaseAdmin();
  await admin.from("reminder_sources").delete().eq("org_id", me.orgId).ilike("list_name", list.replace(/[%_\\]/g, "\\$&"));
  await admin.from("reminder_sources").insert({ org_id: me.orgId, repo_id: repo.id, list_name: list, created_by: me.label });
  revalidatePath("/settings/reminders");
}

export async function unmapList(formData: FormData): Promise<void> {
  const me = await member();
  if (!me) return;
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  const admin = supabaseAdmin();
  await admin.from("reminder_sources").delete().eq("id", id).eq("org_id", me.orgId);
  revalidatePath("/settings/reminders");
}
