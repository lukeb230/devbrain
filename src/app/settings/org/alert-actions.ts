"use server";

import { revalidatePath } from "next/cache";
import { alert } from "@/lib/alerts";
import { requireRole } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase/server";

// Team alert settings: channels (owner), dismiss (admin+), test (admin+).

export async function addChannel(formData: FormData): Promise<void> {
  const me = await requireRole("owner");
  if (!me) return;
  const target = String(formData.get("target") || "").trim();
  if (!/^https:\/\/\S+$/.test(target) || target.length > 500) return;
  await supabaseAdmin().from("alert_channels").insert({ org_id: me.orgId, kind: "webhook", target, created_by: me.login });
  revalidatePath("/settings/org");
}

export async function removeChannel(formData: FormData): Promise<void> {
  const me = await requireRole("owner");
  if (!me) return;
  await supabaseAdmin().from("alert_channels").delete().eq("id", String(formData.get("id") || "")).eq("org_id", me.orgId);
  revalidatePath("/settings/org");
}

export async function sendTestAlert(): Promise<void> {
  const me = await requireRole("admin");
  if (!me) return;
  await alert({ scope: { orgId: me.orgId }, key: `test.${Date.now()}`, severity: "info", title: `Test alert from ${me.login}`, detail: "If you can read this, alerts for your team are wired up. Dismiss it on the dashboard." });
  revalidatePath("/settings/org");
  revalidatePath("/dashboard");
}

export async function dismissAlert(formData: FormData): Promise<void> {
  const me = await requireRole("admin");
  if (!me) return;
  await supabaseAdmin()
    .from("alert_log")
    .update({ resolved_at: new Date().toISOString(), resolved_by: me.login })
    .eq("id", String(formData.get("id") || ""))
    .eq("org_id", me.orgId)
    .is("resolved_at", null);
  revalidatePath("/", "layout");
}
