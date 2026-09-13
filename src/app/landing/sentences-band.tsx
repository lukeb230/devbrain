import { Count, Reveal } from "./reveal";
import { TEAM } from "./mock-team";

const Path = ({ children }: { children: string }) => <code className="font-mono text-[22px] sm:text-[31px]">{children}</code>;

export function SentencesBand({ team = TEAM }: { team?: typeof TEAM }) {
  const line = "max-w-[26ch] font-display text-[28px] font-medium leading-[1.22] tracking-[-.025em] text-txt sm:text-[38px]";
  return (
    <figure aria-label="Three sentences: two agents claimed their areas and the third was handed the task that touched neither" className="rounded-xl border border-line2 bg-ink px-6 pb-10 pt-11 sm:px-12">
      <Reveal as="p" amount={0.5} y={14} className={line}><span className="text-wait">{team.cursor}</span>&apos;s agent claimed <Path>src/api/**</Path> when it started the guard refactor.</Reveal>
      <Reveal as="p" amount={0.5} delay={260} y={14} className={`mt-4 ${line}`}><span className="text-go">{team.codex}</span>&apos;s agent claimed <Path>tests/**</Path> when it picked up the fixtures.</Reveal>
      <Reveal as="p" amount={0.5} delay={520} y={14} className={`mt-4 ${line}`}><span className="text-accenttext">{team.you}</span>&apos;s agent was handed the one task that touched neither.</Reveal>
      <div className="mt-[30px] flex flex-wrap gap-[26px] text-[13px] text-muted">
        {[[0, "paths typed by a person"], [0, "messages about who's where"], [3, "agents, none in each other's files"]].map(([n, l], i) => (
          <Reveal key={String(l)} delay={900 + i * 100} duration={500} y={8} className="flex items-baseline gap-2">
            <span className="font-display text-[28px] font-medium text-txt"><Count to={Number(n)} delay={900 + i * 100} /></span><span>{l}</span>
          </Reveal>
        ))}
      </div>
    </figure>
  );
}
