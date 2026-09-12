import Link from "next/link";
import { loadBeta, platformCounts } from "@/lib/beta";
import { PLANS, TRIAL_DAYS, dollars } from "@/lib/billing/plans";
import { SignInButton } from "../sign-in-button";
import { Constellation } from "./constellation";
import { EmailForm } from "./email-form";

// ============================================================================
// The landing page. One page, one job: someone who runs coding agents with
// other people should understand the problem in ten seconds, believe DevBrain
// solves it in thirty, and have exactly one thing to click.
//
// Everything here that looks like a number is one — spots left comes from
// platform_counts(), the plans come from plans.ts. Nothing to keep in sync by
// hand, and nothing that can still say "free" the day the beta ends.
// ============================================================================

const Section = ({ id, children, className = "" }: { id?: string; children: React.ReactNode; className?: string }) => (
  <section id={id} className={`mx-auto w-full max-w-[1000px] px-6 sm:px-8 ${className}`}>{children}</section>
);

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <div className="font-mono text-[10.5px] uppercase tracking-[.14em] text-accenttext">{children}</div>
);

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="font-display text-[28px] font-medium leading-[1.15] tracking-[-.02em] text-txt text-balance sm:text-[34px]">{children}</h2>
);

export async function Landing({ nextParam, from, notice }: { nextParam?: string; from?: string; notice?: React.ReactNode }) {
  const beta = await loadBeta();
  const counts = beta.maxTeams !== null ? await platformCounts() : null;
  const spotsLeft = counts && beta.maxTeams !== null ? Math.max(0, beta.maxTeams - counts.teams) : null;
  const full = spotsLeft === 0;
  const signInNext = nextParam || (from === "desk" ? "/desk" : undefined);

  return (
    <main className="pb-24">
      {notice && <Section className="pt-5">{notice}</Section>}

      {/* ---- nav ------------------------------------------------------- */}
      <Section className="flex items-center gap-5 py-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brain.png" width={32} height={26} alt="" />
        <span className="font-display text-[17px] font-semibold tracking-[-.02em] text-txt">DevBrain</span>
        <nav className="ml-auto flex items-center gap-5 text-[12.5px] text-muted">
          <a href="#how" className="-my-1.5 py-1.5 hover:text-txt">How it works</a>
          <Link href="/pricing" className="-my-1.5 py-1.5 hover:text-txt">Pricing</Link>
        </nav>
      </Section>

      {/* ---- hero ------------------------------------------------------ */}
      <Section className="pt-10 sm:pt-14">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-10">
          <div>
            {beta.free && (
              <Eyebrow>
                {full
                  ? "The free beta is full"
                  : spotsLeft !== null
                    ? `Free while the beta runs · ${spotsLeft} of ${beta.maxTeams} team spots left`
                    : "Free while the beta runs"}
              </Eyebrow>
            )}
            <h1 className="mt-3 font-display text-[40px] font-medium leading-[1.04] tracking-[-.035em] text-txt text-balance sm:text-[52px]">
              Your coding agents have no idea what your team is doing.
            </h1>
            <p className="mt-5 max-w-[52ch] text-[16px] leading-[1.6] text-body sm:text-[17px]">
              DevBrain is the layer that tells them. Every agent sees who is editing what, what just
              merged, and what the team decided last week — <em className="not-italic text-txt">before</em> it
              touches a file.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              {full ? <EmailForm source="beta_full" className="w-full max-w-[420px]" /> : <SignInButton next={signInNext} />}
              <a href="#how" className="-my-1.5 py-1.5 text-[13px] text-accenttext hover:underline">See how it works</a>
            </div>
            <p className="mt-3 max-w-[46ch] text-[12.5px] leading-[1.6] text-muted">
              Read-only GitHub sign-in. No card, nothing installed yet — you link a repo and install the
              plugin after.
            </p>
            <p className="mt-4 font-mono text-[11.5px] leading-[1.7] text-muted">
              Claude Code · Cursor · Codex · any GitHub repo · one-command setup
            </p>
          </div>
          <Constellation />
        </div>
      </Section>

      {/* ---- the problem ----------------------------------------------- */}
      <Section className="pt-24 sm:pt-32">
        <Eyebrow>The problem</Eyebrow>
        <H2>Three things that happen on every team running agents</H2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            { t: "Two agents, one file", b: "Your agent opens auth.ts. So does your teammate's, in another window, right now. Neither one finds out until the merge conflict." },
            { t: "Work that undoes work", b: "An agent's picture of the repo is from whenever its session started. It confidently rewrites something that shipped an hour ago." },
            { t: "Context dies with the session", b: "What the team worked out last week is in a transcript nobody will open again. Every session starts from nothing." },
          ].map((c) => (
            <div key={c.t} className="rounded-xl border border-line bg-row px-5 py-[18px]">
              <h3 className="font-display text-[16px] font-medium text-txt">{c.t}</h3>
              <p className="mt-2 text-[13px] leading-[1.6] text-muted">{c.b}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ---- the mechanism --------------------------------------------- */}
      <Section className="pt-24 sm:pt-32">
        <Eyebrow>What DevBrain does about it</Eyebrow>
        <H2>It stops the edit before it happens.</H2>
        <p className="mt-4 max-w-[62ch] text-[14.5px] leading-[1.65] text-body">
          A hook runs before your agent writes to any file. It asks what your teammates&apos; sessions
          are holding, and if the answer is &ldquo;that one&rdquo;, your agent stops and tells you:
        </p>

        <figure className="mt-6 overflow-hidden rounded-xl border border-line2 bg-codebg">
          <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
            <span className="h-2 w-2 rounded-full bg-wait" />
            <span className="font-mono text-[10px] uppercase tracking-[.1em] text-white/55">agent stopped · src/api/auth.ts</span>
          </div>
          <pre className="whitespace-pre-wrap px-5 py-4 font-mono text-[11.5px] leading-[1.75] text-codefg sm:text-[12.5px]">
{`DevBrain: src/api/auth.ts is being worked on right now by
Kai (claimed: refactoring the session guard). Editing it anyway
risks a collision — coordinate first, or approve to proceed
deliberately.`}
          </pre>
          <figcaption className="border-t border-white/10 px-5 py-2.5 font-mono text-[10.5px] uppercase tracking-[.1em] text-white/45">
            The warning your agent prints, word for word
          </figcaption>
        </figure>

        <p className="mt-6 max-w-[62ch] text-[14.5px] leading-[1.65] text-body">
          Not a notification you read afterwards. A decision, at the moment it still costs nothing to
          make.
        </p>
        {!full && (
          <p className="mt-5 text-[13px] text-muted">
            <a href="#start" className="font-medium text-accenttext hover:underline">Put this on one of your repos</a>
            {" — free while the beta runs."}
          </p>
        )}
      </Section>

      {/* ---- how it works ---------------------------------------------- */}
      <Section id="how" className="scroll-mt-8 pt-24 sm:pt-32">
        <Eyebrow>How it works</Eyebrow>
        <H2>Three steps, then you forget it is there.</H2>
        <ol className="mt-8 grid gap-5 sm:grid-cols-3">
          {[
            { n: "01", t: "Install the plugin", b: "One command in Claude Code, Cursor or Codex. It wires hooks into the agent you already use — no new editor, no new workflow." },
            { n: "02", t: "Your agents check in", b: "Presence, claims and activity go to your team as the work happens. Nobody has to remember to post a status." },
            { n: "03", t: "Every session starts informed", b: "At session start the team brief is injected: who is active, what is claimed, what changed, what was decided." },
          ].map((s) => (
            <li key={s.n} className="rounded-xl border border-line bg-row px-5 py-[18px]">
              <div className="font-mono text-[11px] text-accenttext">{s.n}</div>
              <h3 className="mt-2 font-display text-[16px] font-medium text-txt">{s.t}</h3>
              <p className="mt-2 text-[13px] leading-[1.6] text-muted">{s.b}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 max-w-[62ch] text-[13px] leading-[1.65] text-muted">
          A teammate is whoever holds a token — a person on any of the three agents, or a spawned
          agent session working on its own. They all show up the same way, because to everyone else
          on the team the difference does not matter.
        </p>
      </Section>

      {/* ---- what you get ---------------------------------------------- */}
      <Section className="pt-24 sm:pt-32">
        <Eyebrow>What your team gets</Eyebrow>
        <H2>Shared awareness, not another dashboard to check.</H2>
        <div className="mt-8 grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {[
            { t: "Collision warnings", b: "The guard above, on every edit, for every agent on the team." },
            { t: "Live presence", b: "Who is in which repo, on which branch, touching which files — right now." },
            { t: "Claims", b: "An agent takes a lane and the others route around it, then releases it when it is done." },
            { t: "Handoffs", b: "Leave one when you stop mid-thought. The next session — yours or a teammate's — picks it up." },
            { t: "Team memory", b: "Decisions and session journals, searchable. What you learned on Tuesday is there on Friday." },
            { t: "PR traffic lights", b: "Which pull requests are safe to merge, in which order, and which ones collide." },
            { t: "Tasks that move themselves", b: "A task starts when an agent starts it and closes when the PR that does the work merges." },
            { t: "Restore points", b: "A marked spot to come back to when an agent takes a wrong turn." },
          ].map((f) => (
            <div key={f.t} className="border-t border-line pt-4">
              <h3 className="font-display text-[15px] font-medium text-txt">{f.t}</h3>
              <p className="mt-1.5 text-[13px] leading-[1.6] text-muted">{f.b}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ---- price ------------------------------------------------------ */}
      <Section className="pt-24 sm:pt-32">
        <Eyebrow>Price</Eyebrow>
        {beta.free ? (
          <>
            <H2>Free while the beta runs.</H2>
            <p className="mt-4 max-w-[62ch] text-[14.5px] leading-[1.65] text-body">
              No card, no trial counting down. Your team gets {PLANS.base.actionsPerDay} AI actions a
              day and unlimited seats, repos and teammates. When the beta ends you get a{" "}
              {TRIAL_DAYS}-day trial to decide, and you are told before it happens — nothing starts
              charging on its own.
            </p>
            <p className="mt-4 text-[13px] text-muted">
              Afterwards it is {dollars(PLANS.base.priceCents)} or {dollars(PLANS.scale.priceCents)} a
              month for the whole team, not per seat. <Link href="/pricing" className="text-accenttext hover:underline">See the plans</Link>.
            </p>
          </>
        ) : (
          <>
            <H2>Per team, not per seat.</H2>
            <p className="mt-4 max-w-[62ch] text-[14.5px] leading-[1.65] text-body">
              {dollars(PLANS.base.priceCents)} or {dollars(PLANS.scale.priceCents)} a month for the
              whole team, with a {TRIAL_DAYS}-day trial.{" "}
              <Link href="/pricing" className="text-accenttext hover:underline">See the plans</Link>.
            </p>
          </>
        )}
      </Section>

      {/* ---- objections -------------------------------------------------- */}
      <Section className="pt-24 sm:pt-32">
        <Eyebrow>Before you ask</Eyebrow>
        <div className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {[
            { q: "Does DevBrain see my source code?", a: <>No. It stores metadata — who is active, which files were touched, task and PR records, and redacted session summaries. Not file contents. The <Link href="/privacy" className="text-accenttext hover:underline">privacy page</Link> is specific about every field.</> },
            { q: "Do my teammates have to use the same agent as me?", a: <>No. Claude Code, Cursor and Codex all report the same way, and a person on one sees everyone on the others.</> },
            { q: "What about agent sessions I spawn myself?", a: <>They appear as their own teammates, with their own presence and claims — which is the point, since that is where most collisions come from.</> },
            { q: "Do I need the Mac app?", a: <>The coordination runs in a CLI and an agent plugin. The Console and the live panel are a Mac app today; other platforms are not built yet.</> },
            { q: "Does it write to my repositories?", a: <>Its GitHub access is read-oriented, and it does not push code. It reads pull-request metadata through a GitHub App you install per repo.</> },
            { q: "What happens when the beta ends?", a: <>You get told in advance, then a {TRIAL_DAYS}-day trial. There is no card on file, so nothing can charge you without you deciding to.</> },
          ].map((f) => (
            <div key={f.q}>
              <h3 className="font-display text-[15px] font-medium text-txt">{f.q}</h3>
              <p className="mt-1.5 text-[13px] leading-[1.6] text-muted">{f.a}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ---- close ------------------------------------------------------- */}
      <Section id="start" className="scroll-mt-8 pt-24 sm:pt-32">
        <div className="rounded-2xl border border-coralline bg-coralink px-6 py-9 sm:px-10 sm:py-11">
          {full ? (
            <>
              <H2>The beta is full — get the next spot.</H2>
              <p className="mt-3 max-w-[56ch] text-[14px] leading-[1.6] text-body">
                All {beta.maxTeams} team spots are taken. Leave an address and you will hear the
                moment one opens up. An invite link from someone already on DevBrain still works.
              </p>
              <EmailForm source="beta_full" className="mt-6 max-w-[440px]" />
            </>
          ) : (
            <>
              <H2>Put it on one repo and watch what happens.</H2>
              <p className="mt-3 max-w-[56ch] text-[14px] leading-[1.6] text-body">
                Sign in with GitHub, create a team, link a repo, install the plugin. The next session
                anyone on your team starts will already know about the others.
              </p>
              <div className="mt-6"><SignInButton next={signInNext} /></div>
              <p className="mt-3 text-[12.5px] text-muted">Read-only GitHub sign-in. No card, nothing installed yet.</p>
              <div className="mt-8 border-t border-coralline pt-6">
                <p className="text-[13px] text-muted">Not today? Leave an address and I&apos;ll tell you when it changes.</p>
                <EmailForm className="mt-3 max-w-[440px]" />
              </div>
            </>
          )}
        </div>
      </Section>

      <Section className="pt-16">
        <footer className="flex flex-wrap items-center gap-4 border-t border-line pt-6 text-[12px] text-muted">
          <span>DevBrain</span>
          <Link href="/pricing" className="-my-2 py-2 hover:text-txt">Pricing</Link>
          <Link href="/privacy" className="-my-2 py-2 hover:text-txt">Privacy</Link>
          <Link href="/terms" className="-my-2 py-2 hover:text-txt">Terms</Link>
        </footer>
      </Section>
    </main>
  );
}
