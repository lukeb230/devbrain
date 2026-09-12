"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { captureLead, type LeadState } from "../lead-actions";

// The address someone leaves when they are not signing up today.
//
// Accessibility is the whole point here, not a finish: this is the only form
// on the page, and before this it announced nothing in either direction. The
// error is a live region tied to the field by aria-describedby; the success
// message is a live region that also takes focus, because replacing the form
// destroys whatever the keyboard user was standing on.

export function EmailForm({ source = "landing", label = "Email address", className = "" }: { source?: "landing" | "beta_full"; label?: string; className?: string }) {
  const [state, action, pending] = useActionState<LeadState, FormData>(captureLead, null);
  const id = useId();
  const errorId = `${id}-error`;
  const doneRef = useRef<HTMLParagraphElement>(null);

  // Focus follows the content that replaced the form, so a keyboard or screen
  // reader user is not dropped onto <body> with no idea what happened.
  useEffect(() => {
    if (state?.ok) doneRef.current?.focus();
  }, [state?.ok]);

  if (state?.ok) {
    return (
      <p
        ref={doneRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className={`rounded-[10px] border border-[var(--wg-go-line)] bg-[var(--wg-go-bg)] px-4 py-3 text-[13.5px] text-go focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${className}`}
      >
        {state.message}
      </p>
    );
  }

  return (
    <form action={action} className={className}>
      <input type="hidden" name="source" value={source} />
      <label htmlFor={id} className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-[.1em] text-muted">
        {label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={id}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          aria-invalid={state && !state.ok ? true : undefined}
          aria-describedby={state && !state.ok ? errorId : undefined}
          className="min-h-[46px] min-w-0 flex-1 rounded-lg border border-line2 bg-ink px-3.5 py-2.5 text-[13.5px] text-txt placeholder:text-faint focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-ink"
        />
        <button
          type="submit"
          disabled={pending}
          className="min-h-[46px] whitespace-nowrap rounded-lg bg-accent2 px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Keep me posted"}
        </button>
      </div>
      {state && !state.ok && (
        <p id={errorId} role="alert" className="mt-2 text-[13px] text-stop">
          {state.message}
        </p>
      )}
    </form>
  );
}
