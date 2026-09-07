"use server";

import { revalidatePath } from "next/cache";
import { alert, operatorOrgId } from "@/lib/alerts";
import { requireRoleOrRedirect } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase/server";
import { returnTo } from "@/lib/surface";

// Team alerts: test (admin+) and dismiss (admin+). Delivery is native — the
// Mac app watches alert_log — so there is nothing to configure here.

export async function sendTestAlert(): Promise<void> {
  const me = await requireRoleOrRedirect("admin", "/settings/org");
  await alert({
    scope: { orgId: me.orgId },
    key: `test.${Date.now()}`,
    severity: "info",
    title: `Test alert from ${me.login}`,
    detail: "If this reached your Mac as a notification, team alerts are working. Dismiss it here or in the panel.",
  });
  revalidatePath("/settings/org");
  revalidatePath("/dashboard");
  revalidatePath("/desk", "layout");
}

export async function dismissAlert(formData: FormData): Promise<void> {
  const me = await requireRoleOrRedirect("admin", returnTo(formData, "/dashboard"));
  const id = String(formData.get("id") || "");
  if (!id) return;
  const admin = supabaseAdmin();
  const { data: row } = await admin.from("alert_log").select("id, org_id").eq("id", id).is("resolved_at", null).maybeSingle();
  if (!row) return;
  // A team's admins dismiss their team's alerts; the operator's admins may
  // also dismiss ops (org_id-null) alerts. Nobody touches another team's.
  const allowed = row.org_id === me.orgId || (row.org_id === null && (await operatorOrgId()) === me.orgId);
  if (!allowed) return;
  await admin
    .from("alert_log")
    .update({ resolved_at: new Date().toISOString(), resolved_by: me.login })
    .eq("id", row.id)
    .is("resolved_at", null);
  revalidatePath("/", "layout");
}
