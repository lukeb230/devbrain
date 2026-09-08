"use client";

import { useEffect, useState } from "react";

// Home's date eyebrow + greeting, computed in the viewer's clock (the server
// runs in UTC). Renders the server's guess first so nothing flashes.
export function Greeting({ login }: { login: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const d = now ?? new Date();
  const h = d.getHours();
  const word = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const date = d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  return (
    <div>
      <div className="font-mono text-[11px] uppercase tracking-[.1em] text-faint">{date}</div>
      <h1 className="mt-1.5 font-display text-[36px] font-medium leading-[1.05] tracking-[-.02em] text-txt">{word}, {login}.</h1>
    </div>
  );
}
