# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: small product teams, roughly 3–10 developers**, working in one repository, each
running their own coding agent (Claude Code, Cursor, or Codex). The situation that defines
them: several people are making changes through agents at the same time, and no participant —
human or agent — has a picture of what the others are doing.

**Second, explicitly supported: solo developers running several agent sessions at once.** A
spawned agent session is a seat and a teammate in exactly the same way a person is, so a solo
developer colliding with their own parallel sessions is a real user of the same mechanism, not
a degraded case. Teams lead; solos are the expansion path in the other direction.

## Product Purpose

DevBrain is a shared awareness layer for repositories where work happens through coding agents.
It carries what the team is doing — who is editing what right now, what has been claimed, what
just merged, what was decided last week — into the agent's own context, and acts on it before
the agent writes.

Success is a collision that never happened: an edit stopped while stopping it was still free, a
session that began already knowing what the last one learned, work that was not silently undone.

## Positioning

**The combination is the claim; no single part is the moat.** Confirmed with the maintainer,
2026-09-12:

1. **It runs inside the agent's loop.** A PreToolUse hook can stop an edit before it happens.
   This is not a dashboard someone has to remember to check — the agent is interrupted at the
   moment the mistake would occur.
2. **It spans agents.** Claude Code, Cursor and Codex report into one picture, so a
   single-vendor feature can never cover the teammate who uses a different tool.
3. **It accumulates.** Decisions, journals and handoffs outlive any transcript, so the team's
   knowledge compounds instead of resetting every session.

Any one of these is copyable. All three together, in the agent's loop, is the position. Future
work should not compress this into a single-mechanism claim just because one sentence is easier
to write.

## Operating Context

- Work happens inside the agent, in a terminal or editor, against a repository.
- Setup is a CLI plus an agent plugin. Hooks fire at session start, before every edit, after
  tool use, and at session end — the developer does not post status or check in by hand.
- The Console and the live panel are a macOS app (Tauri webviews). The coordination layer is a
  zero-dependency Node CLI and plugin, which is not macOS-specific.
- Repositories are linked through a GitHub App; pull-request metadata arrives by webhook.
- **A teammate is a token label, not an account.** A person on any of the three hosts and a
  spawned agent session appear the same way, because to everyone else on the team the
  difference does not matter.
- Operator controls (rate limits, signup caps, the free-beta switch, AI budgets) are rows in
  `system_state`, changed with `scripts/beta.mjs` and no deploy.

## Capabilities and Constraints

**Confirmed capabilities:** live presence; a collision guard that interrupts an edit into a
teammate's claimed area; claims and releases; tasks that start and close from agent activity;
handoffs; session journals; searchable team memory and decisions; pull-request traffic lights
and merge order; restore points; digests and standups; Reminders list mapping; a brain graph.

**Binding constraint — the one confirmed as such:**

- **The macOS-only app is temporary.** Windows and Linux are intended. Copy and design must not
  imply that Mac is the permanent story. Current shipped wording ("other platforms are not built
  yet") is acceptable; anything that reads as a permanent platform choice is not.

**Current facts, true today, not confirmed as permanent commitments:**

- Hosts are Claude Code (plugin), Cursor (hooks and MCP; enforces `deny` only), and Codex.
- Repositories are GitHub only. **Whether this is durable was not confirmed** — treat "GitHub"
  in positioning as a present fact, not a promise, and avoid wording that would be wrong if
  another host were added.
- The product stores metadata and not source code, as the code does and `/privacy` states.
  **The maintainer did not confirm this as a permanent product commitment.** Describe it as what
  DevBrain does; do not escalate it into a guarantee beyond what the privacy page says.
- The project is maintained by one person. **Not confirmed as durable**, but nothing should
  promise support SLAs or enterprise onboarding on the strength of it either way.

**Commercial state:** a free beta, capped at 150 teams and 600 people, with teams created as
comped and bounded to the plan's daily AI allowance. Signups are invite-only until opened. The
priced plans behind it are Base $29 and Scale $99 per team per month (not per seat), with a
7-day trial; the single source is `src/lib/billing/plans.ts`.

## Brand Commitments

- The name is **DevBrain**. The mark is the illustrated brain at `public/brain.png`.
- Contact is the project's GitHub issues page; there is no support address.
- The voice in shipped copy is plain, concrete and second-person, with no hype and no
  exclamation. Recorded as observed in the existing product, not as a constraint the maintainer
  stated.

## Evidence on Hand

**There are no customers, testimonials, case studies, benchmarks, logos or press.** Three teams
exist in production and two of them are the maintainer's own test and sandbox teams. Any future
surface must treat social proof as unavailable rather than inventing it.

What is real and quotable:

- The collision warning itself, verbatim, in `plugin/hooks/check-collision.mjs`.
- The pricing model in `src/lib/billing/plans.ts`.
- The privacy disclosures at `/privacy`, which enumerate every stored field.
- Live platform counts (`platform_counts()`), which is where the landing page's remaining-spots
  figure comes from — a real number, not a marketing one.

## Product Principles

1. **Coordination is never gated.** Presence, collisions, claims, tasks and handoffs work
   regardless of billing state; only the AI layer is metered. A team that stops paying loses
   summaries, not the ability to avoid stepping on each other.
2. **A teammate is a label.** Humans and spawned agent sessions are first-class in the same way,
   and every surface should hold that line rather than privileging the human.
3. **Interrupt at the moment of the mistake.** Value is delivered before the write, not in a
   report afterwards. A feature that can only inform after the fact is a weaker version of the
   product.
4. **Free is not unlimited, and limits are honest.** Caps, budgets and beta ceilings are real
   and are shown as real numbers; the product says when it is full rather than quietly failing.
5. **Operator decisions are data, not deploys.** Anything the maintainer may need to change
   under pressure lives in a row that can be flipped in seconds.
