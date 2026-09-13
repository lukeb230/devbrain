import { Reveal } from "./reveal";
import { TEAM } from "./mock-team";

const MESSAGES = (t: typeof TEAM) => [
  { who: t.you, me: true, at: "4:31 PM", text: "hey is anyone in auth.ts? just got a conflict on my login PR" },
  { who: t.cursor, me: false, at: "4:38 PM", text: "yeah since this morning, session guard refactor. did you change login()?" },
  { who: t.you, me: true, at: "4:38 PM", text: "rewrote it" },
  { who: t.cursor, me: false, at: "4:39 PM", text: "ok. call?" },
];

function Cursor({ fill, className }: { fill: string; className?: string }) {
  return (
    <svg aria-hidden width="26" height="30" viewBox="0 0 26 30" className={className}>
      <path d="M2 2 L2 24 L8 18 L12 28 L16 26 L12 17 L20 17 Z" fill={fill} stroke="var(--wg-ink)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function CollisionPiece({ team = TEAM }: { team?: typeof TEAM }) {
  return (
    <figure aria-label={`Two agents, ${team.cursor}'s and ${team.you}'s, both about to edit auth.ts at 9:14, and the chat that would have followed seven hours later`} className="relative w-full lg:h-[480px]">
      <Reveal fx="fade" amount={0.3} duration={400} className="relative h-[260px] overflow-hidden rounded-xl border border-line2 bg-ink lg:h-[360px]">
        <span className="absolute left-7 top-[22px] font-mono text-[12px] text-muted">src/api/auth.ts · 09:14</span>
        <Reveal as="span" fx="file" delay={100} duration={700} className="absolute left-6 top-[80px] font-mono text-[72px] tracking-[-.045em] text-txt lg:left-16 lg:top-[112px] lg:text-[128px]">auth.ts</Reveal>
        <Reveal fx="cursor-l" delay={350} className="absolute left-[104px] top-[70px]">
          <Cursor fill="var(--wg-wait)" />
          <span className="absolute left-[22px] top-[26px] whitespace-nowrap rounded-md bg-wait px-2 py-[3px] font-mono text-[10.5px] text-white">{team.cursor} · Cursor</span>
        </Reveal>
        <Reveal fx="cursor-r" delay={500} className="absolute left-[430px] top-[242px] hidden lg:block">
          <Cursor fill="var(--wg-accent-strong)" />
          <span className="absolute left-[22px] top-[26px] whitespace-nowrap rounded-md bg-accent2 px-2 py-[3px] font-mono text-[10.5px] text-white">{team.you} · Claude Code</span>
        </Reveal>
        <Reveal as="span" fx="fade" delay={800} duration={400} className="absolute bottom-5 left-7 font-mono text-[12px] text-stop">2 agents · 0 aware</Reveal>
      </Reveal>
      <Reveal as="span" fx="fade" delay={1000} duration={400} className="absolute right-0 top-[82px] hidden font-mono text-[12px] text-muted lg:block">seven hours later</Reveal>
      <Reveal fx="right" delay={1100} duration={700} className="mt-4 w-full lg:absolute lg:right-0 lg:top-[112px] lg:mt-0 lg:w-[440px]">
        <div role="img" aria-label="Illustration: a chat thread in # eng-backend" className="lp-win bg-row">
          <div className="flex h-[34px] items-center gap-2 border-b border-line px-3.5">
            <span className="h-[11px] w-[11px] rounded-full bg-[#ec6a5e]" /><span className="h-[11px] w-[11px] rounded-full bg-[#f4bf4f]" /><span className="h-[11px] w-[11px] rounded-full bg-[#61c554]" />
            <span className="mx-auto pr-10 text-[11.5px] font-medium text-muted"># eng-backend</span>
          </div>
          <div className="space-y-3 px-4 py-3.5 text-[13.5px] leading-[1.5] text-txt">
            {MESSAGES(team).map((m, i) => (
              <Reveal key={i} delay={1100 + 700 + i * 140} duration={400} y={6} className="flex gap-2.5">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[7px] text-[12px] font-semibold ${m.me ? "bg-coralink text-accenttext" : "bg-[color:var(--wg-wait-bg)] text-wait"}`}>{m.who[0]}</span>
                <div><b className="font-semibold">{m.who}</b> <span className="font-mono text-[11px] text-faint">{m.at}</span><div>{m.text}</div></div>
              </Reveal>
            ))}
          </div>
        </div>
      </Reveal>
    </figure>
  );
}
