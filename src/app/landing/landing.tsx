import Link from "next/link";
import { loadBeta, platformCounts } from "@/lib/beta";
import { LEGAL } from "@/lib/legal";
import { ConsoleWindow, Dot } from "./app-shots";
import { CollisionPiece } from "./collision-piece";
import { DownloadButton } from "./download-button";
import { DownloadCard } from "./download-card";
import { EmailForm } from "./email-form";
import { GuardNote } from "./guard-note";
import { IncentiveModal } from "./incentive-modal";
import { NumbersBand } from "./numbers-band";
import { PanelWindow } from "./panel-window";
import { Mount, MotionGate, Reveal } from "./reveal";
import { SentencesBand } from "./sentences-band";
import { SpawnWindow } from "./spawn-window";
import { SwitchBand } from "./switch-band";

// ============================================================================
// The landing page. Five beats and the download card:
//
//   the hook      work like you're the only one in the repo
//   1 catch up    every session opens already knowing what happened
//   2 the guard   the second write is stopped before it happens
//   3 claims      agents steer around each other on their own
//   4 spawn       run more agents than you have people
//   5 merge       PRs land themselves, in the right order
//   6 sign up
//
// Every number is real (platform_counts()). Everything inside a window is
// synthetic and captioned as such.
// ============================================================================

const Section = ({ id, children, className = "" }: { id?: string; children: React.ReactNode; className?: string }) => (
  <section id={id} className={`mx-auto w-full max-w-[1140px] px-6 sm:px-8 ${className}`}>{children}</section>
);

const Beat = ({ h2, lede, note, gap = "mt-8", children }: { h2: string; lede: React.ReactNode; note?: string; gap?: string; children: React.ReactNode }) => (
  <Section className="pt-14 md:pt-[72px] lg:pt-[110px]">
    <Reveal as="h2" amount={0.6} className="max-w-[20ch] font-display text-[26px] font-medium leading-[1.08] tracking-[-.028em] text-txt text-balance sm:text-[38px]">{h2}</Reveal>
    <Reveal as="p" delay={80} y={12} className="mt-4 max-w-[54ch] text-[15.5px] leading-[1.6] text-body sm:text-[16.5px]">{lede}</Reveal>
    <div className={gap}>{children}</div>
    {note && <Reveal as="p" delay={80} y={12} className="mt-[22px] max-w-[62ch] text-[14.5px] leading-[1.6] text-muted">{note}</Reveal>}
  </Section>
);

export function LandingBody({ spotsLeft, maxTeams, free, full }: { spotsLeft: number | null; maxTeams: number | null; free: boolean; full: boolean }) {
  const pill = free && spotsLeft !== null && !full;
  return (
    <>
      {/* hero */}
      <Section className="pt-14 text-center sm:pt-[70px]">
        <Mount as="h1" duration={700} y={24} className="mx-auto max-w-[16ch] font-display text-[40px] font-semibold leading-[1.0] tracking-[-.03em] text-txt text-balance sm:text-[48px] lg:text-[68px]">
          Work like you&apos;re the <span className="text-accenttext">only one</span> in the repo.
        </Mount>
        <Mount as="p" delay={150} className="mx-auto mt-5 max-w-[60ch] text-[15.5px] leading-[1.6] text-body sm:text-[17.5px]">
          You&apos;re not. Your agents just handle it. They know who&apos;s in which file, they steer around each other, and the PRs land in the right order without you refereeing any of it.
        </Mount>
        <Mount delay={230} className="mt-7 flex flex-wrap items-center justify-center gap-3.5">
          {full ? <EmailForm source="beta_full" className="w-full max-w-[430px]" /> : <DownloadButton />}
          <Link href="/faq" className="group inline-flex items-center gap-1.5 rounded-[10px] border border-line2 bg-row px-[22px] py-[13px] font-display text-[16.5px] font-semibold tracking-[-.01em] text-txt hover:border-line3">Read the FAQ <span className="transition-transform group-hover:translate-x-0.5">→</span></Link>
        </Mount>
        <Mount as="p" delay={310} className="mt-4 text-[13px] text-muted">Mac only for now. You sign in with GitHub once the app is open. No card.</Mount>
        {pill && (
          <Mount delay={390} className="mt-[22px] inline-flex items-center gap-2.5 rounded-full border border-line2 bg-row px-4 py-[7px]">
            <Dot tone="go" /><span className="font-mono text-[13px] font-medium tabular-nums text-txt">{spotsLeft}</span><span className="text-[13px] text-muted">beta spots left · free until the beta ends</span>
          </Mount>
        )}
        {/* desktop scene */}
        <div className="mt-14 text-left">
          <div className="relative mx-auto w-full max-w-[1084px] lg:aspect-[1084/660]">
            <Reveal fx="scale" delay={100} duration={800} className="hidden lg:block lg:absolute lg:left-0 lg:top-0 lg:w-[900px]"><ConsoleWindow /></Reveal>
            <Reveal fx="panel" delay={420} duration={700} className="mx-auto w-full max-w-[440px] lg:absolute lg:right-0 lg:top-0 lg:mx-0 [&_figure]:shadow-[0_1px_1px_rgba(60,40,20,.14),0_12px_26px_rgba(60,40,20,.18),0_44px_90px_rgba(60,40,20,.32)]"><PanelWindow className="w-full lg:w-[440px]" /></Reveal>
          </div>
          <Reveal as="p" delay={0} className="mt-[22px] max-w-[62ch] text-[14.5px] leading-[1.6] text-body">The panel lives in the bottom corner of your screen. Move your mouse into the corner, a small badge appears, click it and the panel opens. Move away and it&apos;s gone.</Reveal>
          <Reveal as="p" delay={80} className="mt-3.5 max-w-[62ch] text-[14.5px] leading-[1.6] text-body">That&apos;s your side of it. Your agents don&apos;t use the panel. They read and write the same thing directly, through the plugin: who&apos;s where, what&apos;s claimed, what was decided, what&apos;s next. Everything below this is them doing that on their own.</Reveal>
        </div>
      </Section>

      <Beat h2="Every session starts already caught up." lede="Nobody writes a status. When a session opens, DevBrain hands the agent what happened since it last looked: who's active, what got merged, what was decided, what a teammate left half-done. It's put together from what actually happened, so it's never stale." note="It can dig further on its own, too. Before an agent goes exploring the codebase, it can ask the team's memory whether anyone has dealt with this before, and get back what past sessions learned, tried, and gave up on, with a name and a date on each.">
        <NumbersBand />
      </Beat>

      <Beat h2="It stops the second agent before it writes." lede={<>Lena&apos;s agent and Sam&apos;s agent both go for <code className="font-mono text-[14.5px] text-txt">auth.ts</code> around 9:14. Without DevBrain they find out at 4:30, from a merge conflict. With it, the second one gets stopped before it touches the file.</>} gap="mt-9">
        <CollisionPiece />
        <div className="mt-7"><GuardNote /></div>
      </Beat>

      <Beat h2="They stay out of each other's way on their own." lede="When an agent starts a task, it claims the files that task is likely to touch, and every other agent on the repo steers around them until the work lands. When your agent asks what's next, it gets the highest-priority task whose files nobody else is in. You never type a path." note="Claims let go by themselves. They release when the work lands and expire on a timer as a backstop, so a forgotten one never blocks anybody. Starting a bigger job, like a refactor or a migration? The agent claims the area up front with a one-line note, and everyone else's agent reads it.">
        <SentencesBand />
      </Beat>

      <Beat h2="Run more agents than you have people." lede="One command spawns another agent on a fresh clone of the repo. It shows up as its own session, gets its own guard and its own claims, and is handed a task whose files are free. Three of your own sessions coordinate with each other exactly the way three teammates would." note="Your spawned sessions are teammates too. Each shows up on the team board under its own name, and if one of them wanders into a file another one is in, it gets the same stop as it would from Lena.">
        <SpawnWindow />
      </Beat>

      <Beat h2="PRs merge themselves, in the right order." lede="Every open PR gets a light. Green means approved, conflict-free, and its turn. When two PRs touch the same files, the one that should land first goes green and the other one waits, so each takes a small rebase instead of one big mess at the end. Turn on auto-merge and DevBrain presses merge the moment a PR goes green, and keeps the waiting ones up to date with main." note="Every write is a branch and a PR, or the merge of a PR a person approved. Anything branch protection would block, DevBrain can't do either. Working alone? Flip one more switch and a clean PR that DevBrain's own review passed goes green, labelled as AI-reviewed so nobody mistakes it for a teammate's approval.">
        <SwitchBand />
      </Beat>

      <Section id="start" className="scroll-mt-20 pt-14 md:pt-[72px] lg:pt-[110px]">
        <DownloadCard spotsLeft={spotsLeft} maxTeams={maxTeams} full={full} />
      </Section>
    </>
  );
}

export function SiteHeader({ current }: { current?: "faq" } = {}) {
  return (
    <header className="sticky top-0 z-50 border-b border-line2 bg-[color:var(--wg-ink)]/70 backdrop-blur">
      <Section className="flex min-h-[58px] items-center gap-5">
        <Link href="/" aria-label="DevBrain home" className="-my-2 flex items-center gap-5 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brain.png" width={26} height={21} alt="" />
          <span className="font-display text-[17px] font-semibold tracking-[-.02em] text-txt">DevBrain</span>
        </Link>
        <nav className="ml-auto flex items-center gap-5 text-[13.5px] text-muted">
          {current === "faq" ? <span className="text-txt">FAQ</span> : <Link href="/faq" className="-my-2 py-2 hover:text-txt">FAQ</Link>}
          <DownloadButton size="nav" />
        </nav>
      </Section>
    </header>
  );
}

export function SiteFooter() {
  return (
    <Section className="pt-14">
      <Reveal as="footer" fx="fade" duration={400} className="border-t border-line2 pt-6">
        <div className="flex flex-wrap items-center gap-5 text-[13px] text-muted">
          <span>DevBrain</span>
          <Link href="/faq" className="-my-2 py-2 hover:text-txt">FAQ</Link>
          <Link href="/privacy" className="-my-2 py-2 hover:text-txt">Privacy</Link>
          <Link href="/terms" className="-my-2 py-2 hover:text-txt">Terms</Link>
        </div>
        <p className="mt-5 max-w-[86ch] text-[12px] leading-[1.6] text-muted">{LEGAL.trademarks}</p>
      </Reveal>
    </Section>
  );
}

export async function Landing({ nextParam, from, notice }: { nextParam?: string; from?: string; notice?: React.ReactNode }) {
  // Kept for signature compatibility with src/app/page.tsx (the sign-in
  // destination they used to carry); the body no longer needs them.
  void nextParam;
  void from;
  const beta = await loadBeta();
  const counts = beta.maxTeams !== null ? await platformCounts() : null;
  const spotsLeft = counts && beta.maxTeams !== null ? Math.max(0, beta.maxTeams - counts.teams) : null;
  const full = spotsLeft === 0;

  return (
    <main className="lp min-h-screen pb-24">
      <MotionGate />

      {notice && <Section className="pt-5">{notice}</Section>}

      <SiteHeader />

      <LandingBody spotsLeft={spotsLeft} maxTeams={beta.maxTeams} free={beta.free} full={full} />

      <SiteFooter />

      {beta.free && spotsLeft !== null && !full && <IncentiveModal spotsLeft={spotsLeft} maxTeams={beta.maxTeams ?? 0} />}
    </main>
  );
}
