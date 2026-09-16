# Support, Bug Reports and Feature Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People can ask a question, report a bug, or request a feature from the website (all three) or the Console (bug and feature), every submission is stored and emailed to team@getdevbrain.com with reply-to set to the submitter, and the submitter gets a reference number and a confirmation email.

**Architecture:** One `reports` table, one pure module (`src/lib/reports.ts`) for validation and mail copy, one mail module on the Resend SDK (`src/lib/support-mail.ts`), one server action (`submitReport`) shared by two client forms. A failed send never fails the submission: the row is stamped and an ops alert fires through the existing `alert()`.

**Tech Stack:** Next.js 15 App Router (server actions, `useActionState`), React 19, Supabase (service role), Resend Node SDK via the Vercel Marketplace integration `resend/resend-email`, vitest.

**Spec:** `docs/superpowers/specs/2026-09-15-support-reports-design.md`

## Global Constraints

- Work in `~/Downloads/devbrain-product` on branch `feat/support-reports`. **The shell cwd resets to `~/Downloads/devbrain` (a frozen, unrelated repo) after every command. Prefix every command with `cd ~/Downloads/devbrain-product &&`.** Never edit `~/Downloads/devbrain`.
- Kinds: `support`, `bug`, `feature`. Sources: `web`, `console`. The Console never offers `support`.
- Caps: subject ≤ 120 chars, message 20–5000 chars, name ≤ 80 chars, context ≤ 4096 bytes serialised, context string values ≤ 200 chars.
- Reference label format: `DB-<ref>` (e.g. `DB-1042`). Ops subject: `[DB-1042] Bug: <subject>` with kind words `Question` / `Bug` / `Feature request`. Ack subject: `[DB-1042] We got your report`.
- Mail from: `DevBrain <team@getdevbrain.com>` (built from `LEGAL.contact`; never hard-code the address twice). Ops email reply-to = submitter; ack email reply-to = `LEGAL.contact`.
- Send budget: 5 s. Mail failure ⇒ row `mail_status = failed`, ops alert key `support_mail`. Mail success ⇒ `resolve("ops", "support_mail")`.
- Honeypot field name: `website`. Rate-limit bucket name: `report`.
- Context keys allowed: `app_version`, `channel`, `bootstrap_ok`, `bootstrap_at`, `team`, `page`, `user_agent`. Never a token, config path, or file list.
- Tests: `npx vitest run` must stay green; `npm run typecheck` and `npm run build` must pass before the branch is done.
- Commit trailer on every commit:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH
  ```
- Never echo secret values. Never sign in to anything for Luke.

---

## File Structure

| file | responsibility |
|---|---|
| `supabase/migrations/0043_reports.sql` | the `reports` table |
| `src/lib/reports.ts` | pure: kinds, caps, validation, honeypot, context trimming, ref/subject/body formatting |
| `src/lib/support-mail.ts` | Resend wrapper: `sendReportMail`, never throws |
| `src/app/support/actions.ts` | server action `submitReport` (both surfaces) |
| `src/app/support/page.tsx` | website page shell |
| `src/app/support/support-form.tsx` | website client form (three kinds, honeypot) |
| `src/app/desk/help/page.tsx` | Console page shell (auth, org) |
| `src/app/desk/help/help-forms.tsx` | Console client forms (bug + feature, bridge context) |
| `src/app/desk/sections.ts` | + `help` entry |
| `src/app/landing/landing.tsx` | + footer Support link |
| `src/app/faq/page.tsx` | + pointer to `/support` |
| `src/app/sitemap.ts` | + `/support` |
| `src/lib/legal.ts`, `src/content/legal/privacy.md` | email provider + support-request disclosure |
| `src/lib/env.ts`, `.env.example` | `RESEND_API_KEY` registered as recommended |
| tests | `src/lib/__tests__/reports.test.ts`, `support-mail.test.ts`, `submit-report.test.ts`, `support-forms.test.tsx`; edits to `site-meta.test.ts`, `legal-doc.test.ts`, `env.test.ts` |

---

### Task 1: The `reports` table and the pure module

**Files:**
- Create: `supabase/migrations/0043_reports.sql`
- Create: `src/lib/reports.ts`
- Test: `src/lib/__tests__/reports.test.ts`

**Interfaces:**
- Consumes: `normaliseEmail(raw: unknown): string | null` from `@/lib/leads`.
- Produces (all later tasks depend on these exact names):
  - `REPORT_KINDS`, `type ReportKind = "support" | "bug" | "feature"`, `isReportKind(v): v is ReportKind`
  - `REPORT_SOURCES`, `type ReportSource = "web" | "console"`, `isReportSource(v): v is ReportSource`
  - `kindsFor(source: ReportSource): readonly ReportKind[]`
  - `KIND_WORD: Record<ReportKind, string>`
  - `LIMITS`
  - `CONTEXT_KEYS`, `type ReportContext = Partial<Record<(typeof CONTEXT_KEYS)[number], string>>`
  - `type Report = { kind; source; email; name: string | null; subject; message; context: ReportContext }`
  - `validateReport(input: ReportInput): { ok: true; report: Report } | { ok: false; field: "kind" | "email" | "subject" | "message"; message: string }`
  - `isHoneypotHit(formData: FormData): boolean`
  - `trimContext(raw: unknown): ReportContext`
  - `refLabel(ref: number | string): string`
  - `subjectFor(kind: ReportKind, ref: number | string, subject: string): string`
  - `ackSubject(ref: number | string): string`
  - `bodyForOps(report: Report, ref: number | string): string`
  - `bodyForAck(report: Report, ref: number | string): string`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0043_reports.sql
-- Support questions, bug reports and feature requests, from the website
-- (/support, all three kinds) and the Console (/desk/help, bug + feature).
-- Every submission is a row whether or not the email went out: the inbox is
-- the queue, the table is the record. `ref` is the number people see
-- ("DB-1042"). `context` is what the Console attaches on its own (app
-- version, channel, team name, last setup result) — never a token or a
-- path. Service role only, like leads.
create table if not exists reports (
  id          uuid primary key default gen_random_uuid(),
  ref         bigint generated always as identity,
  kind        text not null check (kind in ('support', 'bug', 'feature')),
  source      text not null check (source in ('web', 'console')),
  email       text not null,
  name        text,
  subject     text not null,
  message     text not null,
  user_id     uuid references auth.users (id) on delete set null,
  org_id      uuid references orgs (id) on delete set null,
  context     jsonb not null default '{}'::jsonb,
  mail_status text not null default 'pending' check (mail_status in ('pending', 'sent', 'failed')),
  mail_error  text,
  created_at  timestamptz not null default now()
);

create unique index if not exists reports_ref_key on reports (ref);
create index if not exists reports_created_idx on reports (created_at desc);

alter table reports enable row level security;  -- service role only, no policies
```

- [ ] **Step 2: Write the failing tests**

```ts
// src/lib/__tests__/reports.test.ts
import { describe, expect, it } from "vitest";
import {
  ackSubject, bodyForAck, bodyForOps, CONTEXT_KEYS, isHoneypotHit, isReportKind, isReportSource, kindsFor, LIMITS,
  refLabel, subjectFor, trimContext, validateReport, type Report,
} from "@/lib/reports";

const good = { kind: "bug", source: "web", email: "Luke@Example.com ", name: " Luke ", subject: " Panel is blank ", message: "After the update the panel shows nothing at all, even after a reload." };

describe("kinds and sources", () => {
  it("knows the three kinds and two sources", () => {
    expect(isReportKind("support") && isReportKind("bug") && isReportKind("feature")).toBe(true);
    expect(isReportKind("ticket")).toBe(false);
    expect(isReportSource("web") && isReportSource("console")).toBe(true);
    expect(isReportSource("panel")).toBe(false);
  });
  it("offers all three on the web and no support question in the Console", () => {
    expect(kindsFor("web")).toEqual(["support", "bug", "feature"]);
    expect(kindsFor("console")).toEqual(["bug", "feature"]);
  });
});

describe("validateReport", () => {
  it("accepts a good report, trimmed and normalised", () => {
    const v = validateReport(good);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.report).toEqual({ kind: "bug", source: "web", email: "luke@example.com", name: "Luke", subject: "Panel is blank", message: good.message, context: {} });
  });
  it("names the field that is wrong", () => {
    expect(validateReport({ ...good, kind: "ticket" })).toMatchObject({ ok: false, field: "kind" });
    expect(validateReport({ ...good, kind: "support", source: "console" })).toMatchObject({ ok: false, field: "kind" });
    expect(validateReport({ ...good, email: "luke" })).toMatchObject({ ok: false, field: "email" });
    expect(validateReport({ ...good, subject: "  " })).toMatchObject({ ok: false, field: "subject" });
    expect(validateReport({ ...good, subject: "x".repeat(LIMITS.subject + 1) })).toMatchObject({ ok: false, field: "subject" });
    expect(validateReport({ ...good, message: "too short" })).toMatchObject({ ok: false, field: "message" });
    expect(validateReport({ ...good, message: "x".repeat(LIMITS.message.max + 1) })).toMatchObject({ ok: false, field: "message" });
  });
  it("treats an unknown source as web-only kinds being wrong, not a crash", () => {
    expect(validateReport({ ...good, source: "panel" })).toMatchObject({ ok: false, field: "kind" });
  });
  it("drops a blank name and cuts a long one", () => {
    const a = validateReport({ ...good, name: "   " });
    expect(a.ok && a.report.name).toBeNull();
    const b = validateReport({ ...good, name: "n".repeat(200) });
    expect(b.ok && b.report.name?.length).toBe(LIMITS.name);
  });
  it("carries context through trimContext", () => {
    const v = validateReport({ ...good, context: JSON.stringify({ app_version: "0.4.12", token: "dbk_secret" }) });
    expect(v.ok && v.report.context).toEqual({ app_version: "0.4.12" });
  });
});

describe("isHoneypotHit", () => {
  it("is true only when the hidden field has text", () => {
    const fd = new FormData();
    expect(isHoneypotHit(fd)).toBe(false);
    fd.set("website", "");
    expect(isHoneypotHit(fd)).toBe(false);
    fd.set("website", "http://spam.example");
    expect(isHoneypotHit(fd)).toBe(true);
  });
});

describe("trimContext", () => {
  it("keeps only the allowed keys, as strings cut to 200 chars", () => {
    const out = trimContext({ app_version: "0.4.12", bootstrap_ok: true, page: "/desk/help", token: "no", user_agent: "u".repeat(500) });
    expect(Object.keys(out).every((k) => (CONTEXT_KEYS as readonly string[]).includes(k))).toBe(true);
    expect(out).toMatchObject({ app_version: "0.4.12", bootstrap_ok: "true", page: "/desk/help" });
    expect(out.user_agent?.length).toBe(200);
    expect("token" in out).toBe(false);
  });
  it("accepts a JSON string and returns {} for garbage or nothing", () => {
    expect(trimContext('{"channel":"stable"}')).toEqual({ channel: "stable" });
    expect(trimContext("{not json")).toEqual({});
    expect(trimContext(null)).toEqual({});
    expect(trimContext(42)).toEqual({});
  });
  it("the largest blob the keys allow still fits the cap", () => {
    // 7 keys × 200 chars is well under 4 KB, so the size guard in
    // trimContext is belt-and-braces; this pins that the caps agree.
    const big = Object.fromEntries(CONTEXT_KEYS.map((k) => [k, "x".repeat(500)]));
    const out = trimContext(big);
    expect(Object.keys(out)).toHaveLength(CONTEXT_KEYS.length);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(LIMITS.context);
  });
});

describe("mail copy", () => {
  const report: Report = { kind: "feature", source: "console", email: "luke@example.com", name: null, subject: "Dark mode for the panel", message: "The panel is bright at night and the Console already has a theme.", context: { app_version: "0.4.12", team: "Northwind" } };
  it("formats the reference and the subjects", () => {
    expect(refLabel(1042)).toBe("DB-1042");
    expect(subjectFor("support", 7, "Where are tokens?")).toBe("[DB-7] Question: Where are tokens?");
    expect(subjectFor("bug", 1042, "Panel is blank")).toBe("[DB-1042] Bug: Panel is blank");
    expect(subjectFor("feature", 3, "Dark mode")).toBe("[DB-3] Feature request: Dark mode");
    expect(ackSubject(1042)).toBe("[DB-1042] We got your report");
  });
  it("the ops body carries the message, who sent it, and the context block", () => {
    const b = bodyForOps(report, 1042);
    expect(b).toContain("DB-1042");
    expect(b).toContain("Feature request");
    expect(b).toContain("luke@example.com");
    expect(b).toContain(report.message);
    expect(b).toContain("app_version: 0.4.12");
    expect(b).toContain("team: Northwind");
    expect(b).toContain("source: console");
  });
  it("the ack body thanks them, quotes the message, and says how replies work", () => {
    const b = bodyForAck(report, 1042);
    expect(b).toContain("DB-1042");
    expect(b).toContain(report.message);
    expect(b).toMatch(/reply to this email/i);
    expect(b).not.toContain("app_version");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/reports.test.ts`
Expected: FAIL — cannot resolve `@/lib/reports`.

- [ ] **Step 4: Write the module**

```ts
// src/lib/reports.ts
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
  const source: ReportSource = isReportSource(input.source) ? input.source : "web";
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
  return JSON.stringify(out).length > LIMITS.context ? {} : out;
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/reports.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 6: Apply the migration to the project database**

Run: `cd ~/Downloads/devbrain-product && npx supabase db push` (or apply through the Supabase MCP `apply_migration` with name `0043_reports`, project `guuzgqzljrnfqzrprgrp`, the same way `0042_onboarding` was applied).
Expected: `reports` exists. Verify: `select count(*) from reports;` returns 0.

- [ ] **Step 7: Commit**

```bash
cd ~/Downloads/devbrain-product && git add supabase/migrations/0043_reports.sql src/lib/reports.ts src/lib/__tests__/reports.test.ts && git commit -F - <<'EOF'
Reports: the table and the pure module (kinds, caps, copy)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH
EOF
```

---

### Task 2: Provision Resend and register the key

**Files:**
- Modify: `src/lib/env.ts:23` (`RECOMMENDED_ENV`)
- Modify: `.env.example` (append a section after the Stripe block)
- Test: `src/lib/__tests__/env.test.ts`
- Modify: `package.json` (the `resend` dependency)

**Interfaces:**
- Produces: `process.env.RESEND_API_KEY` in the Vercel project (production + preview) and in Luke's `.env.local`; the `resend` package installed.

This task has a browser step only Luke can do. Do the CLI parts, then STOP and hand over.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/__tests__/env.test.ts`, inside the existing `describe`:

```ts
  it("treats the support mail key as recommended, not required", () => {
    expect(RECOMMENDED_ENV).toContain("RESEND_API_KEY");
    expect(REQUIRED_ENV).not.toContain("RESEND_API_KEY");
    const m = missingEnv({ ...full, RESEND_API_KEY: "" });
    expect(m.required).toEqual([]);
    expect(m.recommended).toEqual(["RESEND_API_KEY"]);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/env.test.ts`
Expected: FAIL — `RECOMMENDED_ENV` does not contain `RESEND_API_KEY`.

- [ ] **Step 3: Register the variable**

In `src/lib/env.ts` replace line 23:

```ts
/** Variables whose absence degrades a feature rather than breaking one. */
export const RECOMMENDED_ENV = ["ANTHROPIC_API_KEY", "RESEND_API_KEY"] as const;
```

Append to `.env.example` after the `STRIPE_WEBHOOK_SECRET=` line:

```
# --- Support mail (Resend) --------------------------------------------------
# /support and /desk/help email every report to team@getdevbrain.com and a
# copy to the submitter. Provisioned by the Vercel Marketplace integration
# (`vercel integration add resend/resend-email`); the sending domain
# getdevbrain.com must be verified in the Resend dashboard. Without the key
# reports are still stored and an ops alert says mail is not going out.
RESEND_API_KEY=
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/env.test.ts`
Expected: PASS.

- [ ] **Step 5: Install the SDK and provision the integration**

Run:
```bash
cd ~/Downloads/devbrain-product && npm install resend
cd ~/Downloads/devbrain-product && vercel integration add resend/resend-email
```
The project is already linked (`.vercel/project.json` → `devbrain`, team `dev-brain1`). The `add` command may open a browser or print a URL for the account/claim step. Do not try to complete it. Note the exact output.

- [ ] **Step 6: STOP — hand the browser steps to Luke**

Tell Luke, in these words or close to them:

> Resend is provisioned as far as the CLI goes. Three things on your side: (1) finish the integration in the browser if the CLI opened one; (2) in the Resend dashboard, add the domain `getdevbrain.com` and put the DNS records it shows (DKIM, and the return-path CNAME) into your DNS host, then wait for it to show Verified; (3) run `vercel env ls` to confirm `RESEND_API_KEY` is present for Production and Preview, and copy its value into `~/Downloads/devbrain-product/.env.local` for local testing. Say "done" and I'll carry on.

Do not continue to Task 3 until Luke says so. (Task 3's tests mock the SDK and do not need the key, so if Luke prefers, Tasks 3–7 can be built before verification and only the live gate waits.)

- [ ] **Step 7: Commit**

```bash
cd ~/Downloads/devbrain-product && git add src/lib/env.ts src/lib/__tests__/env.test.ts .env.example package.json package-lock.json && git commit -F - <<'EOF'
Support mail: Resend SDK and RESEND_API_KEY registered as a recommended variable

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH
EOF
```

---

### Task 3: The mail module

**Files:**
- Create: `src/lib/support-mail.ts`
- Test: `src/lib/__tests__/support-mail.test.ts`

**Interfaces:**
- Consumes: `Report`, `subjectFor`, `ackSubject`, `bodyForOps`, `bodyForAck` from `@/lib/reports`; `LEGAL.contact` from `@/lib/legal`; `Resend` from `resend` (`new Resend(key).emails.send({ from, to, replyTo, subject, text })` → `{ data: { id } | null, error: { message, name } | null }`).
- Produces: `SUPPORT_FROM: string`; `type MailResult = { status: "sent" } | { status: "failed"; error: string }`; `sendReportMail(report: Report, ref: number): Promise<MailResult>` — never throws.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/support-mail.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Report } from "@/lib/reports";

// The Resend client is a spy: these tests pin what we SEND (two mails, who
// they go to, who a reply reaches) and that a provider failure becomes a
// value, never a throw. No network.
type SendResult = { data: { id: string } | null; error: { message: string; name: string } | null };
const send = vi.fn(async (_args: Record<string, unknown>): Promise<SendResult> => ({ data: { id: "m_1" }, error: null }));
vi.mock("resend", () => ({ Resend: class { emails = { send }; constructor(public key: string) {} } }));

const { sendReportMail, SUPPORT_FROM } = await import("@/lib/support-mail");

const report: Report = { kind: "bug", source: "console", email: "nova@example.com", name: "Nova", subject: "Panel is blank", message: "After the update the panel shows nothing at all, even after a reload.", context: { app_version: "0.4.12", team: "Northwind" } };

describe("sendReportMail", () => {
  beforeEach(() => { send.mockClear(); send.mockResolvedValue({ data: { id: "m_1" }, error: null }); process.env.RESEND_API_KEY = "re_test"; });

  it("sends the operator copy (reply-to the submitter) and the ack (reply-to us)", async () => {
    expect(await sendReportMail(report, 1042)).toEqual({ status: "sent" });
    expect(send).toHaveBeenCalledTimes(2);
    const calls = send.mock.calls.map((c) => c[0]);
    const ops = calls.find((c) => c.subject === "[DB-1042] Bug: Panel is blank")!;
    const ack = calls.find((c) => c.subject === "[DB-1042] We got your report")!;
    expect(ops).toMatchObject({ from: SUPPORT_FROM, to: ["team@getdevbrain.com"], replyTo: "nova@example.com" });
    expect(String(ops.text)).toContain("app_version: 0.4.12");
    expect(ack).toMatchObject({ from: SUPPORT_FROM, to: ["nova@example.com"], replyTo: "team@getdevbrain.com" });
    expect(String(ack.text)).toContain("DB-1042");
    expect(SUPPORT_FROM).toBe("DevBrain <team@getdevbrain.com>");
  });

  it("a provider error on either mail is a failed result with the message", async () => {
    send.mockResolvedValueOnce({ data: null, error: { message: "Domain not verified", name: "validation_error" } });
    expect(await sendReportMail(report, 1)).toEqual({ status: "failed", error: "Domain not verified" });
  });

  it("a thrown send is a failed result, not an exception", async () => {
    send.mockRejectedValueOnce(new Error("ECONNRESET"));
    expect(await sendReportMail(report, 2)).toEqual({ status: "failed", error: "ECONNRESET" });
  });

  it("no key means failed with a clear reason and no send attempted", async () => {
    delete process.env.RESEND_API_KEY;
    expect(await sendReportMail(report, 3)).toEqual({ status: "failed", error: "RESEND_API_KEY unset" });
    expect(send).not.toHaveBeenCalled();
  });

  it("a send that never resolves times out into failed", async () => {
    vi.useFakeTimers();
    send.mockReturnValueOnce(new Promise<SendResult>(() => {}));
    const p = sendReportMail(report, 4);
    await vi.advanceTimersByTimeAsync(5001);
    expect(await p).toEqual({ status: "failed", error: "send timed out" });
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/support-mail.test.ts`
Expected: FAIL — cannot resolve `@/lib/support-mail`.

- [ ] **Step 3: Write the module**

```ts
// src/lib/support-mail.ts
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
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/support-mail.test.ts`
Expected: PASS, 5 tests. If the `resend` package's `send` signature rejects the object literal under `npm run typecheck`, keep the object as written and cast the call: `resend.emails.send(m as Parameters<typeof resend.emails.send>[0])`.

- [ ] **Step 5: Commit**

```bash
cd ~/Downloads/devbrain-product && git add src/lib/support-mail.ts src/lib/__tests__/support-mail.test.ts && git commit -F - <<'EOF'
Support mail: two messages per report on Resend, failures as values

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH
EOF
```

---

### Task 4: The server action

**Files:**
- Create: `src/app/support/actions.ts`
- Test: `src/lib/__tests__/submit-report.test.ts`

**Interfaces:**
- Consumes: `publicLimit(ip, what)` from `@/lib/api-guard` (truthy = over limit); `alert(input)`, `resolve(scope, key)` from `@/lib/alerts`; `currentUser()` (→ `{ id, email }` or null) and `supabaseAdmin()` from `@/lib/supabase/server`; `currentOrg()` (→ `{ orgId, orgName, … }` or null) from `@/lib/org`; Task 1's `validateReport`, `isHoneypotHit`, `refLabel`; Task 3's `sendReportMail`.
- Produces: `type ReportState = { ok: true; ref: string } | { ok: false; message: string } | null`; `submitReport(prev: ReportState, formData: FormData): Promise<ReportState>`. Form field names it reads: `kind`, `source`, `email`, `name`, `subject`, `message`, `context` (JSON string), `website` (honeypot).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/submit-report.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// submitReport with every neighbour stubbed: it must drop bots and floods
// silently, name a bad field, store before mailing, and turn a mail failure
// into a row stamp + ops alert while the person still gets a reference.
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }) }));
const publicLimit = vi.fn(async (_ip: string, _what: string): Promise<unknown> => null);
vi.mock("@/lib/api-guard", () => ({ publicLimit: (ip: string, what: string) => publicLimit(ip, what) }));
const alert = vi.fn(async () => {});
const resolve = vi.fn(async () => {});
vi.mock("@/lib/alerts", () => ({ alert: (i: unknown) => alert(i as never), resolve: (s: unknown, k: string) => resolve(s as never, k as never) }));
const sendReportMail = vi.fn(async () => ({ status: "sent" as const }));
vi.mock("@/lib/support-mail", () => ({ sendReportMail: (r: unknown, ref: number) => sendReportMail(r as never, ref as never) }));
const currentUser = vi.fn(async () => null as null | { id: string; email: string | null });
const inserted: Record<string, unknown>[] = [];
const updated: { patch: Record<string, unknown>; ref: number }[] = [];
let insertError: null | { code: string } = null;
vi.mock("@/lib/supabase/server", () => ({
  currentUser: () => currentUser(),
  supabaseAdmin: () => ({
    from: (t: string) => ({
      insert: (row: Record<string, unknown>) => ({ select: () => ({ single: async () => { inserted.push({ table: t, ...row }); return insertError ? { data: null, error: insertError } : { data: { ref: 1042 }, error: null }; } }) }),
      update: (patch: Record<string, unknown>) => ({ eq: async (_c: string, ref: number) => { updated.push({ patch, ref }); return { error: null }; } }),
    }),
  }),
}));
const currentOrg = vi.fn(async () => null as null | { orgId: string; orgName: string });
vi.mock("@/lib/org", () => ({ currentOrg: () => currentOrg() }));

const { submitReport } = await import("@/app/support/actions");

const fd = (over: Record<string, string> = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ kind: "bug", source: "web", email: "nova@example.com", subject: "Panel is blank", message: "After the update the panel shows nothing at all, even after a reload.", ...over })) f.set(k, v);
  return f;
};

describe("submitReport", () => {
  beforeEach(() => { inserted.length = 0; updated.length = 0; insertError = null; publicLimit.mockResolvedValue(null); alert.mockClear(); resolve.mockClear(); sendReportMail.mockResolvedValue({ status: "sent" }); currentUser.mockResolvedValue(null); currentOrg.mockResolvedValue(null); });

  it("stores, mails, resolves the ops alert, and returns the reference", async () => {
    expect(await submitReport(null, fd())).toEqual({ ok: true, ref: "DB-1042" });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ table: "reports", kind: "bug", source: "web", email: "nova@example.com", user_id: null, org_id: null, mail_status: "pending" });
    expect(sendReportMail).toHaveBeenCalledWith(expect.objectContaining({ kind: "bug" }), 1042);
    expect(updated).toEqual([{ patch: { mail_status: "sent" }, ref: 1042 }]);
    expect(resolve).toHaveBeenCalledWith("ops", "support_mail");
    expect(alert).not.toHaveBeenCalled();
  });

  it("a filled honeypot or a flooding IP gets a thank-you with no reference and writes nothing", async () => {
    expect(await submitReport(null, fd({ website: "http://spam" }))).toEqual({ ok: true, ref: "" });
    publicLimit.mockResolvedValueOnce({ status: 429 });
    expect(await submitReport(null, fd())).toEqual({ ok: true, ref: "" });
    expect(inserted).toHaveLength(0);
    expect(sendReportMail).not.toHaveBeenCalled();
    expect(publicLimit).toHaveBeenCalledWith("203.0.113.9", "report");
  });

  it("names a bad field and writes nothing", async () => {
    expect(await submitReport(null, fd({ message: "short" }))).toMatchObject({ ok: false });
    expect(await submitReport(null, fd({ kind: "support", source: "console" }))).toMatchObject({ ok: false });
    expect(inserted).toHaveLength(0);
  });

  it("signed in: the account's email wins over the form, and the team is attached", async () => {
    currentUser.mockResolvedValue({ id: "u1", email: "luke@example.com" });
    currentOrg.mockResolvedValue({ orgId: "o1", orgName: "Northwind" });
    expect(await submitReport(null, fd({ email: "someone@else.com", source: "console", context: JSON.stringify({ app_version: "0.4.12" }) }))).toEqual({ ok: true, ref: "DB-1042" });
    expect(inserted[0]).toMatchObject({ email: "luke@example.com", user_id: "u1", org_id: "o1", context: { app_version: "0.4.12", team: "Northwind" } });
  });

  it("insert failure: an error, nothing mailed", async () => {
    insertError = { code: "XX000" };
    expect(await submitReport(null, fd())).toEqual({ ok: false, message: "Something went wrong saving that. Try again in a moment." });
    expect(sendReportMail).not.toHaveBeenCalled();
  });

  it("mail failure: row stamped failed, ops alert raised, person still gets the reference", async () => {
    sendReportMail.mockResolvedValueOnce({ status: "failed", error: "Domain not verified" } as never);
    expect(await submitReport(null, fd())).toEqual({ ok: true, ref: "DB-1042" });
    expect(updated).toEqual([{ patch: { mail_status: "failed", mail_error: "Domain not verified" }, ref: 1042 }]);
    expect(alert).toHaveBeenCalledWith(expect.objectContaining({ scope: "ops", key: "support_mail", title: "Support mail is not going out" }));
    expect(resolve).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/submit-report.test.ts`
Expected: FAIL — cannot resolve `@/app/support/actions`.

- [ ] **Step 3: Write the action**

```ts
// src/app/support/actions.ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/submit-report.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/Downloads/devbrain-product && git add src/app/support/actions.ts src/lib/__tests__/submit-report.test.ts && git commit -F - <<'EOF'
Reports: submitReport — store first, mail second, failures alert ops

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH
EOF
```

---

### Task 5: The website `/support` page

**Files:**
- Create: `src/app/support/page.tsx`
- Create: `src/app/support/support-form.tsx`
- Modify: `src/app/landing/landing.tsx:131-135` (footer links)
- Modify: `src/app/faq/page.tsx:34` (intro paragraph)
- Modify: `src/app/sitemap.ts:7` (`SITE_PAGES`)
- Test: `src/lib/__tests__/support-forms.test.tsx` (create), `src/lib/__tests__/site-meta.test.ts:10` (update)

**Interfaces:**
- Consumes: Task 4's `submitReport`, `ReportState`; Task 1's `kindsFor`, `ReportKind`; `currentUser` from `@/lib/supabase/server`; `BrowserShell`, `MotionGate`, `Mount`, `SiteHeader`, `SiteFooter`, `siteDisplay` as the FAQ page uses them.
- Produces: `SupportForm({ email }: { email: string | null })` (client component, exported for the test); route `/support`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/lib/__tests__/support-forms.test.tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SupportForm } from "@/app/support/support-form";

describe("SupportForm (website)", () => {
  it("offers all three kinds, a honeypot, and posts as web", () => {
    const html = renderToStaticMarkup(<SupportForm email={null} />);
    for (const k of ["support", "bug", "feature"]) expect(html).toContain(`value="${k}"`);
    expect(html).toContain("Ask a question");
    expect(html).toContain("Report a bug");
    expect(html).toContain("Request a feature");
    expect(html).toContain('name="website"');
    expect(html).toContain('name="source" value="web"');
    expect(html).toContain('name="email"');
    expect(html).not.toContain("readonly");
  });
  it("locks the email to the signed-in account", () => {
    const html = renderToStaticMarkup(<SupportForm email="luke@example.com" />);
    expect(html).toContain('value="luke@example.com"');
    expect(html).toMatch(/name="email"[^>]*readonly/);
  });
});
```

Update `src/lib/__tests__/site-meta.test.ts` line 10 to:

```ts
    expect(SITE_PAGES).toEqual(["/", "/faq", "/support", "/start", "/terms", "/privacy"]);
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/support-forms.test.tsx src/lib/__tests__/site-meta.test.ts`
Expected: FAIL — cannot resolve `@/app/support/support-form`; `SITE_PAGES` mismatch.

- [ ] **Step 3: Write the form**

```tsx
// src/app/support/support-form.tsx
"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { kindsFor, type ReportKind } from "@/lib/reports";
import { submitReport, type ReportState } from "./actions";

// The website's one support form: a question, a bug, or a feature request.
// The kind changes the hints, not the shape — one form, one action. Same
// accessibility rules as the landing page's email form: the error is a
// live region tied to its field, the success message takes focus.

const KIND_COPY: Record<ReportKind, { label: string; subject: string; message: string }> = {
  support: { label: "Ask a question", subject: "What do you need help with?", message: "What are you trying to do, and what happens instead?" },
  bug: { label: "Report a bug", subject: "What broke, in a few words", message: "What did you do, what did you expect, and what happened? Your editor and the app version help." },
  feature: { label: "Request a feature", subject: "What would you like DevBrain to do?", message: "What would it solve for you or your team?" },
};

const FIELD = "min-h-[46px] w-full rounded-lg border border-line2 bg-ink px-3.5 py-2.5 text-[13.5px] text-txt placeholder:text-faint focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-ink read-only:text-muted";
const LABEL = "mb-1.5 block font-mono text-[10.5px] uppercase tracking-[.1em] text-muted";

export function SupportForm({ email }: { email: string | null }) {
  const [state, action, pending] = useActionState<ReportState, FormData>(submitReport, null);
  const [kind, setKind] = useState<ReportKind>("support");
  const id = useId();
  const errorId = `${id}-error`;
  const doneRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (state?.ok) doneRef.current?.focus(); }, [state?.ok]);

  if (state?.ok) {
    return (
      <p ref={doneRef} tabIndex={-1} role="status" aria-live="polite" className="rounded-[10px] border border-[var(--wg-go-line)] bg-[var(--wg-go-bg)] px-4 py-3 text-[14px] leading-[1.6] text-go focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        {state.ref ? <>Thanks. Your reference is <b>{state.ref}</b>. We&apos;ve emailed a copy to you — reply to it if there&apos;s more to add.</> : <>Thanks.</>}
      </p>
    );
  }

  const copy = KIND_COPY[kind];
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="source" value="web" />
      {/* The honeypot: off-screen, out of the tab order, ignored by screen readers. People never fill it; bots do. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <fieldset>
        <legend className={LABEL}>What is this about?</legend>
        <div className="flex flex-wrap gap-2">
          {kindsFor("web").map((k) => (
            <label key={k} className={`cursor-pointer rounded-lg border px-3.5 py-2 text-[13px] font-semibold ${k === kind ? "border-accent bg-row2 text-txt" : "border-line2 text-muted hover:text-txt"}`}>
              <input type="radio" name="kind" value={k} checked={k === kind} onChange={() => setKind(k)} className="sr-only" />
              {KIND_COPY[k].label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-name`} className={LABEL}>Name (optional)</label>
          <input id={`${id}-name`} name="name" type="text" autoComplete="name" maxLength={80} className={FIELD} />
        </div>
        <div>
          <label htmlFor={`${id}-email`} className={LABEL}>Email</label>
          <input id={`${id}-email`} name="email" type="email" required autoComplete="email" placeholder="you@company.com" defaultValue={email ?? undefined} readOnly={Boolean(email)} className={FIELD} />
        </div>
      </div>

      <div>
        <label htmlFor={`${id}-subject`} className={LABEL}>Subject</label>
        <input id={`${id}-subject`} name="subject" type="text" required maxLength={120} placeholder={copy.subject} className={FIELD} />
      </div>

      <div>
        <label htmlFor={`${id}-message`} className={LABEL}>Message</label>
        <textarea id={`${id}-message`} name="message" required minLength={20} maxLength={5000} rows={7} placeholder={copy.message}
          aria-invalid={state && !state.ok ? true : undefined} aria-describedby={state && !state.ok ? errorId : undefined} className={`${FIELD} resize-y`} />
      </div>

      {state && !state.ok && <p id={errorId} role="alert" className="text-[13px] text-stop">{state.message}</p>}

      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className="min-h-[46px] rounded-lg bg-accent2 px-5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60">
          {pending ? "Sending…" : "Send"}
        </button>
        <span className="text-[12.5px] text-muted">Goes straight to the person who builds DevBrain. You get a copy.</span>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Write the page**

```tsx
// src/app/support/page.tsx
import type { Metadata } from "next";
import { BrowserShell } from "@/app/browser-shell";
import { siteDisplay } from "@/app/fonts";
import { SiteFooter, SiteHeader } from "@/app/landing/landing";
import { MotionGate, Mount } from "@/app/landing/reveal";
import { LEGAL } from "@/lib/legal";
import { currentUser } from "@/lib/supabase/server";
import { SupportForm } from "./support-form";

export const metadata: Metadata = { title: "Support", description: "Ask a question, report a bug, or request a feature. A person reads every one." };
export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const user = await currentUser();
  return (
    <BrowserShell>
      <main className={`lp ${siteDisplay.variable} min-h-screen pb-24`}>
        <MotionGate />
        <SiteHeader />
        <section className="mx-auto w-full max-w-[1140px] px-6 pt-14 sm:px-8 sm:pt-[70px]">
          <Mount as="h1" duration={700} y={24} className="max-w-[17ch] font-display text-[40px] font-semibold leading-[1.02] tracking-[-.03em] text-txt text-balance sm:text-[56px]">Ask, report, or request.</Mount>
          <Mount as="p" delay={150} className="mt-4 max-w-[58ch] text-[16.5px] leading-[1.6] text-body">
            Every message goes to the person who builds DevBrain, not a queue. You get a reference number and a copy by email; replies come from {LEGAL.contact}.
          </Mount>
          <Mount delay={250} className="mt-12 max-w-[680px]"><SupportForm email={user?.email ?? null} /></Mount>
        </section>
        <SiteFooter />
      </main>
    </BrowserShell>
  );
}
```

- [ ] **Step 5: Link it from the footer, the FAQ, and the sitemap**

In `src/app/landing/landing.tsx`, the footer's link row (currently FAQ / Privacy / Terms), insert after the FAQ link:

```tsx
          <Link href="/support" className="-my-2 py-2 hover:text-txt">Support</Link>
```

In `src/app/faq/page.tsx`, replace the intro `<Mount as="p" …>` paragraph's text with:

```tsx
          <Mount as="p" delay={150} className="mt-4 max-w-[58ch] text-[16.5px] leading-[1.6] text-body">Short answers, no marketing. If yours isn&apos;t here, the <Link href="/privacy" className="text-accenttext hover:underline">privacy page</Link> has the long version of most of them, and the repo is public. Anything else, <Link href="/support" className="text-accenttext hover:underline">ask us</Link>.</Mount>
```

In `src/app/sitemap.ts` line 7:

```ts
export const SITE_PAGES = ["/", "/faq", "/support", "/start", "/terms", "/privacy"] as const;
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/support-forms.test.tsx src/lib/__tests__/site-meta.test.ts src/lib/__tests__/site-copy.test.tsx`
Expected: PASS. (`site-copy` walks `src/app/faq`; the new link text is plain prose and should pass its checks. If it flags "ask us", read its assertion and adjust the wording, not the test.)

- [ ] **Step 7: Typecheck and look at it**

Run: `cd ~/Downloads/devbrain-product && npm run typecheck && npm run dev`
Open http://localhost:3000/support. Check: three kind chips switch the placeholders; the honeypot is invisible; submitting with a 5-character message shows the error; a real submission (with `RESEND_API_KEY` in `.env.local`, or without it to see the stored-but-unsent path) shows "Thanks. Your reference is DB-…". Stop the dev server.

- [ ] **Step 8: Commit**

```bash
cd ~/Downloads/devbrain-product && git add src/app/support src/app/landing/landing.tsx src/app/faq/page.tsx src/app/sitemap.ts src/lib/__tests__/support-forms.test.tsx src/lib/__tests__/site-meta.test.ts && git commit -F - <<'EOF'
Site: /support — a question, a bug, or a feature request, straight to the inbox

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH
EOF
```

---

### Task 6: Privacy disclosure

**Files:**
- Modify: `src/lib/legal.ts` (add `emailProvider`)
- Modify: `src/content/legal/privacy.md` (lines 15, 33; section 5 list; section 7 list)
- Test: `src/lib/__tests__/legal-doc.test.ts`

**Interfaces:**
- Consumes: `LEGAL`, `legalMarkdown(doc)` from `@/lib/legal-doc`.
- Produces: `LEGAL.emailProvider = "Resend"`; the `{{emailProvider}}` token available to the legal documents.

- [ ] **Step 1: Write the failing test**

In `src/lib/__tests__/legal-doc.test.ts`, add inside the first `describe`:

```ts
  it("the privacy policy discloses support requests and the email provider", () => {
    const privacy = legalMarkdown("privacy");
    expect(privacy).toContain("**Support requests.**");
    expect(privacy).toContain(`Email delivery: ${LEGAL.emailProvider}`);
    expect(privacy).not.toContain("we do not send email at all");
    expect(privacy).toContain("**Support requests:**");
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/legal-doc.test.ts`
Expected: FAIL — `emailProvider` is undefined / strings missing.

- [ ] **Step 3: Add the fact and the prose**

In `src/lib/legal.ts`, after the `database: "Supabase",` line add:

```ts
  emailProvider: "Resend",
```

In `src/content/legal/privacy.md`:

Line 15 — replace the sentence `We may use your email address to contact you about the Service; today we do not send email at all.` with:

```
We may use your email address to contact you about the Service; today the only email we send is the confirmation of, and our reply to, a support request you make (below).
```

After the paragraph that begins `**Email addresses you give us on the website.**` (line 33), add a new paragraph:

```
**Support requests.** If you ask a question, report a bug or request a feature on the website or in the app, we store what you wrote, your email address and name if you gave one, the date, and, from the app, the app version, update channel, team name and the outcome of the last setup run, so we can answer without asking for them. We email the request to ourselves and a confirmation to you through our email provider (section 5), and we use it only to answer you and to fix what you reported.
```

In section 5's provider list, after the `- **Hosting and infrastructure.**` bullet add:

```
- **Email delivery: {{emailProvider}}.** Sends the confirmation and our replies for support requests; receives your address, name if given, and the text of your request to do so.
```

In section 7's retention list, after the `- **Website email sign-ups:**` bullet add:

```
- **Support requests:** until answered and no longer needed to fix what you reported, or until you ask us to remove them.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/legal-doc.test.ts`
Expected: PASS (the existing "no placeholder" test confirms `{{emailProvider}}` resolved).

- [ ] **Step 5: Commit**

```bash
cd ~/Downloads/devbrain-product && git add src/lib/legal.ts src/content/legal/privacy.md src/lib/__tests__/legal-doc.test.ts && git commit -F - <<'EOF'
Privacy: support requests and the email provider are disclosed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH
EOF
```

---

### Task 7: The Console `/desk/help` page

**Files:**
- Create: `src/app/desk/help/page.tsx`
- Create: `src/app/desk/help/help-forms.tsx`
- Modify: `src/app/desk/sections.ts:26-30` (Settings group)
- Test: `src/lib/__tests__/support-forms.test.tsx` (extend)

**Interfaces:**
- Consumes: Task 4's `submitReport`, `ReportState`; Task 1's `kindsFor`, `trimContext`, `ReportKind`; `currentUser`, `currentOrg`, `redirect` as `src/app/desk/mac/page.tsx` uses them; `Reading` from `../panes`; the Tauri bridge commands `setup_state` (→ `{ app_version?, bootstrap_ok?, bootstrap_at? }`) and `mac_prefs` (→ `{ channel }`), read exactly as `mac-settings.tsx` reads them.
- Produces: `HelpForms()` (client component, exported for the test); route `/desk/help`; sidebar entry `help`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/support-forms.test.tsx`:

```tsx
import { HelpForms } from "@/app/desk/help/help-forms";
import { DESK_PAGES, DESK_SECTIONS } from "@/app/desk/sections";

describe("HelpForms (Console)", () => {
  it("is a bug form and a feature form, no support question, posting as console with the attach note", () => {
    const html = renderToStaticMarkup(<HelpForms />);
    expect(html.match(/<form/g)).toHaveLength(2);
    expect(html).toContain('name="kind" value="bug"');
    expect(html).toContain('name="kind" value="feature"');
    expect(html).not.toContain('value="support"');
    expect(html.match(/name="source" value="console"/g)).toHaveLength(2);
    expect(html).not.toContain('name="website"');
    expect(html).not.toContain('name="email"');
    expect(html).toContain("We attach your app version");
  });
  it("is reachable from the sidebar and the palette", () => {
    const settings = DESK_SECTIONS.find((g) => g.group === "Settings")!;
    expect(settings.items.map((i) => i.slug)).toEqual(["team", "mac", "help"]);
    expect(DESK_PAGES.find((p) => p.slug === "help")).toEqual({ slug: "help", label: "Help", group: "Settings" });
  });
});
```

(Move the two new `import` lines to the top of the file with the others.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/support-forms.test.tsx`
Expected: FAIL — cannot resolve `@/app/desk/help/help-forms`.

- [ ] **Step 3: Add the sidebar entry**

In `src/app/desk/sections.ts`, the Settings group becomes:

```ts
  {
    group: "Settings",
    items: [
      { slug: "team", label: "Team", also: ["rules", "members", "tokens", "plan", "reminders"] },
      { slug: "mac", label: "This Mac" },
      { slug: "help", label: "Help" },
    ],
  },
```

- [ ] **Step 4: Write the client forms**

```tsx
// src/app/desk/help/help-forms.tsx
"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { kindsFor, trimContext, type ReportKind } from "@/lib/reports";
import { submitReport, type ReportState } from "@/app/support/actions";

// ============================================================================
// Help (Dusk) — two forms, bug and feature request, side by side. The person
// is signed in, so no email field and no honeypot; the team is attached by
// the action. What the app knows about itself (version, channel, last setup
// result) is read from the bridge on mount and sent as `context`, so nobody
// has to type "0.4.12, stable" into a bug report. In a plain browser the
// bridge is absent and the context is just the page and the user agent.
// No DeskNext: submitReport returns state and never redirects.
// ============================================================================

type Core = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
const core = (): Core | null => (window as unknown as { __TAURI__?: { core?: Core } }).__TAURI__?.core ?? null;

const COPY: Record<Exclude<ReportKind, "support">, { title: string; sub: string; subject: string; message: string; button: string }> = {
  bug: { title: "Report a bug", sub: "Something broke, or does the wrong thing.", subject: "What broke, in a few words", message: "What did you do, what did you expect, and what happened?", button: "Send bug report" },
  feature: { title: "Request a feature", sub: "Something you wish DevBrain did.", subject: "What would you like it to do?", message: "What would it solve for you or your team?", button: "Send request" },
};

const ATTACH_NOTE = "We attach your app version, channel, team name and last setup result so you don't have to.";
const FIELD = "w-full rounded-lg border border-line2 bg-ink px-3 py-2 text-[13px] text-txt placeholder:text-faint focus:border-accent focus:outline-none";

function useBridgeContext(): string {
  const [ctx, setCtx] = useState("{}");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const base: Record<string, unknown> = { page: window.location.pathname, user_agent: navigator.userAgent };
      const c = core();
      if (c) {
        const [setup, prefs] = await Promise.all([
          c.invoke("setup_state").catch(() => ({})) as Promise<{ app_version?: string; bootstrap_ok?: boolean | null; bootstrap_at?: string | null }>,
          c.invoke("mac_prefs").catch(() => ({})) as Promise<{ channel?: string }>,
        ]);
        Object.assign(base, { app_version: setup.app_version, channel: prefs.channel, bootstrap_ok: setup.bootstrap_ok, bootstrap_at: setup.bootstrap_at });
      }
      if (!cancelled) setCtx(JSON.stringify(trimContext(base)));
    })();
    return () => { cancelled = true; };
  }, []);
  return ctx;
}

function ReportForm({ kind, context }: { kind: Exclude<ReportKind, "support">; context: string }) {
  const [state, action, pending] = useActionState<ReportState, FormData>(submitReport, null);
  const id = useId();
  const doneRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (state?.ok) doneRef.current?.focus(); }, [state?.ok]);
  const copy = COPY[kind];

  return (
    <section>
      <div className="flex items-baseline gap-2.5 border-b border-line pb-2.5">
        <h3 className="m-0 font-display text-[14px] font-semibold text-txt">{copy.title}</h3>
        <span className="ml-auto text-[11.5px] text-faint">{copy.sub}</span>
      </div>
      {state?.ok ? (
        <p ref={doneRef} tabIndex={-1} role="status" aria-live="polite" className="mt-4 rounded-lg border border-[var(--wg-go-line)] bg-[var(--wg-go-bg)] px-3 py-2.5 text-[13px] leading-[1.55] text-go focus:outline-none">
          {state.ref ? <>Thanks. Your reference is <b>{state.ref}</b>. A copy is in your email — reply to it if there&apos;s more to add.</> : <>Thanks.</>}
        </p>
      ) : (
        <form action={action} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="source" value="console" />
          <input type="hidden" name="context" value={context} />
          <label className="block">
            <span className="mb-1 block text-[12px] text-muted">Subject</span>
            <input id={`${id}-subject`} name="subject" type="text" required maxLength={120} placeholder={copy.subject} className={FIELD} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] text-muted">What happened</span>
            <textarea id={`${id}-message`} name="message" required minLength={20} maxLength={5000} rows={6} placeholder={copy.message} className={`${FIELD} resize-y`} />
          </label>
          {state && !state.ok && <p role="alert" className="text-[12.5px] text-stop">{state.message}</p>}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className="rounded-lg bg-accent2 px-3.5 py-2 font-display text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-60">{pending ? "Sending…" : copy.button}</button>
          </div>
          <p className="text-[11.5px] leading-[1.5] text-faint">{ATTACH_NOTE}</p>
        </form>
      )}
    </section>
  );
}

export function HelpForms() {
  const context = useBridgeContext();
  return (
    <div className="grid grid-cols-2 gap-9">
      {(kindsFor("console") as Exclude<ReportKind, "support">[]).map((k) => <ReportForm key={k} kind={k} context={context} />)}
    </div>
  );
}
```

- [ ] **Step 5: Write the page**

```tsx
// src/app/desk/help/page.tsx
import { redirect } from "next/navigation";
import { currentOrg } from "@/lib/org";
import { currentUser } from "@/lib/supabase/server";
import { LEGAL } from "@/lib/legal";
import { Reading } from "../panes";
import { HelpForms } from "./help-forms";

// ============================================================================
// Desk · Help (Dusk) — report a bug or request a feature from inside the
// app. Same gate as every Desk page: a person, in a team.
// ============================================================================

export const dynamic = "force-dynamic";

export default async function DeskHelp() {
  const user = await currentUser();
  if (!user) redirect("/?from=desk");
  const org = await currentOrg();
  if (!org) redirect("/welcome");
  return (
    <Reading className="mx-auto max-w-[980px]">
      <div className="mb-6">
        <h1 className="font-display text-[30px] font-bold leading-none tracking-[-.03em] text-txt">Help</h1>
        <p className="mt-2 text-[13px] text-muted">Goes straight to the person who builds DevBrain · you get a copy at {user.email ?? "your email"} · replies come from {LEGAL.contact}</p>
      </div>
      <HelpForms />
    </Reading>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/support-forms.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 7: Typecheck, full suite, build**

Run: `cd ~/Downloads/devbrain-product && npm run typecheck && npx vitest run && npm run build`
Expected: all green; build lists `/support` and `/desk/help`.

- [ ] **Step 8: Commit**

```bash
cd ~/Downloads/devbrain-product && git add src/app/desk/help src/app/desk/sections.ts src/lib/__tests__/support-forms.test.tsx && git commit -F - <<'EOF'
Console: Help — bug reports and feature requests with the app's own context attached

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH
EOF
```

---

### Task 8: Deploy and the live gate

**Files:** none new. This task is verification; record results in `docs/HANDOFF-2026-09-15.md` under a new "Support channel" heading (or the next handoff).

**Interfaces:**
- Consumes: everything above, deployed; `RESEND_API_KEY` present in Vercel Production; domain verified in Resend (Task 2 step 6).

- [ ] **Step 1: Confirm the preconditions**

Run: `cd ~/Downloads/devbrain-product && vercel env ls production 2>&1 | grep -c RESEND_API_KEY`
Expected: `1`. If `0`, stop and go back to Task 2 step 6.

- [ ] **Step 2: Merge and push (Luke pushes unless he says otherwise)**

```bash
cd ~/Downloads/devbrain-product && git checkout main && git merge --ff-only feat/support-reports && git log --oneline -1
```
Then ask Luke to push, or push if he has said to. Watch CI: `gh run list --branch main --limit 1`. Production commit: `gh api "repos/lukeb230/devbrain/deployments?environment=Production&per_page=1" --jq '.[0].sha[0:7]'` must match.

- [ ] **Step 3: Website, all three kinds**

On https://getdevbrain.com/support, signed out, submit one of each kind with a real address Luke controls. For each: the page shows `DB-<n>`; team@getdevbrain.com receives `[DB-<n>] <Kind>: <subject>` with reply-to = that address; the address receives `[DB-<n>] We got your report`. In Supabase: `select ref, kind, source, mail_status from reports order by ref desc limit 3;` → three rows, all `sent`.

- [ ] **Step 4: Console, one bug report**

On a VM (`cursor-mac` 192.168.64.8 or `codex-mac` 192.168.64.9, both on app 0.4.12) open the Console → Settings → Help, send a bug report. The ops email's context block must show `app_version`, `channel`, `team`, `source: console`. The row's `context` column holds the same.

- [ ] **Step 5: The failure path**

In Vercel, temporarily blank `RESEND_API_KEY` for Production (or ask Luke to), redeploy, submit one report from the site. Expected: the page still shows a reference; the row is `failed` with `mail_error = RESEND_API_KEY unset`; Luke's Mac shows the native notification "Support mail is not going out". Restore the key, redeploy, submit once more: row `sent`, and the alert recovers (a "recovered" notification). Delete the test rows afterwards if Luke wants a clean table: `delete from reports where email = '<the test address>';`

- [ ] **Step 6: Record and hand off**

Append the results (pass/fail per step, the reference numbers used) to the handoff doc and commit:

```bash
cd ~/Downloads/devbrain-product && git add docs/HANDOFF-2026-09-15.md && git commit -F - <<'EOF'
Docs: support channel live-gate results

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH
EOF
```
