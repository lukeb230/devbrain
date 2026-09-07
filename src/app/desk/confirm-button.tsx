"use client";
import { useState } from "react";

// A submit button that asks once before it submits. First click arms it and
// shows what is about to happen (built from the form's current values);
// the second click submits for real. Used where a form has consequences
// outside DevBrain (mapping a Reminders list starts syncing every item on it).
export function ConfirmButton({ label, describe }: { label: string; describe: (form: HTMLFormElement) => string }) {
  const [armed, setArmed] = useState<string | null>(null);
  if (armed) {
    return (
      <span className="flex items-center gap-2">
        <span className="text-[11.5px] text-wait">{armed}</span>
        <button type="submit" className="whitespace-nowrap rounded-lg bg-brand-600 px-3 py-1.5 font-display text-[11.5px] font-semibold text-white hover:bg-brand-700">Yes, {label.toLowerCase()}</button>
        <button type="button" onClick={() => setArmed(null)} className="font-display text-[11.5px] font-semibold text-muted hover:text-txt">cancel</button>
      </span>
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
      className="whitespace-nowrap rounded-lg bg-brand-600 px-3 py-1.5 font-display text-[11.5px] font-semibold text-white hover:bg-brand-700"
    >
      {label}
    </button>
  );
}
