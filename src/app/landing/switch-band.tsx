import { WRITER_CATALOG } from "@/lib/rules-catalog";
import { Count, Reveal } from "./reveal";

// The label is the real rule from the catalogue; the paragraph is its detail
// text without the em dashes. The four numbers are illustrative (decision D1,
// option a) and say so.
const RULE = WRITER_CATALOG.find((r) => r.rule === "writer_auto_merge") ?? { label: "Auto-merge approved green PRs" };
const NUMBERS = [
  { n: 23, tone: "text-go", label: "PRs merged by DevBrain" },
  { n: 9, tone: "text-wait", label: "branches updated from main" },
  { n: 0, tone: "text-txt", label: "pushes to main" },
  { n: 0, tone: "text-txt", label: "merged without a human's approval" },
];

export function SwitchBand() {
  return (
    <figure aria-label="The auto-merge switch turned on, and four numbers since" className="grid gap-8 rounded-xl border border-line2 bg-ink px-6 pb-9 pt-10 sm:px-12 lg:grid-cols-2 lg:gap-12">
      <div>
        <Reveal amount={0.5} fx="left" className="flex items-center gap-4">
          <Reveal as="span" amount={0.5} fx="fade" className="lp-toggle relative inline-block h-9 w-16 shrink-0 rounded-full bg-go"><i className="absolute left-[3px] top-[3px] block h-[30px] w-[30px] translate-x-[28px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.25)]" /></Reveal>
          <span className="font-display text-[22px] font-medium leading-[1.2] text-txt sm:text-[26px]">{RULE.label}</span>
        </Reveal>
        <Reveal as="p" fx="left" delay={100} className="mt-4 max-w-[44ch] text-[14px] leading-[1.6] text-muted">
          When a PR&apos;s light turns green, a teammate approved it, it&apos;s conflict-free, and it&apos;s this PR&apos;s turn in the merge order, DevBrain presses merge for you. A PR only the AI cleared is never auto-merged. Branch protection still applies.
        </Reveal>
        <p className="mt-3 font-mono text-[11.5px] text-faint">Settings → Rules · per repo · admin only · off by default</p>
      </div>
      <div className="lg:border-l lg:border-line2 lg:pl-12">
        <p className="font-mono text-[11px] uppercase tracking-[.12em] text-faint">since you flipped it</p>
        <div className="mt-3.5 grid grid-cols-2 gap-[18px]">
          {NUMBERS.map((x, i) => (
            <Reveal key={x.label} delay={500 + i * 110} y={12} className="min-w-0">
              <div className={`font-display text-[48px] font-medium leading-none tracking-[-.04em] ${x.tone} lg:text-[64px]`}><Count to={x.n} delay={500 + i * 110} /></div>
              <div className="mt-1.5 text-[13px] text-muted">{x.label}</div>
            </Reveal>
          ))}
        </div>
        <p className="mt-4 font-mono text-[11px] text-faint">illustrative · your numbers will be your own</p>
      </div>
    </figure>
  );
}
