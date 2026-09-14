"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./ui";

// A submit button that goes quiet while its form is in flight, so a second
// click cannot re-post the same form (the token form minted twice that way
// and showed a token the second insert never stored). Wraps Button so the
// tone/size styling lives in exactly one place.
export function SubmitButton({ children, pendingLabel, size = "md", tone = "primary", className = "" }: { children: React.ReactNode; pendingLabel: string; size?: "md" | "sm" | "lg"; tone?: "primary" | "ghost" | "danger"; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" tone={tone} size={size} disabled={pending} className={className}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
