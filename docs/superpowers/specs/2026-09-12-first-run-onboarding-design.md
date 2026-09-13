# First-run onboarding — design

**Date:** 2026-09-12 · **Status:** approved for planning (revised after review) · **Scope:** the app end only

## Goal

Make DevBrain's setup non-technical from launch to a working, configured first repo.
A user installs the app, opens it, signs in, and is walked through everything needed —
including which rules to run on their first repo — without typing a command or reading
documentation.

## Non-goals

- The website's download path. Deferred deliberately; the app comes first.
- The non-Mac teammate path (`install.sh --cli`, which needs git + Node 18+ and a
  pasted token). It stays as technical as it is today. macOS-only is temporary per
  `PRODUCT.md`, so this resolves by platform work, not by onboarding work.
- Any change to the three `writer_*` switches beyond keeping them out of first run.

## Decisions

| Question | Decision |
|---|---|
| Audience | Owners, admins and members — one flow that forks on role |
| Enforcement | Blocking for the **`owner` role only**; resumable checklist for admins and members |
| Rules presentation | Presets, with the three write switches deferred out of first run |
| Surface | Console, including sign-in; the panel path stays intact |

**Why owner, not admin.** `hasRole` is rank-based (`RANK[role] >= RANK[min]`), so "admin"
includes owners — and an invited admin who joins a team that has no repo yet would be walled
and told to link one, which is not their job. The team's creator is the one person the team
depends on to finish; everyone else gets the resumable version.

## What already exists

Setup is not being built from nothing. The following are in place and get reused:

- **`/settings/setup`** — a self-checking page whose steps detect their own completion
  from real data. Its detection (`hasToken`, `hasSession`, `hasActivity`) is reused, with
  one change described under "The five steps": that page deliberately conflates "machine set
  up" with "a session was seen" because it has fewer steps; this walkthrough keeps them apart.
  Nothing currently routes a user to it.
- **"Set up this Mac"** — one click that mints a dev token the user never sees, installs
  the CLI, plugin and hooks, wires **Claude Code, Cursor and Codex** (`~/.cursor/mcp.json`,
  `~/.cursor/hooks.json`, `~/.codex/config.toml`, an `AGENTS.md` block), sets up a daily
  self-updater, requests macOS permissions, and reports ✓/✗ per part with reasons. This is
  the hard part of machine setup and it is already non-technical.
- **`/welcome`** — signed in, no team: create one or join by invite (`createTeam`, `useInvite`).
  `createTeam` already sets the `devbrain_org` cookie, so the create-then-install path
  claims the installation for the correct team.
- **`/desk/(team)/rules`** — the toggles, and `src/lib/rules-catalog.ts`, the single source
  of their labels and detail text.
- **`/desk/mac`** — preferences plus Install health, the server-side half of `devbrain doctor`.
- **`PlanWall`** in `src/app/desk/layout.tsx` — an existing precedent for rendering a wall
  instead of `children` on every route until a precondition is met.

## Architecture

### Mount points

The walkthrough is a server component whose props are entirely derived. It mounts twice:

- **Blocking:** `src/app/desk/layout.tsx` renders `<OnboardingWall>` instead of `children`,
  mirroring the existing `PlanWall` in the same file. No redirect, so no redirect-loop bugs.
- **Voluntary:** `/desk/onboarding` renders the same component, for teammates and for owners
  revisiting after finishing.

**The wall is self-contained.** Because it replaces `children` on *every* `/desk` route, it
cannot depend on any Desk page — not `/desk/team` (where "Link a repo" lives today) and not
`/desk/mac` (Set up this Mac). It hosts the GitHub App install link, the Set up this Mac
IPC trigger, and the preset action itself.

### Gate order

In `desk/layout.tsx`, extending the existing chain:

1. signed out → `/?from=desk`
2. no team → `/welcome`
3. billing wall → `PlanWall` (unchanged; do not make someone configure a product they
   cannot access)
4. **`owner` with essentials incomplete → `OnboardingWall`**
5. otherwise → `children`

### The derived-state function

New file `src/lib/onboarding.ts`:

```
onboardingState({ role, repos, tokens, sessions, activity, policies, requestEvents, members })
  → { steps: Step[], blocking: boolean, nextStep: string | null }
```

Pure, row-driven, no I/O — directly unit-testable as a truth table, matching how
`ratelimit`, `beta` and `traffic` are already tested. **No step stores "done."** Every
step derives completion from real rows, so the checklist self-heals: unlink a repo a month
later and the step reopens automatically.

### The five steps

| Step | Done when | Who acts | Blocks the owner? |
|---|---|---|---|
| 1. Team | org exists (always true past the layout guard) | — | — |
| 2. Link a repo | **linked** (a `linked_repos` row) · **requested** (an open request, see below) · **not started** | admin | only when **not started** |
| 3. Set up this Mac | a live `dev_tokens` row for this user — Set up this Mac mints it, so its existence proves the bootstrap ran. The local ✓/✗ part list is shown alongside over IPC when available, but gating reads only the token. | per-user | no |
| 4. Choose rules | **every** linked repo has `policies` rows | admin | yes, once a repo exists |
| 5. It's working | a `sessions` or `activity` row for this user in a linked repo | per-user | no |

**Steps 3 and 5 are separate evidence on purpose.** Defining step 3 as "token *and* a
session" — as `/settings/setup` does — means a user who has just clicked Set up this Mac
successfully is told their machine is not set up until they open an editor. The token alone
is the proof of step 3; the session is step 5's.

**Blocking is deliberately narrow.** Only steps 2 and 4 block, and only for the `owner` —
the team-level steps fully within the owner's control. Steps 3 and 5 depend on a macOS
permission prompt and an editor restart, which can fail for reasons the app cannot see or
fix; blocking on those traps users. Step 4 blocks only after a repo exists, since there is
nothing to configure before that.

### The teammate view

Admins and members see the same five steps, never a wall:

- Steps **2** and **4** are informational, attributed to whoever did them: *"Linked by
  lukeb230"*, *"Rules chosen by lukeb230"*. An admin may act on them; a member cannot.
- If the team has no repo yet, step 2 reads *"waiting on your team's owner to link a repo"*,
  and steps 4 and 5 are shown greyed with the reason — not as a blank product.
- Steps **3** and **5** are theirs, exactly as for the owner.

## The GitHub App request lifecycle

This is the largest piece of new behaviour, and it addresses the most likely real-world
first-run failure: **a developer who is not a GitHub org owner cannot install the App.**
GitHub creates a pending *request* instead, redirecting to the Setup URL with
`setup_action=request` and **no `installation_id`**.

Today `src/app/api/github/setup/route.ts` does:

```ts
const installationId = Number(searchParams.get("installation_id"));
if (!installationId) return NextResponse.redirect(`${origin}/desk/team`);
```

A silent bounce: same "Link a repo" button, nothing linked, no explanation. Under a
blocking wall the user would be stuck permanently.

Three changes:

1. **Handle `setup_action=request`** in the setup route: record the request and return to
   the walkthrough with the pending state shown.

2. **Store it as a derived fact, not new mutable state.** Write an `events` row of kind
   `repo_link_requested` carrying `{ org_id, by: github_login }`. That table is already the
   audit log and already carries `repo_unlinked`, `org_created`, `member_joined`, so the
   kind fits the existing convention.

3. **Fix the claim gap this exposes.** When the org owner approves, GitHub fires
   `installation.created` — and today's webhook handler upserts the installation with only
   `id`, `account_login` and `account_type`, **no `org_id`**. The requester never passes
   back through `/api/github/setup`, the only place an installation is claimed for an org.
   So the installation lands unclaimed and the repo never appears; the user waits forever on
   an approval that already happened.

### What "an open request" means

A request is **open** when all of these hold, derived from rows:

- it is the org's most recent `repo_link_requested` event;
- it is **under 14 days old** — GitHub sends **no webhook when an org owner denies a
  request**, so without an expiry the pending state would persist forever;
- no `repo_link_cancelled` event for the org is newer than it;
- no `linked_repos` row for the org is newer than it (a link closes the request).

The pending banner offers **"Start over"**, which writes a `repo_link_cancelled` event and
returns step 2 to *not started*, so a user whose request was denied — or who picked the wrong
repo — always has a way forward.

### The claim rule

GitHub's `installation.created` payload includes a **`requester`** field when the install
originated from a request. In the webhook, for an installation with no `org_id` and a
`requester`:

1. Match `requester.login` to `org_members.github_login`.
2. Among that user's `repo_link_requested` events, take the **most recent open one** (per the
   definition above). A user can belong to several teams, and the event says which team they
   were setting up — matching the recorded event rather than their *active* org is what
   makes this correct.
3. Claim the installation for that event's `org_id` and sync its repos. The resulting
   `linked_repos` row closes the request, so the same login's later, unrelated installs can
   never be claimed into this team.
4. With **no open matching event**, leave the installation unclaimed and write an `error`
   event `setup:unmatched_request`, so it is visible in ops rather than silently lost.

### Consequence: the pending state must explain itself

Because *requested* does not block, an owner in that state reaches a Console with no repo —
an empty product, which is what blocking was meant to prevent. That state therefore carries
its own explanation: a persistent banner ("waiting on your GitHub org owner to approve
DevBrain", with a copyable link to send them, and "Start over"), and the Desk's empty states
must read as *waiting on someone else* rather than broken. Skipping this copy work trades one
bad first run for another.

### External-API claims to confirm before building

Two claims cannot be verified from the repo and should get a two-minute check against GitHub's
docs before implementation: that a request redirects to the Setup URL with
`setup_action=request`, and that `installation.created` carries `requester`. Both are
believed correct; if either is wrong, this section needs rethinking.

## The rules step

### Ask, do not guess

Team size cannot be detected here: the owner has just created the team, so `org_members` is
always 1 — including for someone setting up for a team of eight. Guessing from the count
would mislabel every new team as solo, and `solo_green` is exactly the wrong thing to get
wrong. The step asks one question: *"Is it just you for now, or are you setting this up for
a team?"*

### Every repo, not "the first one"

A GitHub App install can select many repos, and the setup route syncs all of them. Applying
a preset to one would leave every other repo with no policy rows — which is the exact
`journals`-off / `solo_green`-off trap this feature exists to fix, just on repos 2 through N.
So the preset is applied to **every repo in the installation**, and step 4 is done only when
every linked repo has policy rows. A repo linked later, outside onboarding, reopens step 4 for
that repo alone, and the Rules page shows the same preset choice for it.

### What each preset sets

Both presets write all seven rows explicitly, **including the `false` ones**, so "decided"
stays distinguishable from "never saw it" — otherwise the wall could never release.

| Rule | Solo | Team | Reasoning |
|---|---|---|---|
| `collision_check` | on | on | The centrepiece. On for solo too: parallel agent sessions collide, and `PRODUCT.md` treats a spawned session as a teammate. |
| `pr_only_main` | on | on | Without PRs there are no reviews, lights or merge order. |
| `no_conflict_pr` | on | on | The plugin does it automatically; costs the user nothing. |
| `journals` | on | on | The accumulate feature. One of the two defaults that currently make the product look broken. |
| `no_self_approve` | off | on | Solo has no teammate; leaving it on tells the user's own agent to wait for an approval that can never arrive. |
| `solo_green` | on | off | The other broken-looking default: without it a solo team's merge light can never turn green. On a real team a person should approve. |
| `brain_updates_required` | detected, else off | detected, else off | On only if `.brain/` docs are already known to exist for the repo (a `memory_index` brain row, or a cached `fetchBrainDocs` result). **When unknown, off** — the repo was linked seconds ago and the docs may not have been fetched yet, and demanding updates to docs that do not exist is friction that makes the product feel obstructive on day one. The Rules page is where it gets turned on when the team adopts `.brain/`. |

The three `writer_*` switches are absent from this screen. The step ends with one sentence
saying they exist, what they would let DevBrain do, and that they live on the Rules page.

### Journals are stated, never buried

Journals default on. When a session ends, a redacted excerpt — "the conversation and which
tools/files it used — never file contents or command output", in the catalogue's own words —
is sent to DevBrain and **summarised**; the whole team can read the resulting journal,
labelled with its author. The preset summary says exactly that. A privacy-relevant default
the user did not knowingly accept is a trust problem later.

### Implementation

A server action `applyPreset(installationId, preset)` reusing `toggleRule`'s guards verbatim
(`requireRoleOrRedirect("admin")` plus the repo-must-be-in-the-active-org check, applied per
repo), then upserting seven `policies` rows per repo with `onConflict: "repo_id,rule"` and
writing one `events` row per repo. "Customise" expands to the full seven rendered from
`RULES_CATALOG` and `FEATURE_CATALOG` using their own `label` and `detail`, so there is no
second copy of that text to drift.

### Preventing preset drift

If a solo user picks the Solo preset and later invites teammates, `solo_green` stays on, and
PRs begin being cleared by the AI alone on a team that now has humans who could review.
Nobody would notice. So: when `member_joined` fires on an org with `solo_green` enabled,
surface a notice that it now weakens review, and offer to turn it off.

## Sign-in and surfaces

Auth already does not happen in the app's webview. `SignInButton` detects Tauri and invokes
`start_browser_login`, opening the user's real browser — deliberately, because
Google/SSO-backed GitHub accounts cannot authenticate in the panel webview — returning
through the `devbrain://` scheme. That Tauri branch returns **before** the button's own
cookie line runs, so the button does not decide the destination.

The destination is decided in **`/auth/device/start`**: it redirects a signed-out user to
`/?from=widget&next=…`, and for a signed-in user with no team it stores `COOKIE.next` and
sends them to `/welcome`. "Console sign-in" therefore means changing that route and the
Rust window-raise, not the OAuth mechanics:

- `/auth/device/start` sends first-run users to `/?from=desk` and stores `/desk` as the
  destination instead of `/widget`.
- On return the app raises the **Console** window rather than the panel.
- The panel's existing path is left exactly as-is, protecting the widget-destination cookie fix.

### A rough edge fixed in the same pass

`desk/layout.tsx` sends a signed-out user to `/?from=desk`, and `src/app/page.tsx` does:

```ts
const inPanel = from === "widget";
```

Only `widget` receives the bare sign-in screen, so **a signed-out Console window renders the
full public marketing landing page** — someone who just installed the app is shown a page
selling it to them. Generalise `inPanel` to an `inApp` check so `from=desk` gets a bare
in-app sign-in too.

## Error handling

**Governing rule: the walkthrough must never be the reason someone cannot use the product.**

- **"Skip for now" exists even in blocking mode.** It writes
  `org_members.onboarding.dismissed_at`, suppresses the wall for **24 hours** from that
  timestamp (a fixed, server-checkable window rather than an app-lifecycle event the server
  cannot observe), and leaves a persistent nudge in the Desk sidebar. Without an escape
  hatch, any step whose completion detection fails becomes a permanent lockout — and the
  app-only gate means there is no browser fallback to escape through.
- **"Start over"** on a pending request (above) is the second escape hatch, for the denied
  or mis-targeted request that GitHub never tells us about.
- **Existing refusals render honestly** rather than as dead ends: beta capacity
  (`signupBlock`), invite-only mode, `install_owned` (installation belongs to another team),
  `link_repo_admin` (not an admin), pending org-owner approval, and expired device logins
  (already surfaced via `device_error`).

## Data model

One migration, one column:

```sql
alter table org_members add column onboarding jsonb not null default '{}';
```

Keyed `(org_id, user_id)`, the correct grain. It holds only what cannot be derived:
`{ dismissed_at, preset }`. `preset` records which option was picked, for the Rules page to
show and for later analysis; **gating never reads it** — step 4 derives from the `policies`
rows themselves. There is deliberately no `completed_at`: nothing stores "done."

## Testing

| Test | Covers |
|---|---|
| `onboarding.test.ts` | Truth table over the pure function: role (owner / admin / member) × repo state (linked / requested / none) × rules × token × session/activity. Includes: token alone completes step 3; admin with no repo is never blocked; member sees attributed steps 2 and 4 |
| `preset.test.ts` | Applies to **every** repo in the installation; writes exactly 7 rows per repo including `false` ones; solo vs team differ only where the table says; admin guard refuses a member |
| `request-open.test.ts` | The open-request derivation: most recent, under 14 days, not cancelled, not superseded by a link |
| `webhook-requester.test.ts` | `installation.created` with a `requester` plus an open `repo_link_requested` event claims the right org; two teams for one login picks the most recent open one; a closed request does not re-claim; no match writes `setup:unmatched_request` and stays unclaimed |
| `setup-request.test.ts` | `setup_action=request` records the event and returns to the walkthrough instead of bouncing; "Start over" writes `repo_link_cancelled` |
| Gate tests | Owner without a repo sees the wall on every `/desk` route; admins and members never do; dismissal suppresses it for 24 hours |
| Regression | Panel sign-in still lands on `/widget`; the existing app-only gate test extended to cover `from=desk` |
| `solo_green` drift | `member_joined` on an org with `solo_green` on raises the notice |

## Risks

| Risk | Mitigation |
|---|---|
| A step's completion detection fails → user locked out | "Skip for now" in every state, including blocking |
| Approved App request never claimed → repo never appears | Webhook `requester` matching against the open request, with its own test |
| Request denied by the org owner → pending forever | 14-day expiry plus "Start over" |
| Preset applied to one repo leaves the rest in the default-off trap | Preset applies to every repo in the installation; step 4 checks every linked repo |
| Invited admin walled on a repo-less team | Wall gates on the `owner` role only |
| Machine reported "not set up" until an editor is opened | Step 3 gates on the token alone; the session is step 5 |
| Pending state looks like a broken product | Explicit banner plus waiting-flavoured empty states |
| Console sign-in regresses the panel path | Panel path untouched; explicit regression test |
| Solo preset outlives the solo situation | `member_joined` notice on `solo_green` |
| Signed-out Console shows marketing page | Generalise `inPanel` to `inApp` |

## Decision required before implementation

**Signups are invite-only.** `system_state.signups.mode` defaults to `"invite"`, and a
brand-new account with no team is redirected with "DevBrain is invite-only right now — ask a
teammate for an invite link." The owner walkthrough is therefore unreachable by a stranger
until either the mode is flipped to `open` (via `scripts/beta.mjs`) or invite links are
handed out deliberately. This is a switch, not a bug, but "ready to work with people"
requires choosing one. The design works under either; only who can reach it changes.
