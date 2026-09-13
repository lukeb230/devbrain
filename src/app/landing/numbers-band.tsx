import { Count, Reveal } from "./reveal";
import { TEAM } from "./mock-team";

const STATS = [
  { n: 17, tone: "text-go", label: "PRs merged", detail: "#112 to #128 · rate limiting, the new fixture, docs" },
  { n: 5, tone: "text-wait", label: "decisions logged", detail: "tokens are hashed, never stored · and four more" },
  { n: 3, tone: "text-wait", label: "dead ends recorded", detail: "mocking the clock in the login spec · and two more" },
  { n: 2, tone: "text-accenttext", label: "handoffs waiting for Sam", detail: "the auth fixture from Jonah · CI wiring from Lena" },
];

export function NumbersBand({ team = TEAM }: { team?: typeof TEAM }) {
  return (
    <figure aria-label={`Four numbers summarising what happened while ${team.cursor} was away`} className="rounded-xl border border-line2 bg-ink px-6 pb-9 pt-10 sm:px-12">
      <Reveal as="p" amount={0.4} y={16} className="font-display text-[34px] font-medium leading-none tracking-[-.035em] text-txt sm:text-[56px]">
        Since {team.cursor} logged off on Friday<span className="text-accenttext">.</span>
      </Reveal>
      <div className="mt-8 grid grid-cols-2 gap-6 xl:grid-cols-4">
        {STATS.map((s, i) => (
          <Reveal key={s.label} delay={200 + i * 90} y={14} className="min-w-0">
            <div className={`font-display text-[64px] font-medium leading-none tracking-[-.04em] ${s.tone} xl:text-[96px]`}><Count to={s.n} delay={200 + i * 90} /></div>
            <div className="mt-2 text-[14px] font-medium text-txt">{s.label}</div>
            <div className="mt-1 font-mono text-[11.5px] leading-[1.5] text-muted">{s.detail}</div>
          </Reveal>
        ))}
      </div>
      <Reveal fx="left" delay={700} className="mt-9 flex items-center gap-3.5 border-t border-line2 pt-6">
        <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] bg-coralink font-display text-[14px] font-semibold text-accenttext">{team.you[0]}</span>
        <p className="text-[15.5px] leading-[1.5] text-body"><b className="font-semibold text-txt">{team.you}&apos;s session opened Monday at 09:02 with all of it in front of it.</b> She didn&apos;t ask {team.cursor}, or anyone, anything. Neither did her agent.</p>
      </Reveal>
    </figure>
  );
}
