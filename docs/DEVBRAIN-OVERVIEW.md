# DevBrain — handoff for pitch & positioning work

*Written 2026-08-28 for use in Cowork. Everything here is true of the product as it exists today; "roadmap" and "gaps" are labelled as such. No secrets or credentials appear in this document.*

---

## 1. One-paragraph version

**DevBrain is a shared second brain for software teams whose developers all use Claude Code.** Link a GitHub repo, and every Claude Code session on the team starts already knowing who is editing what right now, which pull requests are open and which ones collide, what the team's rules are, what's on the task board, what decisions were made, and what previous sessions learned, tried, and left unfinished. As each session works, it reports back — so the *team's* knowledge compounds instead of evaporating when a chat window closes. A menu-bar Mac app shows the same live picture to the humans, and installs everything with one click.

The tagline used on the site: *"A shared second brain for your team and your coding agents."*

## 2. The problem

- AI coding agents are now doing a large share of the typing on small teams, but **each session starts from zero**. Context lives in one developer's chat history and dies with it.
- Two people (or two agents) editing the same file on different branches find out at merge time, not edit time. **Collisions are discovered late.**
- Team conventions ("no direct commits to main", "brain docs ride with behaviour changes") live in people's heads; agents don't follow rules they were never told.
- Standups, handoffs and "what did we decide about X?" are manual, lossy, and asynchronous across time zones.
- Existing tools cover one slice: GitHub shows PRs after the fact; Linear/Jira track tickets; Notion holds docs nobody's agent reads. **Nothing briefs the agent before it writes a line, and nothing learns from the agent afterwards.**

## 3. What DevBrain does (the user's view)

### For each developer's Claude Code session
- **Briefed at start**: a live digest — teammates' active sessions and the files they're on, open PRs with review state, collision warnings, claims on areas of the code, recent decisions and broadcasts, the task board, the team rules, and *relevant team history* matched to what you're about to do.
- **Warned before conflicts**: a hook checks every file edit against who else is actively on that file or has claimed that area, and asks the human before proceeding.
- **Kept current every turn**: a hook injects only what *changed* since the last prompt — a new PR, a new collision, a teammate's status, a broadcast, a decision.
- **Can act on the team's behalf** through 15 MCP tools: read context, search team memory, see who's editing a file, claim/release an area, post a status, broadcast, log a decision, list/add/start/complete tasks, leave or pick up a handoff, read the repo's `.brain/` docs.
- **Reports back automatically**: presence, file activity, and at session end a **session journal** — a summary of what was done, learned, decided, tried-and-failed, and what remains — built from a *redacted* transcript excerpt (prompts, prose, tool/file names; never file contents).

### For the team (dashboard + Mac app)
- **Now working**: who's active, on what branch, on which files, with a live status line.
- **Pull requests** with merge traffic lights (green / amber / red from review state, mergeability, overlap), AI review summaries, and a suggested merge order when PRs overlap.
- **Collisions**: same file touched on two unmerged branches.
- **Task board** per repo: priorities, tags, assignment, "possibly done — confirm" badges when a merged PR looks like it finished a task, AI-predicted *footprints* (which parts of the repo a task will touch, so work can be handed out without overlap), braindump-to-tasks, and **spec ingest** (paste or upload a document → extracted requirements, assessed against what's already built).
- **Apple Reminders sync**: a shared Reminders list feeds a repo's task board ("Hey Siri, add … to Team Inbox" becomes a task in minutes; checking it off completes the task). Mapping is team-wide.
- **Team memory search**: full-text over journals, decisions, broadcasts, handoffs, reviews, tasks and brain notes — every hit says who and when.
- **Handoffs & claims**: leave a handoff for whoever picks up next; claim an area to avoid overlap.
- **Team rules**: toggles per repo, served to every agent; each rule links to the matching GitHub branch-protection setting for enforcement by humans.
- **Daily standup digest** written by the agent tier from the last 24 hours.
- **Restore points**: deploy scripts can register a known-good SHA/tag; the history view shows a timeline (and an optional "writer app" can open a revert PR).
- **Zombie branch** detection and one-line summaries of stale unmerged work.
- **Alerts** to owners/admins when something breaks (sync errors, a repo losing GitHub access, the AI budget running out) — in-app, or to a Slack/Discord webhook.
- **The Mac app**: a corner badge / menu-bar panel with the live dashboard, native notifications, and a first-run installer that sets up the CLI, the Claude Code plugin and a self-updater. Node is bundled; there are no prerequisites beyond Claude Code itself.

### For the team owner
- Open sign-up: sign in with GitHub, create a team, get an invite link. Roles: owner / admin / member.
- Link any GitHub repo by installing the DevBrain GitHub App (read-only permissions).
- Every Mac keeps itself on the latest version automatically (CLI, plugin, app).
- Per-team daily AI budget with a usage bar; alerting; Reminders mapping; tokens per machine.

## 4. How it works (architecture, plain language)

```
 Developer's Mac                              DevBrain cloud
 ┌───────────────────────────────┐            ┌──────────────────────────────────┐
 │ Claude Code                   │  HTTPS     │ Next.js app on Vercel            │
 │  └ DevBrain plugin            │ ────────▶  │  • dashboard + settings          │
 │     hooks: presence, collision│  (per-     │  • /api/v1/* for plugins & CLI   │
 │     guard, live context,      │   machine  │  • GitHub App webhooks           │
 │     journals                  │   token)   │  • agent tick (every 2 min)      │
 │     MCP server: 15 tools      │            └──────────┬───────────────────────┘
 │ DevBrain Mac app (Tauri)      │                       │
 │  • live panel, notifications  │            ┌──────────▼───────────────────────┐
 │  • installer + self-updater   │            │ Supabase (Postgres, Auth,        │
 │  • Reminders collector        │            │ Realtime, RLS multi-tenant,      │
 │ devbrain CLI                  │            │ pg_cron, full-text memory index) │
 └───────────────────────────────┘            └──────────────────────────────────┘
                                                        ▲
                                              GitHub App (read-only) · Anthropic API
```

- **Data model is multi-tenant from day one**: every row belongs to a team ("org"); Postgres row-level security scopes every read to the member's teams; server actions check roles.
- **Plugins and CLI authenticate with per-machine bearer tokens** (sha256-hashed at rest, revocable, revoked automatically when someone leaves a team). The Mac app mints its own on first run via a browser sign-in hand-off (no GitHub password ever typed into the app).
- **GitHub App webhooks** feed pushes, PRs and reviews; the app never has write access to code (an optional separate "writer app" can open PRs only).
- **The agent tick** is server-side automation on a 2-minute cron: one bounded unit of AI work per run (PR review, auto-complete matching, spec analysis, task footprints, journal summaries, memory indexing, daily digest) plus deterministic units (traffic lights, zombie branches). Teams are served round-robin; each has a daily AI call cap.
- **Team memory** is a Postgres full-text index over journals, decisions, broadcasts, handoffs, reviews, tasks and brain notes; the context digest attaches the best matches to the developer's current prompt.
- **Privacy posture**: hook payloads carry file *paths* and redacted transcript excerpts — never file contents. Journal excerpts strip secrets and code blocks before leaving the machine. Journals are visible team-wide but every entry is labelled with its author.
- **Distribution**: one repo on GitHub is the source of truth; every Mac fetches it, reconciles (plugin via the Claude Code marketplace, app via GitHub Releases built in CI), daily and on session start. Two channels (stable / beta) can run side by side on one Mac.

## 5. Where it came from, and current state

- Built inside a small product team (the founder's own dev team, ~3 people) to solve their daily problem; used in production there every day. That original deployment is now **frozen as the "FlowSync" instance**; the **product** is a clean copy with its own cloud, GitHub App, marketplace and releases, and is where all new work happens.
- **Maturity**: the full feature set above is built and working. This week: multi-tenant onboarding (open sign-up, invite links, roles), per-team AI budgets, error alerting with an out-of-band watchdog, a security/flows audit, and a pass that made every first-run and everyday flow honest (the app can't dead-end a new user; setup reports exactly what failed; docs match the product; a one-line installer).
- **Not yet done** (honest list, for internal use, not pitch copy):
  - A set of tenant-isolation hardening items found in the audit (fix before any outside team is invited).
  - Tick robustness under many teams (fairness inside global query windows, budget accounting edge cases, one runaway unit stalling others).
  - The Mac app is ad-hoc signed (needs an Apple Developer ID to remove the "damaged"/quarantine step for browser downloads; the one-line installer avoids it).
  - No privacy policy / terms / support address yet; no email alerts; no billing.
  - Test coverage is thin on the auth/metering boundary; CI doesn't gate deploys.

## 6. Who it's for

- **Primary**: small-to-mid software teams (2–20 devs) that have standardised on Claude Code and ship from GitHub. The pain scales with agent usage: the more code agents write, the more context is lost between sessions and the more collisions happen.
- **Buyer**: the tech lead / founder-engineer who already feels the "my agent didn't know what yours just did" problem.
- **Adjacent**: agencies running several client repos; remote teams across time zones (handoffs, journals, digests replace synchronous standups).

## 7. Differentiation (why not X)

- **vs. GitHub alone**: GitHub is after-the-fact (PRs, reviews). DevBrain is *before* the edit (who's on this file now) and *during* (live context every turn) — and it briefs the agent, not just the human.
- **vs. Linear / Jira**: those track work; DevBrain connects work to the agent (footprints, auto-complete on merge, spec → tasks) and to the live state of the repo.
- **vs. Notion / wikis / `CLAUDE.md`**: static docs nobody's agent reads at the right moment. DevBrain's memory is generated from sessions automatically and retrieved by relevance to the current prompt.
- **vs. "just share the chat"**: chats aren't searchable, aren't redacted, and don't carry decisions and outcomes. Journals are structured, attributed, and safe to share.
- **Wedge**: it installs in one click, needs no change to how anyone codes, and shows value in the first session ("your Claude answers 'what's the team up to?' from live data").

## 8. Numbers and proof points available today

- 15 MCP tools, 4 hooks, ~30 database tables, 28 migrations; a 2-minute automation loop with 9 units.
- Used daily by the originating team on multiple repos; zero-prerequisite install (bundled runtime); auto-updates on every Mac from a single `git push`.
- Redaction and read-only GitHub access are structural, not policy — pitch material can say "DevBrain never sees your file contents and never holds write access to your code".

## 9. Open business questions (for discussion in Cowork)

- **Pricing**: per-seat per month is the obvious shape; the AI tick has real marginal cost (per-team daily cap exists to bound it). Free tier for ≤2 seats? Metered AI units?
- **Positioning**: "team memory for Claude Code" (narrow, sharp) vs "shared second brain for dev teams" (broad). Claude Code-only today; the hooks/MCP surface could extend to other agents.
- **Go-to-market**: Claude Code plugin marketplace listing; content around "agent collisions" and "session journals"; design-partner teams.
- **Trust**: what a security-conscious buyer will ask (data retention, journal redaction, SOC2 timeline). The privacy page is on the roadmap; retention policy is a decision to make.
- **Name**: "DevBrain" is the working name; the GitHub App is temporarily named "DevBrain Product".

## 10. Glossary

- **Team / org** — a tenant. **Owner / admin / member** — roles.
- **Linked repo** — a GitHub repo the DevBrain GitHub App is installed on.
- **Session** — one Claude Code session in a repo; **presence** — the live record of it.
- **Collision** — the same file changed on two unmerged branches (or being edited by two live sessions).
- **Claim** — a soft lock on an area of the code. **Handoff** — a note for whoever continues the work.
- **Journal** — the automatic, redacted, attributed summary of a session. **Team memory** — the searchable index over journals and everything else.
- **Brain** — the repo's `.brain/` docs (architecture notes) that DevBrain indexes and serves.
- **Tick** — the 2-minute server automation loop. **Footprint** — predicted files/dirs a task will touch.
- **Traffic light** — a PR's merge readiness. **Restore point** — a registered known-good deploy.
- **Channel** — stable vs beta install of the Mac app / CLI / plugin.

## 11. Pointers

- Product repo: `github.com/lukeb230/devbrain` — `README.md` (deploy your own), `ONBOARDING.md` (joining a team), `docs/NOTARIZE.md`, `docs/PRIVATE-REPO.md`.
- Live: `https://devbrain-seven.vercel.app` (sign in with GitHub, create a team).
- One-line install: `curl -fsSL https://raw.githubusercontent.com/lukeb230/devbrain/main/install.sh | sh`
