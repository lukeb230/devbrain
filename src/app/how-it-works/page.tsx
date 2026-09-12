import type { Metadata } from "next";
import Link from "next/link";
import { loadBeta, platformCounts } from "@/lib/beta";
import { LEGAL } from "@/lib/legal";
import { PLANS, TRIAL_DAYS, dollars } from "@/lib/billing/plans";
import { ConsoleWindow, Dot, PanelWindow, PrWindow } from "@/app/landing/app-shots";
import { BRIEF, COLLISION, Terminal } from "@/app/landing/terminal";
import { TryIt } from "@/app/landing/try-it";
import { BrowserShell } from "../browser-shell";
import { SignInButton } from "../sign-in-button";

// ============================================================================
// /how-it-works — the depth the landing page deliberately skips.
//
// Written outcome-first on purpose. It says what happens and why that works,
// and stops short of the blueprint: which hooks fire in what order, how lanes
// and footprints are modelled, how merge order is computed. That is not
// coyness for its own sake — a reader has to finish this page understanding
// the shape well enough to trust it, or the restraint reads as a gimmick.
//
// Rule for edits: describe behaviour a customer can observe. Leave the
// implementation to the docs a customer gets after they sign in.
// ============================================================================

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "How it works",
  description: "DevBrain rides along inside the agent you already use: it knows what your teammates are holding before your agent writes, and carries the team's state into every session.",
};

const Section = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <section className={`mx-auto w-full max-w-[1140px] px-6 sm:px-8 ${className}`}>{children}</section>
);

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="max-w-[22ch] font-display text-[25px] font-medium leading-[1.1] tracking-[-.026em] text-txt text-balance sm:text-[34px]">{children}</h2>
);

const Lede = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-4 max-w-[56ch] text-[15.5px] leading-[1.65] text-body sm:text-[16.5px]">{children}</p>
);

export default async function HowItWorks() {
  const beta = await loadBeta();
  const counts = beta.maxTeams !== null ? await platformCounts() : null;
  const spotsLeft = counts && beta.maxTeams !== null ? Math.max(0, beta.maxTeams - counts.teams) : null;

  return (
    <BrowserShell>
      <main className="lp min-h-screen pb-24">
        <header className="sticky top-0 z-50 border-b border-line2 bg-[color:var(--wg-ink)]/70 backdrop-blur">
          <Section className="flex min-h-[58px] items-center gap-5">
            <Link href="/" className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brain.png" width={26} height={21} alt="" />
              <span className="font-display text-[17px] font-semibold tracking-[-.02em] text-txt">DevBrain</span>
            </Link>
            <nav className="ml-auto flex items-center gap-5 text-[13.5px] text-muted">
              <span className="text-txt">How it works</span>
              <Link href="/pricing" className="-my-2 py-2 hover:text-txt">Pricing</Link>
            </nav>
          </Section>
        </header>

        <Section className="pt-14 sm:pt-20">
          <h1 className="max-w-[17ch] font-display text-[36px] font-medium leading-[1.02] tracking-[-.035em] text-txt text-balance sm:text-[56px]">
            It rides along inside the agent you already use.
          </h1>
          <Lede>
            No new editor, no second window to keep open, nothing for your team to remember. DevBrain
            installs into Claude Code, Cursor or Codex, and from then on it is present at the two
            moments that matter: when a session starts, and just before your agent writes.
          </Lede>
        </Section>

        {/* ---- 1 ---------------------------------------------------------- */}
        <Section className="pt-20 sm:pt-24">
          <H2>Your agents start reporting, without being asked.</H2>
          <Lede>
            One command installs it. After that, every session announces itself to the team — which
            repo, which branch, which files it is touching — and lets go when it ends. Nobody types a
            status. A session you spawned yourself counts the same as a teammate, because to everyone
            else on the team the difference does not matter.
          </Lede>
          <div className="mt-8 flex flex-wrap gap-5">
            <PanelWindow tone="wait" name="Kai" host="Cursor" rows={[["holding", "src/api/**"], ["branch", "refactor/session-guard"], ["since", "24 minutes ago"]]} />
            <PanelWindow tone="go" name="Rio" host="Codex" rows={[["writing", "tests/auth.spec.ts"], ["branch", "chore/coverage"], ["since", "8 minutes ago"]]} />
          </div>
        </Section>

        {/* ---- 2 ---------------------------------------------------------- */}
        <Section className="pt-20 sm:pt-24">
          <H2>Before a write, it already knows the answer.</H2>
          <Lede>
            When your agent is about to change a file, DevBrain has already checked it against what the
            rest of the team is holding. If the file is inside somebody&apos;s work, your agent stops and
            says so, in its own output, before anything is written. You can still go ahead — but now it
            is a decision rather than an accident.
          </Lede>
          <Terminal
            className="mt-8"
            title="nova — claude code — northwind/api"
            lines={COLLISION}
            caption="Synthetic session · this is the agent's own output"
          />
          <div className="mt-12">
            <h3 className="font-display text-[19px] font-medium tracking-[-.02em] text-txt">Try the check.</h3>
            <p className="mt-2 max-w-[54ch] text-[14px] leading-[1.6] text-muted">
              Two of these are being worked on. Pick any file and see what comes back.
            </p>
            <div className="mt-6"><TryIt /></div>
          </div>
          <p className="mt-6 max-w-[56ch] text-[14px] leading-[1.6] text-muted">
            It is the same check whichever agent you run, so a teammate on Cursor and a teammate on
            Claude Code see each other without either of them doing anything.
          </p>
        </Section>

        {/* ---- 3 ---------------------------------------------------------- */}
        <Section className="pt-20 sm:pt-24">
          <H2>Every session opens knowing what the last one found.</H2>
          <Lede>
            At the start of a session, the team&apos;s current state is put in front of your agent: who is
            active, what is claimed, what merged since you were last here, what was decided, and
            anything a teammate left for you. It is not a document anyone maintains — it is assembled
            from what actually happened.
          </Lede>
          <div className="mt-8 grid items-start gap-8 lg:grid-cols-2">
            <Terminal title="session start" lines={BRIEF} />
            <div>
              <p className="max-w-[46ch] text-[15.5px] leading-[1.6] text-body">
                The same picture is what tells you which pull requests are safe to merge, and in which
                order, when two of them touch the same ground.
              </p>
              <div className="mt-6"><PrWindow /></div>
              <p className="mt-3 font-mono text-[12px] text-muted">Merge order · synthetic data</p>
            </div>
          </div>
        </Section>

        {/* ---- the surfaces ------------------------------------------------ */}
        <Section className="pt-24 sm:pt-32">
          <H2>And a place to look when you want to.</H2>
          <Lede>
            Most of the time you never open it — that is the point. The Console is there for when you
            want the whole picture: who is working, what is claimed, what the team has learned, and
            which pull requests are waiting on which.
          </Lede>
          <div className="mt-8 hidden lg:block">
            <ConsoleWindow />
            <p className="mt-3 font-mono text-[12px] text-muted">The Console · synthetic team data</p>
          </div>
        </Section>

        {/* ---- objections --------------------------------------------------- */}
        <Section className="pt-24 sm:pt-28">
          <H2>Before you ask</H2>
          <div className="mt-8 grid gap-x-12 sm:grid-cols-2">
            {[
              { q: "Does it see my source code?", a: <>No. It stores metadata — who is active, which files were touched, pull-request records and redacted session summaries. Not file contents. The <Link href="/privacy" className="text-accenttext hover:underline">privacy page</Link> lists every field it keeps.</> },
              { q: "Do we all have to use the same agent?", a: <>No. Claude Code, Cursor and Codex report the same way and see each other. A team can be split across all three.</> },
              { q: "What about sessions I spawn myself?", a: <>They are teammates too, with their own presence and claims — which is where most collisions come from in the first place.</> },
              { q: "Does it write to my repositories?", a: <>Its GitHub access is read-oriented and it does not push code. It reads pull-request metadata through a GitHub App you install per repo.</> },
              { q: "Do I need the Mac app?", a: <>The coordination runs in a CLI and an agent plugin. The Console and the live panel are a Mac app today; other platforms are not built yet.</> },
              { q: "What does it cost?", a: <>{beta.free ? <>Nothing while the beta runs — no card, no trial counting down. Afterwards {dollars(PLANS.base.priceCents)} or {dollars(PLANS.scale.priceCents)} a month for the whole team, not per seat.</> : <>{dollars(PLANS.base.priceCents)} or {dollars(PLANS.scale.priceCents)} a month for the whole team, not per seat, with a {TRIAL_DAYS}-day trial.</>} <Link href="/pricing" className="text-accenttext hover:underline">See the plans</Link>.</> },
            ].map((f) => (
              <div key={f.q} className="border-t border-line2 py-4">
                <h3 className="text-[14.5px] font-semibold text-txt">{f.q}</h3>
                <p className="mt-1.5 max-w-[52ch] text-[13.5px] leading-[1.6] text-muted">{f.a}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ---- close --------------------------------------------------------- */}
        <Section className="pt-20 sm:pt-24">
          <div className="rounded-2xl border border-line2 bg-row px-6 py-10 sm:px-11 sm:py-12">
            <H2>Put it on one repo and watch what happens.</H2>
            <Lede>
              Sign in, link a repo, install the plugin. The next session anyone on your team starts will
              already know about the others.
            </Lede>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <SignInButton />
              {beta.free && spotsLeft !== null && spotsLeft > 0 && (
                <span className="inline-flex items-center gap-2.5 text-[13px] text-muted">
                  <Dot tone="go" />
                  <span className="font-mono tabular-nums text-txt">{spotsLeft}</span> of {beta.maxTeams} beta places · free while it runs
                </span>
              )}
            </div>
          </div>
        </Section>

        <Section className="pt-14">
          <footer className="border-t border-line2 pt-6">
            <div className="flex flex-wrap items-center gap-5 text-[13px] text-muted">
              <Link href="/" className="-my-2 py-2 hover:text-txt">DevBrain</Link>
              <Link href="/pricing" className="-my-2 py-2 hover:text-txt">Pricing</Link>
              <Link href="/privacy" className="-my-2 py-2 hover:text-txt">Privacy</Link>
              <Link href="/terms" className="-my-2 py-2 hover:text-txt">Terms</Link>
            </div>
            <p className="mt-5 max-w-[86ch] text-[12px] leading-[1.6] text-muted">{LEGAL.trademarks}</p>
          </footer>
        </Section>
      </main>
    </BrowserShell>
  );
}
