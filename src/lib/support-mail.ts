import { Resend } from "resend";
import { LEGAL } from "@/lib/legal";
import { ackSubject, bodyForAck, bodyForOps, subjectFor, type Report } from "@/lib/reports";

// ============================================================================
// Support mail — the only outbound email the product sends. Two messages
// per report: the operator's copy (reply-to the submitter, so answering is
// "hit reply") and the submitter's acknowledgement (reply-to us, so their
// follow-up lands in the same thread). Both go in parallel under one 5 s
// budget. Nothing here throws: a provider problem is a value the action
// records on the row and raises as an ops alert.
// ============================================================================

export const SUPPORT_FROM = `${LEGAL.product} <${LEGAL.contact}>`;
const SEND_BUDGET_MS = 5000;

export type MailResult = { status: "sent" } | { status: "failed"; error: string };

type SendResult = { data: { id: string } | null; error: { message: string; name: string } | null };

function withBudget<T>(p: Promise<T>): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error("send timed out")), SEND_BUDGET_MS);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}

export async function sendReportMail(report: Report, ref: number): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { status: "failed", error: "RESEND_API_KEY unset" };
  try {
    const resend = new Resend(key);
    const mails = [
      { from: SUPPORT_FROM, to: [LEGAL.contact], replyTo: report.email, subject: subjectFor(report.kind, ref, report.subject), text: bodyForOps(report, ref) },
      { from: SUPPORT_FROM, to: [report.email], replyTo: LEGAL.contact, subject: ackSubject(ref), text: bodyForAck(report, ref) },
    ];
    const results = await Promise.allSettled(mails.map((m) => withBudget(resend.emails.send(m) as Promise<SendResult>)));
    for (const r of results) {
      if (r.status === "rejected") return { status: "failed", error: String(r.reason instanceof Error ? r.reason.message : r.reason).slice(0, 200) };
      if (r.value?.error) return { status: "failed", error: String(r.value.error.message || r.value.error.name).slice(0, 200) };
    }
    return { status: "sent" };
  } catch (e) {
    return { status: "failed", error: String(e instanceof Error ? e.message : e).slice(0, 200) };
  }
}
