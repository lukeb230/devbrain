"use client";
import { useState } from "react";

// "copy" — writes to the clipboard and says so for a moment. 12px link,
// coral (the row-level verb) or a small primary button for the token card.
export function Copy({ text, label = "copy", tone = "link" }: { text: string; label?: string; tone?: "link" | "button" }) {
  const [done, setDone] = useState(false);
  const go = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ }
  };
  if (tone === "button") return <button type="button" onClick={go} className="rounded-lg bg-accent2 px-[11px] py-1.5 font-display text-[11.5px] font-semibold text-white">{done ? "Copied" : label}</button>;
  return <button type="button" onClick={go} className="text-[12px] font-semibold text-accent hover:underline">{done ? "copied" : label}</button>;
}
