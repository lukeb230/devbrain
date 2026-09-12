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
        <div className="flex h-[34px] items-center gap-2.5 border-b border-black/30 bg-[#242019] px-4">
          <span className="h-[6px] w-[6px] rounded-full bg-[#f0b35b]" />
          <span className="font-mono text-[10.5px] uppercase tracking-[.1em] text-white/65">{title}</span>
        </div>
        <div
          className="overflow-x-auto px-5 py-5 font-mono text-[12px] leading-[1.8] text-codefg sm:text-[12.5px]"
          style={{ minHeight: `calc(${lines.length} * 1.8em + 2.5rem)` }}
        >
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

// ---------------------------------------------------------------------------
// What DevBrain actually emits.
//
// These are taken from the source, not imagined. An earlier version of this
// file invented an editor's permission prompt ("? Proceed anyway? ❯ No,
// coordinate first") and a hand-formatted brief. Neither exists. DevBrain
// returns a decision and a reason; the EDITOR draws whatever prompt it draws,
// and this page has no business depicting a UI it does not own.
//
//   guard   plugin/hooks/check-collision.mjs → emitGuard() in host.mjs
//   brief   presence.mjs: emitContext(host, "## Team context (DevBrain)\n" +
//           JSON.stringify(ctx, null, 2)), shape from buildDigest() in
//           src/lib/digest.ts
//
// Values are synthetic; keys, strings and structure are not.
// ---------------------------------------------------------------------------

/** The guard's stdout, verbatim in shape. */
export const GUARD: Line[] = [
  { text: "{", tone: "dim" },
  { text: '  "hookSpecificOutput": {', tone: "dim" },
  { text: '    "hookEventName": "PreToolUse",', tone: "cmd" },
  { text: '    "permissionDecision": "ask",', tone: "warn" },
  { text: '    "permissionDecisionReason":', tone: "cmd" },
  { text: '      "DevBrain: src/api/auth.ts is being worked on right now', tone: "stop" },
  { text: "       by Kai (claimed: refactoring the session guard).", tone: "stop" },
  { text: "       Editing it anyway risks a collision — coordinate", tone: "stop" },
  { text: '       first, or approve to proceed deliberately."', tone: "stop" },
  { text: "  }", tone: "dim" },
  { text: "}", tone: "dim" },
];

/** The brief: the heading, then the payload, with the real keys. */
export const BRIEF: Line[] = [
  { text: "## Team context (DevBrain)", tone: "warn" },
  { text: "{", tone: "dim" },
  { text: '  "repo": "northwind/api",' },
  { text: '  "you": "Nova",' },
  { text: '  "active_sessions": [', tone: "dim" },
  { text: '    { "dev": "Kai", "branch": "refactor/session-guard",', tone: "ok" },
  { text: '      "files": ["src/api/session.ts"] },', tone: "ok" },
  { text: '    { "dev": "Rio", "branch": "chore/coverage",', tone: "ok" },
  { text: '      "files": ["tests/auth.spec.ts"] }', tone: "ok" },
  { text: "  ],", tone: "dim" },
  { text: '  "claims": [', tone: "dim" },
  { text: '    { "dev_label": "Kai", "paths": ["src/api/**"],', tone: "warn" },
  { text: '      "note": "refactoring the session guard" }', tone: "warn" },
  { text: "  ],", tone: "dim" },
  { text: '  "merge_plan": [', tone: "dim" },
  { text: '    { "number": 131, "after": "#128",' },
  { text: '      "shared_files": ["src/api/session.ts"] }' },
  { text: "  ],", tone: "dim" },
  { text: '  "recent_decisions": [', tone: "dim" },
  { text: '    { "text": "tokens are hashed, never stored", "by": "Kai" }' },
  { text: "  ]", tone: "dim" },
  { text: "}", tone: "dim" },
];
