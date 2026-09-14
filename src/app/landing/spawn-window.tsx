import { Reveal } from "./reveal";
import { TEAM } from "./mock-team";
import { Transcript, type Line } from "./terminal";

// devbrain spawn, start_task and Update(...) are real; the wording the agent
// prints around them is illustrative and stays as written.
const LINES = (t: typeof TEAM): Line[] => [
  { text: "$ devbrain spawn", tone: "dim" },
  { text: `  token "${t.you} · 2" minted · cloned ${t.repo} → ~/dev/northwind-api-2`, tone: "dim" },
  { text: "" },
  { text: "› rate limit the token endpoint", tone: "cmd" },
  { text: "" },
  { text: `● DevBrain brief: ${t.you} is in src/ui/**, ${t.you} · 3 is in tests/**. #44 is yours; its files are free.`, tone: "ok" },
  { text: '● devbrain - start_task (MCP)(id: "t_44")', tone: "ok" },
  { text: "  ⎿  started · claimed src/api/limits/** for 8h", tone: "dim" },
  { text: "● Update(src/api/limits/limiter.ts)", tone: "warn" },
];

export function SpawnWindow({ team = TEAM }: { team?: typeof TEAM }) {
  const tabs = [`${team.you} · src/ui/**`, `${team.you} · 2 · src/api/limits/**`, `${team.you} · 3 · tests/**`, "+"];
  return (
    <figure role="img" aria-label="Illustration: a terminal with three spawned sessions, the second one starting a task" className="lp-win w-full overflow-hidden">
      <div className="flex h-[38px] items-stretch overflow-x-auto bg-[#2e2922]">
        <div className="flex items-center gap-2 px-3.5"><span className="h-[11px] w-[11px] rounded-full bg-[#ec6a5e]" /><span className="h-[11px] w-[11px] rounded-full bg-[#f4bf4f]" /><span className="h-[11px] w-[11px] rounded-full bg-[#61c554]" /></div>
        {tabs.map((t, i) => (
          <Reveal key={t} as="span" fx="tab" amount={0.4} delay={i * 120} duration={400} className={`hidden items-center gap-2 whitespace-nowrap border-r border-black/35 px-3.5 font-mono text-[12px] sm:flex ${i === 1 ? "bg-codebg text-white" : "text-white/55"}`}>
            {t !== "+" && <span className="h-[7px] w-[7px] rounded-full bg-[#7fd39b]" />}{t}
          </Reveal>
        ))}
        <span className="flex items-center px-3.5 font-mono text-[12px] text-white sm:hidden">{tabs[1]}</span>
      </div>
      <Transcript lines={LINES(team)} className="min-h-[230px] bg-codebg px-[22px] py-5 font-mono text-[12.5px] leading-[1.8] text-codefg" />
    </figure>
  );
}
