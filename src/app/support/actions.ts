"use server";

import { headers } from "next/headers";
import { publicLimit } from "@/lib/api-guard";
import { alert, resolve } from "@/lib/alerts";
import { currentOrg } from "@/lib/org";
import { isHoneypotHit, refLabel, validateReport } from "@/lib/reports";
import { currentUser, supabaseAdmin } from "@/lib/supabase/server";
import { sendReportMail } from "@/lib/support-mail";

// ============================================================================
// submitReport — the one action behind /support (website) and /desk/help
// (Console). Order matters:
//   1. bots and floods get "Thanks" with no reference and nothing written;
//   2. a bad field is named so the person can fix it;
//   3. the row is written FIRST, so a mail problem never loses a report;
//   4. mail goes out; success resolves the ops alert, failure stamps the
//      row and raises it — and the person still gets their reference,
//      because their report is saved and the mail is our problem.
// ============================================================================

export type ReportState = { ok: true; ref: string } | { ok: false; message: string } | null;

const SAVE_ERROR = "Something went wrong saving that. Try again in a moment.";
const ALERT_KEY = "support_mail";

export async function submitReport(_prev: ReportState, formData: FormData): Promise<ReportState> {
  if (isHoneypotHit(formData)) return { ok: true, ref: "" };

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip")?.trim() || "unknown";
  if (await publicLimit(ip, "report")) return { ok: true, ref: "" };

  const user = await currentUser();
  const org = user ? await currentOrg() : null;

  const v = validateReport({
    kind: formData.get("kind"),
    source: formData.get("source"),
    // A signed-in person is who their account says, not what the field says.
    email: user?.email ?? formData.get("email"),
    name: formData.get("name"),
    subject: formData.get("subject"),
    message: formData.get("message"),
    context: formData.get("context"),
  });
  if (!v.ok) return { ok: false, message: v.message };
  const report = org ? { ...v.report, context: { ...v.report.context, team: org.orgName } } : v.report;

  const admin = supabaseAdmin();
  const { data: row, error } = await admin
    .from("reports")
    .insert({
      kind: report.kind, source: report.source, email: report.email, name: report.name, subject: report.subject, message: report.message,
      user_id: user?.id ?? null, org_id: org?.orgId ?? null, context: report.context, mail_status: "pending",
    })
    .select("ref")
    .single();
  if (error || !row) return { ok: false, message: SAVE_ERROR };
  const ref = Number(row.ref);

  const mail = await sendReportMail(report, ref);
  if (mail.status === "sent") {
    await admin.from("reports").update({ mail_status: "sent" }).eq("ref", ref);
    await resolve("ops", ALERT_KEY);
  } else {
    await admin.from("reports").update({ mail_status: "failed", mail_error: mail.error.slice(0, 200) }).eq("ref", ref);
    await alert({ scope: "ops", key: ALERT_KEY, title: "Support mail is not going out", detail: `${refLabel(ref)}: ${mail.error}` });
  }
  return { ok: true, ref: refLabel(ref) };
}
