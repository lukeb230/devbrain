import Link from "next/link";
import { loadBeta, platformCounts } from "@/lib/beta";
import { SignInButton } from "../sign-in-button";
import { ConsoleWindow, Dot, PanelWindow, TerminalWindow } from "./app-shots";
import { EmailForm } from "./email-form";

// ============================================================================
// The landing page. Four beats and nothing else:
//
//   the hook      work like you're the only one in the repo
//   1 problem     two agents, one file, shown
//   2 fix         the agent's own output, stopping the write
//   3 why         what changes — the session that opens knowing
//   4 sign up
//
// Depth lives at /how-it-works. A visitor who wants the mechanism clicks; a
// visitor who wants to try it is never more than one screen from the button.
//
// Every number is real (platform_counts()). Everything inside a window is
// synthetic and captioned as such.
// ============================================================================

const Section = ({ id, children, className = "" }: { id?: string; children: React.ReactNode; className?: string }) => (
  <section id={id} className={`mx-auto w-full max-w-[1140px] px-6 sm:px-8 ${className}`}>{children}</section>
);

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="max-w-[20ch] font-display text-[26px] font-medium leading-[1.08] tracking-[-.028em] text-txt text-balance sm:text-[38px]">{children}</h2>
);

const Lede = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-4 max-w-[54ch] text-[15.5px] leading-[1.6] text-body sm:text-[16.5px]">{children}</p>
);

export async function Landing({ nextParam, from, notice }: { nextParam?: string; from?: string; notice?: React.ReactNode }) {
  const beta = await loadBeta();
  const counts = beta.maxTeams !== null ? await platformCounts() : null;
  const spotsLeft = counts && beta.maxTeams !== null ? Math.max(0, beta.maxTeams - counts.teams) : null;
  const full = spotsLeft === 0;
  const signInNext = nextParam || (from === "desk" ? "/desk" : undefined);

  return (
    <main className="lp min-h-screen pb-24">
      {notice && <Section className="pt-5">{notice}</Section>}

      <header className="sticky top-0 z-50 border-b border-line2 bg-[color:var(--wg-ink)]/70 backdrop-blur">
        <Section className="flex min-h-[58px] items-center gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brain.png" width={26} height={21} alt="" />
          <span className="font-display text-[17px] font-semibold tracking-[-.02em] text-txt">DevBrain</span>
          <nav className="ml-auto flex items-center gap-5 text-[13.5px] text-muted">
            <Link href="/how-it-works" className="-my-2 py-2 hover:text-txt">How it works</Link>
            <Link href="/pricing" className="-my-2 py-2 hover:text-txt">Pricing</Link>
          </nav>
        </Section>
      </header>

      {/* ---- the hook ---------------------------------------------------- */}
      <Section className="pt-14 sm:pt-[70px]">
        <h1 className="font-display text-[40px] font-medium leading-[1.0] tracking-[-.035em] text-txt text-balance sm:text-[68px]">
          Work like you&apos;re the <span className="text-accenttext">only one</span> in the repo.
        </h1>
        <Lede>
          You&apos;re not. Every agent on your team sees who is editing what, what just merged, and what
          was decided — so nobody has to ask.
        </Lede>

        <div className="mt-7 flex flex-wrap items-center gap-4">
          {full ? <EmailForm source="beta_full" className="w-full max-w-[430px]" /> : <SignInButton next={signInNext} />}
          <span className="text-[13px] text-muted">Read-only GitHub sign-in · no card · nothing installed yet</span>
        </div>

        {beta.free && spotsLeft !== null && !full && (
          <div className="mt-6 inline-flex items-center gap-2.5 rounded-full border border-line2 bg-row px-4 py-[7px]">
            <Dot tone="go" />
            <span className="font-mono text-[13px] font-medium tabular-nums text-txt">{spotsLeft}</span>
            <span className="text-[13px] text-muted">of {beta.maxTeams} beta places · free while it runs</span>
          </div>
        )}

        <div className="mt-12 hidden sm:mt-14 lg:block">
          <ConsoleWindow />
          <p className="mt-3 font-mono text-[12px] text-muted">The Console · synthetic team data</p>
        </div>
      </Section>

      {/* ---- 1. the problem ---------------------------------------------- */}
      <Section className="pt-24 sm:pt-32">
        <H2>Your agents are working blind.</H2>
        <Lede>Two sessions, one file. Neither one knows about the other, and you find out at the merge.</Lede>
        <div className="mt-8 flex flex-wrap gap-5">
          <PanelWindow tone="go" name="Nova" host="Claude Code" rows={[["writing", "src/api/auth.ts"], ["branch", "feat/login"]]} />
          <PanelWindow tone="go" name="Kai" host="Cursor" rows={[["writing", "src/api/auth.ts"], ["branch", "refactor/session-guard"]]} />
        </div>
        <p className="mt-6 flex items-center gap-2.5 text-[14px] text-muted"><Dot tone="stop" />Forty minutes of work, done twice.</p>
      </Section>

      {/* ---- 2. the fix --------------------------------------------------- */}
      <Section className="pt-20 sm:pt-24">
        <H2>DevBrain stops the second one.</H2>
        <Lede>Before your agent writes to a file, it already knows whether a teammate is holding it.</Lede>
        <div className="mt-8">
          <TerminalWindow title="nova — claude code — northwind/api" caption="The warning your agent prints, word for word">
{`› Edit src/api/auth.ts

⏺ DevBrain: src/api/auth.ts is being worked on right now by
  Kai (claimed: refactoring the session guard). Editing it anyway
  risks a collision — coordinate first, or approve to proceed
  deliberately.

? Proceed anyway?   ❯ No, coordinate first    Yes, I know`}
          </TerminalWindow>
        </div>
      </Section>

      {/* ---- 3. why it matters -------------------------------------------- */}
      <Section className="pt-24 sm:pt-32">
        <H2>Which means nobody has to keep track.</H2>
        <Lede>
          No standup to find out what changed. No message asking whether anyone is in that file. No
          session starting from nothing because the last one ended. The coordination still happens —
          it is simply not your job any more.
        </Lede>
        <div className="mt-8 grid gap-5 sm:grid-cols-3">
          {[
            ["Collisions stop before the write", "Not a conflict to resolve later — an edit that never happened."],
            ["Context survives the session", "What one session learned is there for the next one, and for everyone else."],
            ["The team stays current", "What merged, what was decided, what is claimed — carried in, automatically."],
          ].map(([t, b]) => (
            <div key={t} className="rounded-xl border border-line2 bg-row px-5 py-[18px]">
              <h3 className="text-[15px] font-semibold leading-[1.35] text-txt">{t}</h3>
              <p className="mt-2 text-[13.5px] leading-[1.6] text-muted">{b}</p>
            </div>
          ))}
        </div>
        <p className="mt-7 text-[14px] text-muted">
          <Link href="/how-it-works" className="font-medium text-accenttext hover:underline">See how it works →</Link>
        </p>
      </Section>

      {/* ---- 4. sign up ---------------------------------------------------- */}
      <Section id="start" className="scroll-mt-20 pt-20 sm:pt-24">
        <div className="rounded-2xl border border-line2 bg-row px-6 py-10 sm:px-11 sm:py-12">
          {full ? (
            <>
              <H2>The beta is full — get the next place.</H2>
              <Lede>All {beta.maxTeams} places are taken. Leave an address and you will hear when one opens.</Lede>
              <EmailForm source="beta_full" className="mt-7 max-w-[440px]" />
            </>
          ) : (
            <>
              <H2>Put it on one repo and watch what happens.</H2>
              <Lede>
                Sign in, link a repo, install the plugin. The next session anyone on your team starts will
                already know about the others.
              </Lede>
              <div className="mt-7"><SignInButton next={signInNext} /></div>
              <p className="mt-3 text-[13px] text-muted">
                Read-only GitHub sign-in · nothing installed yet{beta.free ? " · free while the beta runs" : ""}.
              </p>
              <div className="mt-9 border-t border-line pt-6">
                <p className="text-[13.5px] text-muted">Not ready today? Leave an address.</p>
                <EmailForm className="mt-4 max-w-[440px]" />
              </div>
            </>
          )}
        </div>
      </Section>

      <Section className="pt-14">
        <footer className="flex flex-wrap items-center gap-5 border-t border-line2 pt-6 text-[13px] text-muted">
          <span>DevBrain</span>
          <Link href="/how-it-works" className="-my-2 py-2 hover:text-txt">How it works</Link>
          <Link href="/pricing" className="-my-2 py-2 hover:text-txt">Pricing</Link>
          <Link href="/privacy" className="-my-2 py-2 hover:text-txt">Privacy</Link>
          <Link href="/terms" className="-my-2 py-2 hover:text-txt">Terms</Link>
        </footer>
      </Section>
    </main>
  );
}
