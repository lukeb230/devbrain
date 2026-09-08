"use client";
import { useState } from "react";

// The two-step confirm (Dusk states board): first click arms it and shows,
// in a wait-coloured box, what is about to happen (built from the form's
// current values); then "Yes, …" submits for real and "cancel" disarms.
// Used where a form has consequences outside DevBrain (mapping a Reminders
// list starts syncing every item on it).
export function ConfirmButton({ label, describe }: { label: string; describe: (form: HTMLFormElement) => string }) {
  const [armed, setArmed] = useState<string | null>(null);
  if (armed) {
    return (
      <div>
        <div className="flex items-center gap-2.5 rounded-lg border border-[var(--wg-wait-line)] bg-[var(--wg-wait-bg)] px-2.5 py-2">
          <span className="flex-1 text-[12px] leading-[1.5] text-wait">{armed}</span>
        </div>
        <div className="mt-2.5 flex items-center gap-2.5">
          <button type="submit" className="whitespace-nowrap rounded-lg bg-accent2 px-[11px] py-1.5 font-display text-[11.5px] font-semibold text-white">Yes, {label.toLowerCase()}</button>
          <button type="button" onClick={() => setArmed(null)} className="font-display text-[11.5px] font-semibold text-muted hover:text-txt">cancel</button>
        </div>
      </div>
    );
  }
  return (
    <button
      type="submit"
      onClick={(e) => {
        const form = e.currentTarget.form;
        if (!form || !form.reportValidity()) return; // let the browser show what's missing
        e.preventDefault();
        setArmed(describe(form));
      }}
      className="whitespace-nowrap rounded-lg bg-accent2 px-3.5 py-2 text-[12.5px] font-semibold text-white"
    >
      {label}
    </button>
  );
}
