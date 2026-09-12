import Link from "next/link";
import { loadBeta, platformCounts } from "@/lib/beta";
import { PLANS, TRIAL_DAYS, dollars } from "@/lib/billing/plans";
import { SignInButton } from "../sign-in-button";
import { Constellation } from "./constellation";
import { EmailForm } from "./email-form";

// ============================================================================
// The landing page, built in the product's own visual world: the instrument.
//
// Dark is chosen from the use scene, not the category — the people this is for
// read it between a terminal and an editor. The surfaces, hairlines, status
// vocabulary and mono-for-data are the app's, so the page and the thing it
// sells look like one product.
//
// Structurally it refuses the marketing defaults: no eyebrow labels above
// headings, no trio of identical cards standing in for a page, no 01/02/03,
// and no monospace worn as a costume — mono is for file paths, counts, hosts
// and terminal output, which is what mono is for in the app.
//
// Every number here is real: spots from platform_counts(), prices from
// plans.ts. The page cannot say "free" the day the beta ends.
// ============================================================================

const Section = ({ id, children, className = "" }: { id?: string; children: React.ReactNode; className?: string }) => (
  <section id={id} className={`mx-auto w-full max-w-[980px] px-6 sm:px-8 ${className}`}>{children}</section>
);

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="max-w-[20ch] font-display text-[30px] font-medium leading-[1.1] tracking-[-.025em] text-txt text-balance sm:text-[38px]">{children}</h2>
);

const Lede = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-4 max-w-[68ch] text-[15px] leading-[1.65] text-body">{children}</p>
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

      {/* ---- hero ------------------------------------------------------- */}
      <Section className="pt-16 sm:pt-24">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_430px] lg:gap-14">
          <div>
            <h1 className="font-display text-[42px] font-medium leading-[1.03] tracking-[-.04em] text-txt text-balance sm:text-[58px]">
              Your coding agents have no idea what your team is doing.
            </h1>
            <p className="mt-6 max-w-[54ch] text-[17px] leading-[1.6] text-body">
              DevBrain is the layer that tells them. Every agent sees who is editing what, what just
              merged, and what the team decided last week — <span className="text-txt">before</span> it
              touches a file.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-5">
              {full ? <EmailForm source="beta_full" className="w-full max-w-[430px]" /> : <SignInButton next={signInNext} />}
              <a href="#how" className="-my-2 py-2 text-[13.5px] text-accent hover:underline">See how it works</a>
            </div>
            <p className="mt-4 max-w-[46ch] text-[13px] leading-[1.6] text-muted">
              Read-only GitHub sign-in. No card, nothing installed yet — you link a repo and install
              the plugin after.
            </p>

            {beta.free && spotsLeft !== null && !full && (
              <div className="mt-9 inline-flex items-center gap-3 rounded-lg border border-line bg-row px-3.5 py-2.5">
                <span className="h-[7px] w-[7px] rounded-full bg-go" />
                <span className="font-mono text-[12.5px] tabular-nums text-txt">{spotsLeft}</span>
                <span className="text-[12.5px] text-muted">of {beta.maxTeams} beta spots open · free while it runs</span>
              </div>
            )}
          </div>
          <Constellation />
        </div>
      </Section>

      {/* ---- the problem: an incident list, not three cards ------------- */}
      <Section className="pt-28 sm:pt-36">
        <H2>Three things that happen on every team running agents</H2>
        <div className="mt-9 border-t border-line">
          {[
            { tone: "stop", t: "Two agents, one file", b: "Your agent opens auth.ts. So does your teammate's, in another window, right now. Neither one finds out until the merge conflict." },
            { tone: "wait", t: "Work that undoes work", b: "An agent's picture of the repo is from whenever its session started. It confidently rewrites something that shipped an hour ago." },
            { tone: "wait", t: "Context dies with the session", b: "What the team worked out last week is in a transcript nobody will open again. Every session starts from nothing." },
          ].map((c) => (
            <div key={c.t} className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 border-b border-line py-5 sm:grid-cols-[auto_19ch_1fr] sm:gap-x-6">
              <span className={`h-[7px] w-[7px] shrink-0 translate-y-[-2px] rounded-full ${c.tone === "stop" ? "bg-stop" : "bg-wait"}`} />
              <h3 className="text-[15px] font-medium leading-[1.4] text-txt">{c.t}</h3>
              <p className="col-span-2 max-w-[62ch] text-[13.5px] leading-[1.65] text-muted sm:col-span-1">{c.b}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ---- the mechanism ---------------------------------------------- */}
      <Section className="pt-28 sm:pt-36">
        <H2>It stops the edit before it happens.</H2>
        <Lede>
          A hook runs before your agent writes to any file. It asks what your teammates&apos; sessions
          are holding, and if the answer is &ldquo;that one&rdquo;, your agent stops and tells you:
        </Lede>

        <figure className="mt-8 overflow-hidden rounded-xl border border-line2 bg-codebg">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
            <span className="h-[7px] w-[7px] rounded-full bg-wait" />
            <span className="font-mono text-[10.5px] uppercase tracking-[.1em] text-white/55">agent stopped · src/api/auth.ts</span>
          </div>
          <pre className="whitespace-pre-wrap px-5 py-5 font-mono text-[12px] leading-[1.8] text-codefg sm:text-[13px]">
{`DevBrain: src/api/auth.ts is being worked on right now by
Kai (claimed: refactoring the session guard). Editing it anyway
risks a collision — coordinate first, or approve to proceed
deliberately.`}
          </pre>
          <figcaption className="border-t border-white/10 px-5 py-3 text-[12px] text-white/45">
            The warning your agent prints, word for word.
          </figcaption>
        </figure>

        <p className="mt-7 max-w-[68ch] text-[15px] leading-[1.65] text-body">
          Not a notification you read afterwards. A decision, at the moment it still costs nothing to
          make.
        </p>
        {!full && (
          <p className="mt-5 text-[13.5px] text-muted">
            <a href="#start" className="font-medium text-accent hover:underline">Put this on one of your repos</a>
            {" — free while the beta runs."}
          </p>
        )}
      </Section>

      {/* ---- how it works: a sequence, not three boxes ------------------ */}
      <Section id="how" className="scroll-mt-8 pt-28 sm:pt-36">
        <H2>Three steps, then you forget it is there.</H2>
        <ol className="mt-9 border-l border-line pl-6 sm:pl-8">
          {[
            { t: "Install the plugin", b: "One command in Claude Code, Cursor or Codex. It wires hooks into the agent you already use — no new editor, no new workflow." },
            { t: "Your agents check in", b: "Presence, claims and activity go to your team as the work happens. Nobody has to remember to post a status." },
            { t: "Every session starts informed", b: "At session start the team brief is injected: who is active, what is claimed, what changed, what was decided." },
          ].map((s) => (
            <li key={s.t} className="relative pb-8 last:pb-0">
              <span className="absolute -left-[26px] top-[7px] h-[7px] w-[7px] rounded-full bg-accent sm:-left-[34px]" />
              <h3 className="text-[16px] font-medium text-txt">{s.t}</h3>
              <p className="mt-1.5 max-w-[64ch] text-[13.5px] leading-[1.65] text-muted">{s.b}</p>
            </li>
          ))}
        </ol>
        <p className="mt-8 max-w-[66ch] text-[13.5px] leading-[1.65] text-muted">
          A teammate is whoever holds a token — a person on any of the three agents, or a spawned
          agent session working on its own. They all show up the same way, because to everyone else on
          the team the difference does not matter.
        </p>
      </Section>

      {/* ---- what you get: grouped, not eight flat items ---------------- */}
      <Section className="pt-28 sm:pt-36">
        <H2>Shared awareness, not another dashboard to check.</H2>
        <div className="mt-9 grid gap-x-12 gap-y-9 sm:grid-cols-3">
          {[
            { when: "While you work", items: [["Collision warnings", "The guard above, on every edit, for every agent."], ["Live presence", "Who is in which repo, on which branch, touching which files."], ["Claims", "An agent takes a lane; the others route around it."]] },
            { when: "Between sessions", items: [["Handoffs", "Leave one mid-thought. The next session picks it up."], ["Team memory", "Decisions and journals, searchable."], ["Restore points", "A marked spot to return to after a wrong turn."]] },
            { when: "When it ships", items: [["PR traffic lights", "Which pull requests are safe to merge, and in which order."], ["Tasks that move themselves", "A task closes when the PR doing the work merges."]] },
          ].map((g) => (
            <div key={g.when}>
              <h3 className="font-mono text-[10.5px] uppercase tracking-[.11em] text-accent">{g.when}</h3>
              <dl className="mt-4">
                {g.items.map(([t, b]) => (
                  <div key={t} className="border-t border-line py-3.5">
                    <dt className="text-[14px] font-medium text-txt">{t}</dt>
                    <dd className="mt-1 text-[13px] leading-[1.6] text-muted">{b}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </Section>

      {/* ---- price ------------------------------------------------------ */}
      <Section className="pt-28 sm:pt-36">
        {beta.free ? (
          <>
            <H2>Free while the beta runs.</H2>
            <Lede>
              No card, no trial counting down. Your team gets {PLANS.base.actionsPerDay} AI actions a
              day and unlimited seats, repos and teammates. When the beta ends you get a {TRIAL_DAYS}-day
              trial to decide, and you are told before it happens — nothing starts charging on its own.
            </Lede>
            <p className="mt-4 text-[13.5px] text-muted">
              Afterwards it is {dollars(PLANS.base.priceCents)} or {dollars(PLANS.scale.priceCents)} a
              month for the whole team, not per seat. <Link href="/pricing" className="text-accent hover:underline">See the plans</Link>.
            </p>
          </>
        ) : (
          <>
            <H2>Per team, not per seat.</H2>
            <Lede>
              {dollars(PLANS.base.priceCents)} or {dollars(PLANS.scale.priceCents)} a month for the
              whole team, with a {TRIAL_DAYS}-day trial.{" "}
              <Link href="/pricing" className="text-accent hover:underline">See the plans</Link>.
            </Lede>
          </>
        )}
      </Section>

      {/* ---- objections -------------------------------------------------- */}
      <Section className="pt-28 sm:pt-36">
        <H2>Before you ask</H2>
        <div className="mt-9 grid gap-x-12 sm:grid-cols-2">
          {[
            { q: "Does DevBrain see my source code?", a: <>No. It stores metadata — who is active, which files were touched, task and PR records, and redacted session summaries. Not file contents. The <Link href="/privacy" className="text-accent hover:underline">privacy page</Link> is specific about every field.</> },
            { q: "Do my teammates have to use the same agent as me?", a: <>No. Claude Code, Cursor and Codex all report the same way, and a person on one sees everyone on the others.</> },
            { q: "What about agent sessions I spawn myself?", a: <>They appear as their own teammates, with their own presence and claims — which is the point, since that is where most collisions come from.</> },
            { q: "Do I need the Mac app?", a: <>The coordination runs in a CLI and an agent plugin. The Console and the live panel are a Mac app today; other platforms are not built yet.</> },
            { q: "Does it write to my repositories?", a: <>Its GitHub access is read-oriented, and it does not push code. It reads pull-request metadata through a GitHub App you install per repo.</> },
            { q: "What happens when the beta ends?", a: <>You get told in advance, then a {TRIAL_DAYS}-day trial. There is no card on file, so nothing can charge you without you deciding to.</> },
          ].map((f) => (
            <div key={f.q} className="border-t border-line py-5">
              <h3 className="text-[14.5px] font-medium text-txt">{f.q}</h3>
              <p className="mt-1.5 max-w-[58ch] text-[13px] leading-[1.65] text-muted">{f.a}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ---- close ------------------------------------------------------- */}
      <Section id="start" className="scroll-mt-8 pt-28 sm:pt-36">
        <div className="rounded-2xl border border-line2 bg-row px-6 py-10 sm:px-12 sm:py-14">
          {full ? (
            <>
              <H2>The beta is full — get the next spot.</H2>
              <Lede>
                All {beta.maxTeams} team spots are taken. Leave an address and you will hear the moment
                one opens up. An invite link from someone already on DevBrain still works.
              </Lede>
              <EmailForm source="beta_full" className="mt-8 max-w-[440px]" />
            </>
          ) : (
            <>
              <H2>Put it on one repo and watch what happens.</H2>
              <Lede>
                Sign in with GitHub, create a team, link a repo, install the plugin. The next session
                anyone on your team starts will already know about the others.
              </Lede>
              <div className="mt-8"><SignInButton next={signInNext} /></div>
              <p className="mt-3 text-[13px] text-muted">Read-only GitHub sign-in. No card, nothing installed yet.</p>
              <div className="mt-10 border-t border-line pt-7">
                <p className="text-[13.5px] text-muted">Not ready today? Leave an address and I&apos;ll tell you when things change.</p>
                <EmailForm className="mt-4 max-w-[440px]" />
              </div>
            </>
          )}
        </div>
      </Section>

      <Section className="pt-20">
        <footer className="flex flex-wrap items-center gap-5 border-t border-line pt-7 text-[12.5px] text-muted">
          <span className="text-muted">DevBrain</span>
          <Link href="/pricing" className="-my-2 py-2 hover:text-txt">Pricing</Link>
          <Link href="/privacy" className="-my-2 py-2 hover:text-txt">Privacy</Link>
          <Link href="/terms" className="-my-2 py-2 hover:text-txt">Terms</Link>
        </footer>
      </Section>
    </main>
  );
}
