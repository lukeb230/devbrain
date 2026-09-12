"use client";

import { useState } from "react";

// ============================================================================
// The one interactive element: the visitor triggers the mechanic themselves.
//
// Pick a file. If a teammate is holding it, the write is refused with the
// product's real warning; if it is free, the write goes through. That single
// interaction is the whole product, and it is more convincing than any
// sentence describing it.
//
// Both outcomes are what the hook really does, which the first version of
// this got wrong in both directions: it invented an editor prompt for the
// refusal, and invented an "⏺ Updated …" line for the clear case. The clear
// case prints NOTHING — check-collision.mjs calls process.exit(0) — and that
// silence is the better story anyway: it is invisible unless it matters.
//
// Real buttons, so it is keyboard navigable; the outcome is announced through
// a live region rather than only appearing.
// ============================================================================

type File = { path: string; held?: { who: string; what: string } };

const FILES: File[] = [
  { path: "src/api/auth.ts", held: { who: "Kai", what: "refactoring the session guard" } },
  { path: "src/api/session.ts", held: { who: "Kai", what: "refactoring the session guard" } },
  { path: "tests/auth.spec.ts", held: { who: "Rio", what: "writing coverage" } },
  { path: "src/ui/login.tsx" },
  { path: "docs/auth.md" },
];

export function TryIt() {
  const [picked, setPicked] = useState<File | null>(null);

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="lp-win bg-ink">
        <div className="border-b border-line bg-row px-4 py-2.5 text-[12.5px] font-semibold text-txt">
          Pick a file to edit
        </div>
        <div className="p-2">
          {FILES.map((f) => {
            const on = picked?.path === f.path;
            return (
              <button
                key={f.path}
                type="button"
                onClick={() => setPicked(f)}
                aria-pressed={on}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${on ? "bg-row2" : "hover:bg-row"}`}
              >
                <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${f.held ? "bg-wait" : "bg-faint/60"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[12px] text-txt">{f.path}</span>
                  <span className="mt-0.5 block text-[11.5px] text-muted">
                    {f.held ? `held by ${f.held.who}` : "nobody is in this one"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-w-0">
        <div aria-live="polite" className="lp-win min-h-[196px] overflow-hidden bg-codebg">
          <div className="flex h-[34px] items-center gap-2.5 border-b border-black/30 bg-[#242019] px-4">
            <span className="h-[6px] w-[6px] rounded-full bg-[#f0b35b]" />
            <span className="font-mono text-[10.5px] uppercase tracking-[.1em] text-white/65">devbrain · pre-write hook → stdout</span>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap px-5 py-5 font-mono text-[12px] leading-[1.8] text-codefg sm:text-[12.5px]">
            {!picked ? (
              <span className="text-white/45">Choose a file on the left. DevBrain checks it before your agent writes.</span>
            ) : picked.held ? (
              <>
                <span className="text-white/45">{"{ "}</span>
                <span className="text-[#f0b35b]">{'"permissionDecision": "ask",'}</span>
                {"\n  "}
                <span className="text-white/70">{'"permissionDecisionReason":'}</span>
                {"\n    "}
                <span className="text-[#f08a84]">{`"DevBrain: ${picked.path} is being worked on\n     right now by ${picked.held.who} (claimed: ${picked.held.what}).\n     Editing it anyway risks a collision — coordinate\n     first, or approve to proceed deliberately."`}</span>
                {"\n"}
                <span className="text-white/45">{"}"}</span>
                {"\n\n"}
                <span className="text-white/45">{"your editor shows that reason and waits for you"}</span>
              </>
            ) : (
              <>
                <span className="text-white/45">{"(no output)"}</span>
                {"\n\n"}
                <span className="text-[#7fd39b]">{"exit 0"}</span>
                {"\n"}
                <span className="text-white/45">{"nobody else is in this file — the hook says nothing\nand your agent writes, exactly as it would without us"}</span>
              </>
            )}
          </pre>
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12px] text-muted">
          <span>The real check, on synthetic team data.</span>
          {picked && (
            <button type="button" onClick={() => setPicked(null)} className="text-accenttext hover:underline">
              reset
            </button>
          )}
        </p>
      </div>
    </div>
  );
}
