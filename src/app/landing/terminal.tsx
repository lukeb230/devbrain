"use client";

import { useEffect, useRef, useState } from "react";
import { onceInView } from "./in-view";

// ============================================================================
// A terminal that behaves like one.
//
// The earlier version was a <pre> in a window frame — accurate text, dead
// object. This types the command at a human cadence, prints the interrupt
// after the beat where the write would have happened, colours the output the
// way a terminal does, and leaves a blinking block cursor.
//
// It renders the FULL transcript on the server, so a reader with JavaScript
// off or reduced motion on sees the finished thing rather than an empty box.
// Animation only starts once we know it is wanted.
// ============================================================================

export type Line = { text: string; tone?: "dim" | "cmd" | "warn" | "stop" | "ok" | "prompt" };

const TONE: Record<string, string> = {
  dim: "text-white/45",
  cmd: "text-white/90",
  warn: "text-[#f0b35b]",
  stop: "text-[#f08a84]",
  ok: "text-[#7fd39b]",
  prompt: "text-white/70",
};

/** Total characters, used to drive the reveal. */
const len = (lines: Line[]) => lines.reduce((n, l) => n + l.text.length + 1, 0);

/**
 * The typing mechanics on their own: reveals `lines` at a human cadence once
 * scrolled into view, with the same line rendering and blinking cursor
 * `Transcript` has always shown. No window chrome — callers supply their own.
 */
export function Transcript({ lines, className = "" }: { lines: Line[]; className?: string }) {
  const total = len(lines);
  // Server and no-JS render everything; the effect below decides to animate.
  const [shown, setShown] = useState(total);
  const [done, setDone] = useState(true);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!box.current) return;
    let step = 0;
    let safety = 0;
    const stop = onceInView(
      box.current,
      () => {
        setShown(0);
        setDone(false);
        let i = 0;
        // setInterval, not requestAnimationFrame: rAF does not advance in every
        // context (measured — it left this terminal stuck empty), and an
        // animation that can stall must never be the only path to the content.
        step = window.setInterval(() => {
          i = Math.min(total, i + 2);
          setShown(i);
          if (i >= total) {
            window.clearInterval(step);
            setDone(true);
          }
        }, 16);
        // Whatever happens to the timer, the transcript is complete within 6s.
        safety = window.setTimeout(() => {
          window.clearInterval(step);
          setShown(total);
          setDone(true);
        }, 6000);
      },
      { margin: 80 },
    );
    return () => {
      stop();
      window.clearInterval(step);
      window.clearTimeout(safety);
    };
  }, [total]);

  // Slice the transcript to the revealed character count.
  let budget = shown;
  const visible: Line[] = [];
  for (const l of lines) {
    if (budget <= 0) break;
    visible.push({ ...l, text: l.text.slice(0, budget) });
    budget -= l.text.length + 1;
  }

  return (
    <div ref={box} className={className} style={{ minHeight: `calc(${lines.length} * 1.8em + 2.5rem)` }}>
      {visible.map((l, i) => (
        <div key={i} className={`whitespace-pre-wrap ${TONE[l.tone ?? ""] ?? ""}`}>
          {l.text}
          {i === visible.length - 1 && (
            <span
              aria-hidden="true"
              className={`ml-[2px] inline-block h-[1.05em] w-[7px] translate-y-[2px] bg-[#e6dfd2] ${done ? "animate-pulse" : ""}`}
            />
          )}
        </div>
      ))}
      {visible.length === 0 && <div>&nbsp;</div>}
    </div>
  );
}
