"use client";

import { usePathname, useSearchParams } from "next/navigation";

// Every Desk form includes this. It tells the server action where to come
// back to (see src/lib/surface.ts). Without it an action falls back to its
// dashboard URL, which the Desk window refuses — and refused navigations go
// to the browser. Rule 2 of the phase-4 plan, made hard to forget.
export function DeskNext() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  return <input type="hidden" name="next" value={`${pathname}${search ? `?${search}` : ""}`} />;
}
