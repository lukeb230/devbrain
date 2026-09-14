"use client";

import { useState } from "react";
import { Reveal } from "./reveal";
import { TEAM } from "./mock-team";
import { Transcript, type Line } from "./terminal";

// devbrain spawn, start_task, get_team_context, claim_area and Read/Update/
// Write are real; the wording the agent prints around them is illustrative
// and stays as written.

// This figure has no role="img" (it is an interactive tablist), so the
// plural-voice check in site-copy.test.tsx reads this text directly: keep
// first-person words out of every line below.

// Tab 1: the original session in src/ui/** (no spawn; it was started by hand).
const LINES_1 = (t: typeof TEAM): Line[] => [
  { text: "› wire the login form to the new session endpoint", tone: "cmd" },
  { text: "" },
  { text: `● devbrain - get_team_context (MCP)(repo: "${t.repo}")`, tone: "ok" },
  { text: `  ⎿  ${t.cursor} in src/api/** (refactoring the session guard) · ${t.codex} in tests/** · src/ui/** is clear`, tone: "dim" },
  { text: '● devbrain - claim_area (MCP)(paths: ["src/ui/**"], note: "wiring the login form")', tone: "ok" },
  { text: "  ⎿  claimed src/ui/** for 4h", tone: "dim" },
  { text: "● Read(src/ui/LoginForm.tsx)", tone: "ok" },
  { text: "  ⎿  Read 84 lines", tone: "dim" },
  { text: "● Update(src/ui/LoginForm.tsx)", tone: "warn" },
];

// Tab 2: Sam · 2, spawned to rate limit the token endpoint.
const LINES_2 = (t: typeof TEAM): Line[] => [
  { text: "$ devbrain spawn --auto", tone: "dim" },
  { text: `identity: ${t.you} · 2`, tone: "dim" },
  { text: `cloning ${t.repo} → ~/.devbrain/clones/api-2 …`, tone: "dim" },
  { text: "dispatched: rate limit the token endpoint", tone: "dim" },
  { text: `launching claude as ${t.you} · 2 in ~/.devbrain/clones/api-2`, tone: "dim" },
  { text: "" },
  { text: "› rate limit the token endpoint", tone: "cmd" },
  { text: "" },
  { text: `● devbrain - get_team_context (MCP)(repo: "${t.repo}")`, tone: "ok" },
  { text: `  ⎿  ${t.you} in src/ui/** · ${t.you} · 3 in tests/** · #44 is yours, its files are free`, tone: "dim" },
  { text: '● devbrain - start_task (MCP)(id: "t_44")', tone: "ok" },
  { text: "  ⎿  started · claimed src/api/limits/** for 8h", tone: "dim" },
  { text: "● Update(src/api/limits/limiter.ts)", tone: "warn" },
];

// Tab 3: Sam · 3, spawned to add coverage for the limiter in tests/**.
const LINES_3 = (t: typeof TEAM): Line[] => [
  { text: "$ devbrain spawn --auto", tone: "dim" },
  { text: `identity: ${t.you} · 3`, tone: "dim" },
  { text: `cloning ${t.repo} → ~/.devbrain/clones/api-3 …`, tone: "dim" },
  { text: "dispatched: add coverage for the limiter", tone: "dim" },
  { text: `launching claude as ${t.you} · 3 in ~/.devbrain/clones/api-3`, tone: "dim" },
  { text: "" },
  { text: "› add coverage for the limiter", tone: "cmd" },
  { text: "" },
  { text: `● devbrain - get_team_context (MCP)(repo: "${t.repo}")`, tone: "ok" },
  { text: `  ⎿  ${t.you} in src/ui/** · ${t.you} · 2 in src/api/limits/** · tests/** is free`, tone: "dim" },
  { text: '● devbrain - start_task (MCP)(id: "t_45")', tone: "ok" },
  { text: "  ⎿  started · claimed tests/** for 8h", tone: "dim" },
  { text: "● Write(tests/limits/limiter.spec.ts)", tone: "warn" },
];

const TRANSCRIPTS = [LINES_1, LINES_2, LINES_3];

export function SpawnWindow({ team = TEAM }: { team?: typeof TEAM }) {
  const [active, setActive] = useState(1);
  const tabs = [`${team.you} · src/ui/**`, `${team.you} · 2 · src/api/limits/**`, `${team.you} · 3 · tests/**`];
  const minLines = Math.max(...TRANSCRIPTS.map((f) => f(team).length));
  const lights = (
    <div className="flex items-center gap-2 px-3.5"><span className="h-[11px] w-[11px] rounded-full bg-[#ec6a5e]" /><span className="h-[11px] w-[11px] rounded-full bg-[#f4bf4f]" /><span className="h-[11px] w-[11px] rounded-full bg-[#61c554]" /></div>
  );
  const onTabKeyDown = (e: React.KeyboardEvent) => {
    let next = active;
    if (e.key === "ArrowLeft") next = (active + tabs.length - 1) % tabs.length;
    else if (e.key === "ArrowRight") next = (active + 1) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    setActive(next);
    document.getElementById(`spawn-tab-${next}`)?.focus();
  };
  return (
    <figure aria-label="Illustration: a terminal with three spawned sessions; select a tab to see that session" className="lp-win w-full overflow-hidden">
      <div className="flex h-[38px] items-stretch overflow-x-auto bg-[#2e2922]">
        {lights}
        <div role="tablist" aria-label="Sessions" className="hidden sm:flex items-stretch">
          {tabs.map((t, i) => (
            <Reveal key={t} as="button" fx="tab" amount={0.4} delay={i * 120} duration={400} id={`spawn-tab-${i}`} role="tab" aria-selected={i === active} aria-controls="spawn-panel" tabIndex={i === active ? 0 : -1} type="button" onClick={() => setActive(i)} onKeyDown={onTabKeyDown}
              className={`flex items-center gap-2 whitespace-nowrap border-r border-black/35 px-3.5 font-mono text-[12px] ${i === active ? "bg-codebg text-white" : "text-white/55 hover:text-white/80"}`}>
              <span className="h-[7px] w-[7px] rounded-full bg-[#7fd39b]" />{t}
            </Reveal>
          ))}
        </div>
        <span aria-hidden className="hidden items-center px-3.5 font-mono text-[12px] text-white/55 sm:flex">+</span>
        {/* phones: the active tab as a label; previous/next switch */}
        <div className="flex items-center gap-1 px-2 sm:hidden">
          <button type="button" aria-label="Previous session" onClick={() => setActive((a) => (a + tabs.length - 1) % tabs.length)} className="-my-2 px-3 py-2 text-white/55">‹</button>
          <span className="font-mono text-[12px] text-white">{tabs[active]}</span>
          <button type="button" aria-label="Next session" onClick={() => setActive((a) => (a + 1) % tabs.length)} className="-my-2 px-3 py-2 text-white/55">›</button>
        </div>
      </div>
      <div role="tabpanel" id="spawn-panel" aria-labelledby={`spawn-tab-${active}`} tabIndex={-1}>
        <Transcript key={active} lines={TRANSCRIPTS[active]!(team)} minLines={minLines} className="min-h-[230px] bg-codebg px-[22px] py-5 font-mono text-[12.5px] leading-[1.8] text-codefg" />
      </div>
    </figure>
  );
}
