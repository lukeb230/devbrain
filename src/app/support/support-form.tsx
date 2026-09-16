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
