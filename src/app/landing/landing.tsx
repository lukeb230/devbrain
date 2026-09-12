import Link from "next/link";
import { loadBeta, platformCounts } from "@/lib/beta";
import { PLANS, TRIAL_DAYS, dollars } from "@/lib/billing/plans";
import { SignInButton } from "../sign-in-button";
import { ConsoleWindow, Dot, PanelWindow, PrWindow, TerminalWindow } from "./app-shots";
import { EmailForm } from "./email-form";

// ============================================================================
// The landing page.
//
// THESIS: a Mac app's homepage shows the Mac app. The visual interest is the
// product itself — the Console, the panel, an agent's terminal, rebuilt
// faithfully in ./app-shots.tsx — and the page around them stays quiet so
// they carry it. Earlier versions dressed the page in a metaphor and drew
// abstract shapes inside it, which is what made them read as generic.
//
// OWN-WORLD: the app's own palette, pinned in globals.css under .lp — warm
// ivory ground, near-white surfaces, coral accent, the coral tint for the one
// thing that matters. Bricolage for display, Plex for UI and data.
//
// STORY: your agents work blind → DevBrain stops the second write → every
// session opens knowing what the last one found.
//
// Every number is real: spots from platform_counts(), prices from plans.ts.
// Everything inside a window is synthetic and labelled as such.
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

const Caption = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-3 font-mono text-[12px] text-muted">{children}</p>
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
            <a href="#how" className="-my-2 hidden py-2 hover:text-txt sm:inline">How it works</a>
            <Link href="/pricing" className="-my-2 py-2 hover:text-txt">Pricing</Link>
          </nav>
        </Section>
      </header>

      {/* ---- the claim + the product ------------------------------------ */}
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
          <Caption>The Console · synthetic team data</Caption>
        </div>
        <div className="mt-12 flex flex-wrap gap-5 lg:hidden">
          <PanelWindow tone="wait" name="Kai" host="Cursor" rows={[["holding", "src/api/**"], ["branch", "refactor/session-guard"]]} />
          <PanelWindow tone="stop" name="Nova" host="Claude Code" rows={[["stopped", "src/api/auth.ts"], ["reason", "Kai holds this lane"]]} />
        </div>
      </Section>

      {/* ---- the problem, shown ----------------------------------------- */}
      <Section className="pt-24 sm:pt-32">
        <H2>Right now, your agents are working blind.</H2>
        <Lede>Two sessions, one file. Neither one knows about the other, and you find out at the merge.</Lede>
        <div className="mt-8 flex flex-wrap gap-5">
          <PanelWindow tone="go" name="Nova" host="Claude Code" rows={[["writing", "src/api/auth.ts"], ["branch", "feat/login"]]} />
          <PanelWindow tone="go" name="Kai" host="Cursor" rows={[["writing", "src/api/auth.ts"], ["branch", "refactor/session-guard"]]} />
        </div>
        <p className="mt-6 flex items-center gap-2.5 text-[14px] text-muted"><Dot tone="stop" />Forty minutes of work, done twice.</p>
      </Section>

      {/* ---- the fix, immediately ---------------------------------------- */}
      <Section className="pt-20 sm:pt-24">
        <H2>DevBrain stops the second one.</H2>
        <Lede>A hook runs before your agent writes to any file. If a teammate is holding it, the write does not happen.</Lede>
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

      {/* ---- the payoff --------------------------------------------------- */}
      <Section className="pt-24 sm:pt-32">
        <H2>So every session opens already knowing.</H2>
        <div className="mt-8 grid items-start gap-8 lg:grid-cols-2">
          <TerminalWindow title="session start">
{`## Team context (DevBrain)

2 teammates active
  Kai   · src/api/**   claimed, session guard
  Rio   · tests/**     writing coverage

since you were last here
  #128 merged  · rate limiting
  decision     · tokens are hashed, never stored

waiting for you
  handoff from Rio · "auth tests need the new fixture"`}
          </TerminalWindow>
          <div>
            <p className="max-w-[46ch] text-[15.5px] leading-[1.6] text-body sm:text-[16.5px]">
              Injected into your agent&apos;s context at session start, every time. Nobody wrote it,
              nobody was asked for it, and nobody had to remember to read it.
            </p>
            <div className="mt-6"><PrWindow /></div>
            <Caption>Merge order, computed from the diffs</Caption>
          </div>
        </div>
      </Section>

      {/* ---- how it works -------------------------------------------------- */}
      <Section id="how" className="scroll-mt-20 pt-24 sm:pt-32">
        <H2>Three steps, then you forget it is there.</H2>
        <ol className="mt-8">
          {[
            ["Install the plugin", "One command in Claude Code, Cursor or Codex. No new editor, no new workflow."],
            ["Your agents check in", "Presence, claims and activity reach the team as the work happens."],
            ["Every session starts informed", "The brief above, injected automatically."],
          ].map(([t, b], i) => (
            <li key={t} className="grid grid-cols-[30px_minmax(0,1fr)] gap-4 border-t border-line2 py-5">
              <span className="pt-0.5 font-mono text-[12px] text-accenttext">{`0${i + 1}`}</span>
              <div>
                <h3 className="text-[16px] font-semibold text-txt">{t}</h3>
                <p className="mt-1 max-w-[58ch] text-[14px] leading-[1.6] text-muted">{b}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-5 max-w-[60ch] text-[13.5px] leading-[1.6] text-muted">
          An agent session you spawned counts as a teammate too — which is where most collisions come from.
        </p>
      </Section>

      {/* ---- price + objections -------------------------------------------- */}
      <Section className="pt-24 sm:pt-28">
        {beta.free ? (
          <>
            <H2>Free while the beta runs.</H2>
            <Lede>
              No card, no trial counting down. When the beta ends you get a {TRIAL_DAYS}-day trial and fair
              warning — nothing starts charging on its own. Afterwards it is {dollars(PLANS.base.priceCents)} or{" "}
              {dollars(PLANS.scale.priceCents)} a month for the whole team, not per seat.{" "}
              <Link href="/pricing" className="text-accenttext hover:underline">See the plans</Link>.
            </Lede>
          </>
        ) : (
          <>
            <H2>Per team, not per seat.</H2>
            <Lede>
              {dollars(PLANS.base.priceCents)} or {dollars(PLANS.scale.priceCents)} a month for the whole
              team, with a {TRIAL_DAYS}-day trial.{" "}
              <Link href="/pricing" className="text-accenttext hover:underline">See the plans</Link>.
            </Lede>
          </>
        )}

        <div className="mt-10 grid gap-x-12 sm:grid-cols-2">
          {[
            { q: "Does it see my source code?", a: <>No — metadata only: who is active, which files were touched, PR records, redacted summaries. The <Link href="/privacy" className="text-accenttext hover:underline">privacy page</Link> lists every field.</> },
            { q: "Do we all have to use the same agent?", a: <>No. Claude Code, Cursor and Codex report the same way and see each other.</> },
            { q: "What about sessions I spawn myself?", a: <>They are teammates too — which is where most collisions come from.</> },
            { q: "Do I need the Mac app?", a: <>Coordination runs in a CLI and a plugin. The Console is a Mac app today.</> },
          ].map((f) => (
            <div key={f.q} className="border-t border-line2 py-4">
              <h3 className="text-[14.5px] font-semibold text-txt">{f.q}</h3>
              <p className="mt-1.5 max-w-[52ch] text-[13.5px] leading-[1.6] text-muted">{f.a}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ---- close ---------------------------------------------------------- */}
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
              <p className="mt-3 text-[13px] text-muted">Read-only GitHub sign-in · nothing installed yet.</p>
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
          <Link href="/pricing" className="-my-2 py-2 hover:text-txt">Pricing</Link>
          <Link href="/privacy" className="-my-2 py-2 hover:text-txt">Privacy</Link>
          <Link href="/terms" className="-my-2 py-2 hover:text-txt">Terms</Link>
        </footer>
      </Section>
    </main>
  );
}
