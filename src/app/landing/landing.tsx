import Link from "next/link";
import { loadBeta, platformCounts } from "@/lib/beta";
import { PLANS, TRIAL_DAYS, dollars } from "@/lib/billing/plans";
import { SignInButton } from "../sign-in-button";
import { Constellation } from "./constellation";
import { EmailForm } from "./email-form";
import { Dot, Mono, Panel, Row, Terminal } from "./ui";

// ============================================================================
// The landing page. Five beats, then the details:
//
//   1  the claim            work like you're the only one in the repo
//   2  the problem          shown, in two rows, not described
//   3  the fix              the agent's own output, immediately after
//   4  without / with       the same three moments, side by side, real UI
//   5  the payoff           what a session starts knowing
//
// Built from the app's own vocabulary (./ui.tsx) so the page and the product
// look like one thing. Where an earlier version explained in paragraphs, this
// one shows the instrument and says less.
//
// Every number is real: spots from platform_counts(), prices from plans.ts.
// ============================================================================

const Section = ({ id, children, className = "" }: { id?: string; children: React.ReactNode; className?: string }) => (
  <section id={id} className={`mx-auto w-full max-w-[1020px] px-6 sm:px-8 ${className}`}>{children}</section>
);

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="max-w-[22ch] font-display text-[30px] font-medium leading-[1.1] tracking-[-.025em] text-txt text-balance sm:text-[38px]">{children}</h2>
);

export async function Landing({ nextParam, from, notice }: { nextParam?: string; from?: string; notice?: React.ReactNode }) {
  const beta = await loadBeta();
  const counts = beta.maxTeams !== null ? await platformCounts() : null;
  const spotsLeft = counts && beta.maxTeams !== null ? Math.max(0, beta.maxTeams - counts.teams) : null;
  const full = spotsLeft === 0;
  const signInNext = nextParam || (from === "desk" ? "/desk" : undefined);

  return (
    <main className="lp min-h-screen bg-ink pb-28">
      {notice && <Section className="pt-5">{notice}</Section>}

      <header className="border-b border-line">
        <Section className="flex items-center gap-3 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brain.png" width={28} height={23} alt="" />
          <span className="font-display text-[16px] font-semibold tracking-[-.02em] text-txt">DevBrain</span>
          <nav className="ml-auto flex items-center gap-6 text-[13px] text-muted">
            <a href="#how" className="-my-2 py-2 hover:text-txt">How it works</a>
            <Link href="/pricing" className="-my-2 py-2 hover:text-txt">Pricing</Link>
          </nav>
        </Section>
      </header>

      {/* ---- 1. the claim ------------------------------------------------ */}
      <Section className="pt-14 sm:pt-20">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div>
            <h1 className="font-display text-[42px] font-medium leading-[1.03] tracking-[-.04em] text-txt text-balance sm:text-[58px]">
              Work like you&apos;re the only one in the repo.
            </h1>
            <p className="mt-6 max-w-[50ch] text-[17px] leading-[1.6] text-body">
              You&apos;re not. Every agent on your team knows who is editing what, what just merged,
              and what was decided — so nobody has to ask.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-5">
              {full ? <EmailForm source="beta_full" className="w-full max-w-[430px]" /> : <SignInButton next={signInNext} />}
              <a href="#how" className="-my-2 py-2 text-[13.5px] text-accent hover:underline">See how it works</a>
            </div>
            <p className="mt-4 max-w-[46ch] text-[13px] leading-[1.6] text-muted">
              Read-only GitHub sign-in. No card, nothing installed yet.
            </p>

            {beta.free && spotsLeft !== null && !full && (
              <div className="mt-8 inline-flex items-center gap-3 rounded-lg border border-line bg-row px-3.5 py-2.5">
                <Dot tone="go" />
                <span className="font-mono text-[12.5px] tabular-nums text-txt">{spotsLeft}</span>
                <span className="text-[12.5px] text-muted">of {beta.maxTeams} beta spots open · free while it runs</span>
              </div>
            )}
          </div>
          <Constellation />
        </div>
      </Section>

      {/* ---- 2. the problem, shown ---------------------------------------- */}
      <Section className="pt-20 sm:pt-28">
        <H2>Right now, your agents are working blind.</H2>
        <div className="mt-9 grid gap-2.5 sm:max-w-[560px]">
          <Row tone="go" name="Nova" host="Claude Code">
            writing <Mono>src/api/auth.ts</Mono>
          </Row>
          <Row tone="go" name="Kai" host="Cursor">
            writing <Mono>src/api/auth.ts</Mono>
          </Row>
          <div className="flex items-center gap-2 pt-1 text-[13px] text-muted">
            <Dot tone="stop" />
            Neither one knows about the other. You find out at the merge.
          </div>
        </div>
      </Section>

      {/* ---- 3. the fix, immediately -------------------------------------- */}
      <Section className="pt-14">
        <H2>DevBrain stops the second one.</H2>
        <div className="mt-9">
          <Terminal head="agent stopped · src/api/auth.ts" foot="The warning your agent prints, word for word.">
{`DevBrain: src/api/auth.ts is being worked on right now by
Kai (claimed: refactoring the session guard). Editing it anyway
risks a collision — coordinate first, or approve to proceed
deliberately.`}
          </Terminal>
        </div>
        <p className="mt-7 max-w-[62ch] text-[15px] leading-[1.65] text-body">
          Before the write, not after the merge. A decision, while it still costs nothing to make.
        </p>
      </Section>

      {/* ---- 4. without / with --------------------------------------------- */}
      <Section className="pt-20 sm:pt-28">
        <H2>The same three moments, with and without.</H2>
        <div className="mt-9 grid gap-5 md:grid-cols-2">
          <Panel tone="bad" title="Without DevBrain">
            <Row tone="go" name="Two agents, one file">
              both writing <Mono>src/api/auth.ts</Mono>
            </Row>
            <Row tone="stop" name="Merge conflict" flag="stop">
              <Mono>3 files</Mono> · 40 minutes of work redone
            </Row>
            <div className="h-px bg-line" />
            <Row tone="idle" name="Session ends">
              what it learned goes with it
            </Row>
            <Row tone="stop" name="Next session" flag="stop">
              starts from nothing, asks the same questions
            </Row>
            <div className="h-px bg-line" />
            <Row tone="idle" name="Two PRs, same area">
              merged in the order they were opened
            </Row>
            <Row tone="stop" name="main is broken" flag="stop">
              the second one needed the first
            </Row>
          </Panel>

          <Panel tone="good" title="With DevBrain">
            <Row tone="wait" name="Kai holds the lane">
              claimed <Mono>src/api/**</Mono>
            </Row>
            <Row tone="go" name="Nova is stopped" flag="go">
              told before the write · no conflict
            </Row>
            <div className="h-px bg-line" />
            <Row tone="idle" name="Session ends">
              leaves a handoff and a journal
            </Row>
            <Row tone="go" name="Next session" flag="go">
              opens knowing what the last one found
            </Row>
            <div className="h-px bg-line" />
            <Row tone="idle" name="Two PRs, same area">
              DevBrain reads both diffs
            </Row>
            <Row tone="go" name="Merge order shown" flag="go">
              <Mono>#128</Mono> first, then <Mono>#131</Mono>
            </Row>
          </Panel>
        </div>
      </Section>

      {/* ---- 5. the payoff -------------------------------------------------- */}
      <Section className="pt-20 sm:pt-28">
        <H2>So every session opens already knowing.</H2>
        <div className="mt-9 grid items-start gap-8 lg:grid-cols-[minmax(0,440px)_1fr]">
          <Terminal head="session start · team brief">
{`2 teammates active
  Kai   · src/api/**   claimed, session guard
  Rio   · tests/**     writing coverage

since you were last here
  #128 merged  · rate limiting
  decision     · tokens are hashed, never stored

waiting for you
  handoff from Rio · "auth tests need the new fixture"`}
          </Terminal>
          <p className="max-w-[46ch] text-[15px] leading-[1.65] text-body">
            Injected into your agent&apos;s context at session start, every time. Nobody wrote it,
            nobody was asked for it, and nobody had to remember to read it.
            <span className="mt-4 block text-muted">
              That is the whole idea: the coordination happens, and none of it is your job.
            </span>
          </p>
        </div>
      </Section>

      {/* ---- how it works ---------------------------------------------------- */}
      <Section id="how" className="scroll-mt-8 pt-20 sm:pt-28">
        <H2>Three steps, then you forget it is there.</H2>
        <ol className="mt-9 grid gap-6 border-l border-line pl-6 sm:pl-8">
          {[
            ["Install the plugin", <>One command in Claude Code, Cursor or Codex. No new editor, no new workflow.</>],
            ["Your agents check in", <>Presence, claims and activity go to the team as work happens.</>],
            ["Every session starts informed", <>The brief above, injected automatically.</>],
          ].map(([t, b], i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[26px] top-[7px] h-[7px] w-[7px] rounded-full bg-accent sm:-left-[34px]" />
              <h3 className="text-[16px] font-medium text-txt">{t}</h3>
              <p className="mt-1 max-w-[60ch] text-[13.5px] leading-[1.6] text-muted">{b}</p>
            </li>
          ))}
        </ol>
        <p className="mt-7 max-w-[60ch] text-[13.5px] leading-[1.6] text-muted">
          An agent session you spawned counts as a teammate too — which is where most collisions
          come from.
        </p>
      </Section>

      {/* ---- price ------------------------------------------------------------ */}
      <Section className="pt-20 sm:pt-28">
        {beta.free ? (
          <>
            <H2>Free while the beta runs.</H2>
            <p className="mt-4 max-w-[62ch] text-[15px] leading-[1.65] text-body">
              No card, no trial counting down. When the beta ends you get a {TRIAL_DAYS}-day trial and
              fair warning — nothing starts charging on its own. Afterwards it is{" "}
              {dollars(PLANS.base.priceCents)} or {dollars(PLANS.scale.priceCents)} a month for the
              whole team, not per seat. <Link href="/pricing" className="text-accent hover:underline">See the plans</Link>.
            </p>
          </>
        ) : (
          <>
            <H2>Per team, not per seat.</H2>
            <p className="mt-4 max-w-[62ch] text-[15px] leading-[1.65] text-body">
              {dollars(PLANS.base.priceCents)} or {dollars(PLANS.scale.priceCents)} a month for the
              whole team, with a {TRIAL_DAYS}-day trial.{" "}
              <Link href="/pricing" className="text-accent hover:underline">See the plans</Link>.
            </p>
          </>
        )}
      </Section>

      {/* ---- objections -------------------------------------------------------- */}
      <Section className="pt-16 sm:pt-20">
        <div className="grid gap-x-12 sm:grid-cols-2">
          {[
            { q: "Does it see my source code?", a: <>No — metadata only: who is active, which files were touched, PR records, redacted summaries. The <Link href="/privacy" className="text-accent hover:underline">privacy page</Link> lists every field.</> },
            { q: "Do we all have to use the same agent?", a: <>No. Claude Code, Cursor and Codex report the same way and see each other.</> },
            { q: "What about sessions I spawn myself?", a: <>They are teammates too — which is where most collisions come from.</> },
            { q: "Do I need the Mac app?", a: <>Coordination runs in a CLI and a plugin. The Console is a Mac app today.</> },
          ].map((f) => (
            <div key={f.q} className="border-t border-line py-5">
              <h3 className="text-[14.5px] font-medium text-txt">{f.q}</h3>
              <p className="mt-1.5 max-w-[52ch] text-[13px] leading-[1.6] text-muted">{f.a}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ---- close -------------------------------------------------------------- */}
      <Section id="start" className="scroll-mt-8 pt-16 sm:pt-20">
        <div className="rounded-2xl border border-line2 bg-row px-6 py-9 sm:px-11 sm:py-12">
          {full ? (
            <>
              <H2>The beta is full — get the next spot.</H2>
              <p className="mt-4 max-w-[52ch] text-[15px] leading-[1.6] text-body">
                All {beta.maxTeams} spots are taken. Leave an address and you will hear when one opens.
              </p>
              <EmailForm source="beta_full" className="mt-8 max-w-[440px]" />
            </>
          ) : (
            <>
              <H2>Put it on one repo and watch what happens.</H2>
              <p className="mt-4 max-w-[52ch] text-[15px] leading-[1.6] text-body">
                Sign in, link a repo, install the plugin. The next session anyone starts will already
                know about the others.
              </p>
              <div className="mt-8"><SignInButton next={signInNext} /></div>
              <div className="mt-8 border-t border-line pt-6">
                <p className="text-[13.5px] text-muted">Not ready today? Leave an address.</p>
                <EmailForm className="mt-4 max-w-[440px]" />
              </div>
            </>
          )}
        </div>
      </Section>

      <Section className="pt-14">
        <footer className="flex flex-wrap items-center gap-5 border-t border-line pt-7 text-[12.5px] text-muted">
          <span>DevBrain</span>
          <Link href="/pricing" className="-my-2 py-2 hover:text-txt">Pricing</Link>
          <Link href="/privacy" className="-my-2 py-2 hover:text-txt">Privacy</Link>
          <Link href="/terms" className="-my-2 py-2 hover:text-txt">Terms</Link>
        </footer>
      </Section>
    </main>
  );
}
