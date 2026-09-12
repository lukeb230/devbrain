"use client";

import { useActionState } from "react";
import { captureLead, type LeadState } from "../lead-actions";

// The address someone leaves when they are not signing up today. One field,
// one button, and the answer replaces the form — no toast to miss, nothing to
// dismiss, and no second chance to submit the same address by accident.

export function EmailForm({ source = "landing", label, className = "" }: { source?: "landing" | "beta_full"; label?: string; className?: string }) {
  const [state, action, pending] = useActionState<LeadState, FormData>(captureLead, null);

  if (state?.ok) {
    return (
      <p className={`rounded-[10px] border border-[var(--wg-go-line)] bg-[var(--wg-go-bg)] px-4 py-3 text-[13px] text-go ${className}`}>
        {state.message}
      </p>
    );
  }

  return (
    <form action={action} className={className}>
      <input type="hidden" name="source" value={source} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          aria-label={label ?? "Email address"}
          className="min-w-0 flex-1 rounded-lg border border-line2 bg-ink px-3.5 py-2.5 text-[13.5px] text-txt placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="whitespace-nowrap rounded-lg bg-accent2 px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Keep me posted"}
        </button>
      </div>
      {state && !state.ok && <p className="mt-2 text-[12.5px] text-stop">{state.message}</p>}
    </form>
  );
}
