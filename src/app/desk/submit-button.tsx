"use client";

import { useFormStatus } from "react-dom";

// A submit button that goes quiet while its form is in flight, so a second
// click cannot re-post the same form (the token form minted twice that way
// and showed a token the second insert never stored).
export function SubmitButton({ children, pendingLabel, size = "md" }: { children: React.ReactNode; pendingLabel: string; size?: "md" | "sm" | "lg" }) {
  const { pending } = useFormStatus();
  const s = { md: "px-3.5 py-2 text-[12.5px]", sm: "px-[11px] py-1.5 font-display text-[11.5px] font-semibold", lg: "px-4 py-[9px] text-[12.5px]" }[size];
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`whitespace-nowrap rounded-lg bg-accent2 font-semibold text-white hover:brightness-110 disabled:opacity-50 ${s}`}>
      {pending ? pendingLabel : children}
    </button>
  );
}
