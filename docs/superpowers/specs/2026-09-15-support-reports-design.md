# Support, bug reports and feature requests — design

Decided 2026-09-15 in a brainstorming session with Luke. Direction chosen:
best-of-breed tools per concern (this spec covers the support channel only;
error tracking and analytics get their own specs later).

## Goal

People using DevBrain can ask for help, report a bug, or request a feature,
and every submission lands in Luke's inbox at team@getdevbrain.com as a
thread he answers by hitting reply. The submitter gets a reference number
and a confirmation email so the exchange feels like a ticket without there
being a ticket UI.

## Non-goals

- No attachments (screenshots, files). Text only. Revisit if reports arrive
  without enough detail.
- No ticket list, status page, or in-product reply thread. The inbox is the
  queue.
- No feature-request voting or public roadmap.
- Nothing in the panel widget, the CLI, or the editor hooks.
- No CAPTCHA.

## Decisions

- **Three kinds:** `support` (a question), `bug`, `feature`.
- **Where:** the website gets all three at `/support`. The Console gets
  `bug` and `feature` at `/desk/help`. Support questions are website-only.
- **Delivery:** Resend, provisioned as a Vercel Marketplace integration
  (`resend/resend-email`). One env var, `RESEND_API_KEY`. Sending domain
  `getdevbrain.com`, verified once by Luke in the Resend dashboard.
- **Two emails per submission:** one to team@ (reply-to the submitter), one
  acknowledgement to the submitter (reply-to team@).
- **Every submission is a database row** whether or not mail goes out.
- **Text only, no uploads.**

## What already exists

- `src/app/lead-actions.ts` + `src/app/landing/email-form.tsx`: the public
  form pattern (server action, `useActionState`, `publicLimit` per IP,
  forgiving responses). `/support` follows it.
- `src/lib/alerts.ts`: `alert()` / `resolve()` write `alert_log` rows that
  the Mac app turns into native notifications for the operator. A failed
  send raises an ops alert through it.
- `src/app/desk/sections.ts`: the sidebar's one list; the ⌘K palette reads
  it too. A new entry there is the whole Console navigation change.
- `src/app/desk/mac/mac-settings.tsx`: the pattern for reading
  `setup_state` from the Tauri bridge on mount.
- `src/lib/legal.ts`: `contact: "team@getdevbrain.com"`, the address the
  privacy and terms pages already show.
- The app has never sent outbound email; Supabase auth sends its own.

## Architecture

### Data: table `reports`

Migration `supabase/migrations/0043_reports.sql`. Service-role only, RLS on
with no policies, like `leads`.

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `ref` | bigint generated always as identity | shown as `DB-<ref>` |
| `kind` | text check in (`support`,`bug`,`feature`) | |
| `source` | text check in (`web`,`console`) | which surface |
| `email` | text not null | normalised lower-case |
| `name` | text | optional, website only |
| `subject` | text not null | ≤ 120 chars |
| `message` | text not null | 20–5000 chars |
| `user_id` | uuid | null when signed out |
| `org_id` | uuid | null when signed out |
| `context` | jsonb not null default '{}' | see below, ≤ 4 KB |
| `mail_status` | text check in (`pending`,`sent`,`failed`) default `pending` | |
| `mail_error` | text | last send error, truncated |
| `created_at` | timestamptz default now() | |

Index on `created_at desc`. No unique constraints: the same person may
file two reports a minute apart.

`context` keys, all optional strings: `app_version`, `channel`,
`bootstrap_ok`, `bootstrap_at`, `team`, `page`, `user_agent`. Never a
token, a config path, or repo file lists.

### Pure module: `src/lib/reports.ts`

No I/O. Exports:

- `REPORT_KINDS`, `isReportKind(x)`, `kindsFor(source)` (`web` → all three,
  `console` → bug + feature).
- `LIMITS = { subject: 120, message: { min: 20, max: 5000 }, context: 4096 }`.
- `validateReport(input)` → `{ ok: true, report } | { ok: false, field, message }`.
  Trims, normalises the email (reuse `normaliseEmail` from `@/lib/leads`),
  enforces caps, rejects an unknown kind for the source.
- `isHoneypotHit(formData)`: the hidden field `website` is non-empty.
- `trimContext(obj)`: keeps only the allowed keys, strings cut to 200
  chars, drops the whole thing if serialised size exceeds 4 KB.
- `refLabel(ref)` → `DB-1042`.
- `subjectFor(kind, ref, subject)` → `[DB-1042] Bug: <subject>` with the
  kind word `Question` / `Bug` / `Feature request`.
- `ackSubject(ref)` → `[DB-1042] We got your report`.
- `bodyForOps(report)` and `bodyForAck(report)`: plain-text bodies (message,
  then a context block for ops; a short thank-you quoting the message for
  the submitter).

### Mail: `src/lib/support-mail.ts`

Wraps the Resend SDK. One export:

`sendReportMail(report)` → `Promise<{ status: "sent" } | { status: "failed"; error: string }>`.

- From: `DevBrain <team@getdevbrain.com>` (constant `SUPPORT_FROM`), to
  `LEGAL.contact`.
- Ops email: reply-to the submitter. Ack email: reply-to team@.
- Both sends run in parallel with a 5 s `AbortController` budget. Either
  failing means `failed` with the first error message, truncated to 200
  chars. Never throws.
- Client created lazily from `process.env.RESEND_API_KEY`; a missing key is
  a `failed` result with error `RESEND_API_KEY unset`, not a crash.

### Action: `src/app/support/actions.ts`

`submitReport(prev: ReportState, formData): Promise<ReportState>` where
`ReportState = { ok: true; ref: string } | { ok: false; message: string } | null`.

Order:

1. Honeypot hit → return `{ ok: true, ref: "" }` (the UI shows plain
   "Thanks" without a reference). Nothing written.
2. IP over `publicLimit(ip, "report")` → same as 1.
3. `validateReport` fails → `{ ok: false, message }` naming the field.
4. Resolve the signed-in user and org via `currentUser()` / `currentOrg()`
   if present; when signed in, the email is the account's, not the form's.
5. Insert the row (`mail_status: pending`). Insert error →
   `{ ok: false, message: "Something went wrong saving that. Try again in a moment." }`.
6. `sendReportMail`. On `sent`: update the row, `resolve("ops", "support_mail")`.
   On `failed`: update the row with the error, `alert({ scope: "ops", key: "support_mail", title: "Support mail is not going out", detail })`.
7. Return `{ ok: true, ref: refLabel(row.ref) }` either way. The person's
   report is saved; a mail problem is Luke's to see, not theirs.

### Website: `/support`

`src/app/support/page.tsx` (server, `force-dynamic`, site shell like the
FAQ) and `src/app/support/support-form.tsx` (client, `useActionState`).

- Kind picker: three segmented options, "Ask a question", "Report a bug",
  "Request a feature". Default `support`. Changes placeholder copy only.
- Fields: name (optional), email, subject, message. Hidden honeypot input
  named `website`, hidden `source=web`.
- Signed in: email prefilled and read-only; the page passes the account
  email down.
- Result: "Thanks. Your reference is DB-1042. We've emailed a copy to
  you." When `ref` is empty: "Thanks."
- Links: footer "Support" between FAQ and Privacy; last FAQ item gets a
  closing sentence pointing at `/support`; privacy page's data list gets
  one line for support submissions.

### Console: `/desk/help`

`src/app/desk/help/page.tsx` (server: requires user + org, redirects like
`/desk/mac`) and `src/app/desk/help/help-forms.tsx` (client).

- Two forms in the two-pane layout: "Report a bug" and "Request a feature".
  Each: subject, message, hidden `kind`, hidden `source=console`.
- On mount, ask the bridge for `setup_state` and `prefs` (as
  `mac-settings.tsx` does) and fill a hidden `context` field with
  `trimContext({...})`. Without the bridge, context has `page` and
  `user_agent` only.
- A one-line note under each form: "We attach your app version, channel,
  team name and last setup result so you don't have to."
- Sidebar: add `{ slug: "help", label: "Help" }` to the Settings group in
  `DESK_SECTIONS`. `DESK_PAGES` picks it up automatically.

## Abuse and limits

- `publicLimit(ip, "report")` on every submission, signed in or not.
- Honeypot on the website form only; signed-in Console submissions skip it.
- Minimum 20 characters of message.
- Caps enforced in `reports.ts` before insert so an email can never be
  oversized.

## Failure handling

| failure | what happens |
|---|---|
| Resend send fails / times out | row kept with `failed` + error; ops alert `support_mail`; submitter still sees reference |
| insert fails | error shown; nothing emailed |
| ack bounces (typo in address) | nothing; the ops copy shows the bad reply-to |
| bridge missing on `/desk/help` | form works; context lacks app fields |
| `RESEND_API_KEY` unset | treated as a failed send (ops alert) |

## Privacy

The context blob holds version strings, a team name and a user agent. The
privacy page states that support submissions are stored and emailed to the
operator.

## Testing

- `src/lib/__tests__/reports.test.ts`: kinds per source, caps, honeypot,
  `trimContext` (allowed keys, truncation, 4 KB drop), `refLabel`,
  `subjectFor`, `ackSubject`, body shapes.
- `src/lib/__tests__/support-mail.test.ts`: Resend module mocked. Two
  sends with the right from/to/reply-to/subject; a rejected send →
  `failed`; missing key → `failed`; never throws.
- `src/lib/__tests__/support-forms.test.tsx`: `renderToStaticMarkup` of
  the website form (kind picker, honeypot present, email read-only when
  signed in) and the Console forms (two kinds, no support option, the
  attach note).
- Existing suites stay green; `npm run typecheck` and `npm run build`
  pass.

Live gate: one submission of each kind from the deployed site and one bug
report from a VM Console. Inbox receives each with reply-to correct;
submitter receives the ack; rows show `sent`. Then one submission with the
key removed to see the ops alert arrive as a native notification.

## Rollout order

1. Migration, `reports.ts`, tests.
2. `vercel integration add resend/resend-email` → Luke verifies the domain
   in Resend → `vercel env pull`.
3. `support-mail.ts`, tests.
4. `submitReport` action.
5. Website page, footer link, FAQ line, privacy line, form tests.
6. Console page and sidebar entry, form tests.
7. Deploy, live gate.
