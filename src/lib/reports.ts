import { normaliseEmail } from "@/lib/leads";

// ============================================================================
// Support questions, bug reports and feature requests — the pure half.
// Everything here is I/O-free: what a report is, what is allowed in it, and
// the exact words the two emails use. The action (src/app/support/actions.ts)
// and the mail module (src/lib/support-mail.ts) call in; the tests pin the
// contract without a database or a mail provider.
// ============================================================================

export const REPORT_KINDS = ["support", "bug", "feature"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const REPORT_SOURCES = ["web", "console"] as const;
export type ReportSource = (typeof REPORT_SOURCES)[number];

export function isReportKind(v: unknown): v is ReportKind {
  return typeof v === "string" && (REPORT_KINDS as readonly string[]).includes(v);
}
export function isReportSource(v: unknown): v is ReportSource {
  return typeof v === "string" && (REPORT_SOURCES as readonly string[]).includes(v);
}

/** Which kinds a surface offers. A support question is website-only: the
 *  Console is for people already set up, whose "question" is a bug or a
 *  wish. */
export function kindsFor(source: ReportSource): readonly ReportKind[] {
  return source === "console" ? ["bug", "feature"] : REPORT_KINDS;
}

/** The word the subject line uses for each kind. */
export const KIND_WORD: Record<ReportKind, string> = { support: "Question", bug: "Bug", feature: "Feature request" };

export const LIMITS = { subject: 120, message: { min: 20, max: 5000 }, name: 80, context: 4096, contextValue: 200 } as const;

/** What the Console attaches on its own. Version strings, a team name and
 *  a user agent — never a token, a config path, or a file list. */
export const CONTEXT_KEYS = ["app_version", "channel", "bootstrap_ok", "bootstrap_at", "team", "page", "user_agent"] as const;
export type ContextKey = (typeof CONTEXT_KEYS)[number];
export type ReportContext = Partial<Record<ContextKey, string>>;

export type Report = {
  kind: ReportKind;
  source: ReportSource;
  email: string;
  name: string | null;
  subject: string;
  message: string;
  context: ReportContext;
};

export type ReportInput = { kind: unknown; source: unknown; email: unknown; name?: unknown; subject?: unknown; message?: unknown; context?: unknown };
export type ReportValidation = { ok: true; report: Report } | { ok: false; field: "kind" | "email" | "subject" | "message"; message: string };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function validateReport(input: ReportInput): ReportValidation {
  // The source is a hidden field; a value that is not one of ours is a
  // tampered form, and the kinds it may pick from are unknown — refuse.
  if (!isReportSource(input.source)) return { ok: false, field: "kind", message: "Pick what this is about." };
  const source = input.source;
  if (!isReportKind(input.kind) || !kindsFor(source).includes(input.kind)) {
    return { ok: false, field: "kind", message: "Pick what this is about." };
  }
  const email = normaliseEmail(input.email);
  if (!email) return { ok: false, field: "email", message: "That doesn't look like an email address." };
  const subject = str(input.subject);
  if (!subject) return { ok: false, field: "subject", message: "Give it a subject." };
  if (subject.length > LIMITS.subject) return { ok: false, field: "subject", message: `Keep the subject under ${LIMITS.subject} characters.` };
  const message = str(input.message);
  if (message.length < LIMITS.message.min) return { ok: false, field: "message", message: "Tell us a little more — a sentence or two." };
  if (message.length > LIMITS.message.max) return { ok: false, field: "message", message: `That's over ${LIMITS.message.max} characters. Trim it, or split it into two reports.` };
  const nameRaw = str(input.name);
  const name = nameRaw ? nameRaw.slice(0, LIMITS.name) : null;
  return { ok: true, report: { kind: input.kind, source, email, name, subject, message, context: trimContext(input.context) } };
}

/** The hidden field bots fill and people never see. */
export function isHoneypotHit(formData: FormData): boolean {
  const v = formData.get("website");
  return typeof v === "string" && v.trim().length > 0;
}

/** UTF-8 byte length. `.length` on a string counts UTF-16 code units, which
 *  undercounts anything outside the ASCII range — this module is bundled
 *  for the browser by client components, so `Buffer` cannot be used here;
 *  `TextEncoder` is the portable way to measure what actually gets stored. */
function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Keep the allowed keys only, every value a string cut to 200 chars; a
 *  JSON string is parsed first. Garbage → {}. If the result would still
 *  exceed the cap, the whole blob is dropped rather than truncated
 *  mid-JSON. */
export function trimContext(raw: unknown): ReportContext {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw); } catch { return {}; }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  const out: ReportContext = {};
  for (const k of CONTEXT_KEYS) {
    const v = (obj as Record<string, unknown>)[k];
    if (v === undefined || v === null || v === "") continue;
    const s = typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "";
    if (s) out[k] = s.slice(0, LIMITS.contextValue);
  }
  return byteLength(JSON.stringify(out)) > LIMITS.context ? {} : out;
}

export function refLabel(ref: number | string): string {
  return `DB-${ref}`;
}
export function subjectFor(kind: ReportKind, ref: number | string, subject: string): string {
  return `[${refLabel(ref)}] ${KIND_WORD[kind]}: ${subject}`;
}
export function ackSubject(ref: number | string): string {
  return `[${refLabel(ref)}] We got your report`;
}

/** Plain text for the operator: what they said, who they are, what the
 *  surface attached. */
export function bodyForOps(report: Report, ref: number | string): string {
  const who = report.name ? `${report.name} <${report.email}>` : report.email;
  const ctx = Object.entries(report.context).map(([k, v]) => `${k}: ${v}`);
  return [
    `${refLabel(ref)} · ${KIND_WORD[report.kind]} · from ${who}`,
    "",
    report.message,
    "",
    "—",
    `source: ${report.source}`,
    ...ctx,
  ].join("\n");
}

/** Plain text for the submitter: thanks, the reference, their words, and
 *  that replying to this email reaches a person. No context block — it is
 *  theirs already, and the point of the note is brevity. */
export function bodyForAck(report: Report, ref: number | string): string {
  return [
    `Thanks — we got your ${KIND_WORD[report.kind].toLowerCase()}. Your reference is ${refLabel(ref)}.`,
    "",
    "You wrote:",
    "",
    report.message.split("\n").map((l) => `> ${l}`).join("\n"),
    "",
    "A person reads every one of these. If you have more to add, reply to this email and it lands in the same thread.",
    "",
    "— DevBrain",
  ].join("\n");
}
