"use server";

import { revalidatePath } from "next/cache";
import { alert } from "@/lib/alerts";
import { requireRoleOrRedirect, withError } from "@/lib/org";
import { redirect } from "next/navigation";
import { isAllowedWebhookHost } from "@/lib/webhook-host";
import { supabaseAdmin } from "@/lib/supabase/server";

// Team alert settings: channels (owner), dismiss (admin+), test (admin+).

export async function addChannel(formData: FormData): Promise<void> {
  const me = await requireRoleOrRedirect("owner", "/settings/org");
  const target = String(formData.get("target") || "").trim();
  if (target.length > 500 || !isAllowedWebhookHost(target)) {
    // Only Slack/Discord https hooks — see webhook-host.ts. Anything else is
    // refused rather than silently POSTed to from inside our network.
    redirect(withError("/settings/org", "webhook_host"));
  }
  await supabaseAdmin().from("alert_channels").insert({ org_id: me.orgId, kind: "webhook", target, created_by: me.login });
  revalidatePath("/settings/org");
}

export async function removeChannel(formData: FormData): Promise<void> {
  const me = await requireRoleOrRedirect("owner", "/settings/org");
  await supabaseAdmin().from("alert_channels").delete().eq("id", String(formData.get("id") || "")).eq("org_id", me.orgId);
  revalidatePath("/settings/org");
}

export async function sendTestAlert(): Promise<void> {
  const me = await requireRoleOrRedirect("admin", "/settings/org");
  await alert({ scope: { orgId: me.orgId }, key: `test.${Date.now()}`, severity: "info", title: `Test alert from ${me.login}`, detail: "If you can read this, alerts for your team are wired up. Dismiss it on the dashboard." });
  revalidatePath("/settings/org");
  revalidatePath("/dashboard");
}

export async function dismissAlert(formData: FormData): Promise<void> {
  const me = await requireRoleOrRedirect("admin", formData.get("stay") ? "/widget" : "/dashboard");
  await supabaseAdmin()
    .from("alert_log")
    .update({ resolved_at: new Date().toISOString(), resolved_by: me.login })
    .eq("id", String(formData.get("id") || ""))
    .eq("org_id", me.orgId)
    .is("resolved_at", null);
  revalidatePath("/", "layout");
}
