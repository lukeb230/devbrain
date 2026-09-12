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

export function Terminal({
  title,
  lines,
  caption,
  className = "",
}: {
  title: string;
  lines: Line[];
  caption?: string;
  className?: string;
}) {
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
    <div ref={box} className={className}>
      <figure className="lp-win overflow-hidden bg-codebg">
        <div className="flex h-[34px] items-center gap-2 border-b border-black/30 bg-[#242019] px-3.5">
          <span className="h-[11px] w-[11px] rounded-full bg-[#ec6a5e]" />
          <span className="h-[11px] w-[11px] rounded-full bg-[#f4bf4f]" />
          <span className="h-[11px] w-[11px] rounded-full bg-[#61c554]" />
          <span className="mx-auto pr-10 text-[11.5px] font-medium text-white/65">{title}</span>
        </div>
        <div className="overflow-x-auto px-5 py-5 font-mono text-[12px] leading-[1.8] text-codefg sm:text-[12.5px]">
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
      </figure>
      {caption && <figcaption className="mt-3 font-mono text-[12px] text-muted">{caption}</figcaption>}
    </div>
  );
}

/** The collision, as the agent prints it. Used on both pages. */
export const COLLISION: Line[] = [
  { text: "nova@northwind ~/api › claude", tone: "prompt" },
  { text: "" },
  { text: "› Edit src/api/auth.ts", tone: "cmd" },
  { text: "" },
  { text: "⏺ DevBrain: src/api/auth.ts is being worked on right now by", tone: "stop" },
  { text: "  Kai (claimed: refactoring the session guard). Editing it anyway", tone: "stop" },
  { text: "  risks a collision — coordinate first, or approve to proceed", tone: "stop" },
  { text: "  deliberately.", tone: "stop" },
  { text: "" },
  { text: "? Proceed anyway?   ❯ No, coordinate first    Yes, I know", tone: "warn" },
];

/** The brief an agent is handed at session start. */
export const BRIEF: Line[] = [
  { text: "## Team context (DevBrain)", tone: "warn" },
  { text: "" },
  { text: "2 teammates active" },
  { text: "  Kai   · src/api/**   claimed, session guard", tone: "ok" },
  { text: "  Rio   · tests/**     writing coverage", tone: "ok" },
  { text: "" },
  { text: "since you were last here" },
  { text: "  #128 merged  · rate limiting" },
  { text: "  decision     · tokens are hashed, never stored" },
  { text: "" },
  { text: "waiting for you" },
  { text: '  handoff from Rio · "auth tests need the new fixture"', tone: "warn" },
];
