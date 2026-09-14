# DevBrain website: handoff spec for the new Home page

Rev C · 13 September 2026 · from the approved design canvas (Home and FAQ, Version 32)

This is the spec Claude Code builds from. It replaces the current landing page (`src/app/landing/landing.tsx`) with the five-beat design on the canvas, adds scroll-driven motion, turns the primary action into a download, replaces the How it works page with a FAQ page, and removes the Pricing page from the site. The product is an open beta: free, a fixed number of seats, no billing shown anywhere on the site.

The two artboard files that ship with this spec (`Home.artboard.html`, `FAQ.artboard.html`) are the pixel reference. Every size, colour, radius and string in this document was lifted from them; when in doubt, open the artboard and copy the markup.

---

## 1. Scope and ground rules

**Keep.** The Next.js app, `src/app/globals.css` (all `--wg-*` tokens, the `.lp` block, `.lp-win`), `src/app/fonts.ts` (Bricolage Grotesque, IBM Plex Sans, IBM Plex Mono via `next/font`), `tailwind.config.ts` token aliases, `ConsoleWindow` and `TitleBar` in `src/app/landing/app-shots.tsx`, the `Terminal` typing mechanics in `src/app/landing/terminal.tsx`, `loadBeta()` / `platformCounts()`, `LEGAL.trademarks`, the sticky header, the footer, `IncentiveModal`, `EmailForm`.

**Replace.** The body of `landing.tsx` between the header and the footer. `SessionCard`, `PrWindow`, `TryIt` and the `GUARD`/`BRIEF` terminal transcripts are no longer rendered anywhere on the site; delete them and their tests once nothing imports them. `src/app/how-it-works` becomes `src/app/faq` (section 4.10). `src/app/pricing` is removed from the site: delete the page and redirect `/pricing` to `/` (301). Billing code elsewhere in the app is out of scope and untouched.

**Add.** One component per composed visual (section 5), a `PanelWindow` recreation of the panel's Home tab, a `/download` route, and a small motion layer (section 7).

**Rules that do not bend.**

1. Every label shown inside a window must exist in the app. `src/lib/__tests__/no-invented-ui.test.ts` enforces this for `app-shots.tsx`, `try-it.tsx` and `terminal.tsx`; add every new file that draws product UI (`PanelWindow`, `SpawnWindow`) to its `FILES` list. The composed visuals that are not product UI (numbers band, auth.ts piece, three sentences, switch band) are marketing illustration and are exempt, but they must not contain any string from the test's `BANNED` list.
2. The guard sentence is verbatim from `plugin/hooks/check-collision.mjs` and must stay word for word, including its em dash: *"Editing it anyway risks a collision — coordinate first, or approve to proceed deliberately."* The test checks this.
3. The mock team is **Sam** (you; Claude Code; spawns Sam · 2 and Sam · 3), **Lena** (Cursor; session-guard refactor; holds `src/api/**`), **Jonah** (Codex; test fixtures; holds `tests/**`). Repo is `northwind/api`, team is `Northwind`. Change the names in `app-shots.tsx` from Kai/Rio/Nova to Lena/Jonah/Sam so the Console recreation matches. Nothing on the page may show a real team, repo, or person.
4. Copy is final as written in section 4. No em dashes anywhere in page copy (the guard sentence is the one exception, because it is the product's output). Do not "improve" the copy.
5. The page must render its complete final state on the server. A reader with JavaScript off, a crawler, or a reduced-motion user sees the whole page with nothing hidden. Motion only ever starts from a state the client sets after mount.
6. Primary action is **Download for Mac**, everywhere. Sign-in with GitHub does not appear on the site; it happens inside the app.
7. No prices, plans, trials or cards anywhere on the site. The only money words are "free" and "no card".
8. The site speaks as a team: first person plural ("we", "us") wherever the site refers to whoever makes DevBrain. Never "I" or "me" in the site's own voice. ("I" in a FAQ question is the visitor speaking and is fine.) No personal name appears on Home or FAQ; the operator is identified only in the Terms and Privacy pages, as those require.

---

## 2. Layout

Desktop canvas is 1440 wide. Content column is 1140 with 28px side padding (1084 usable), centred; this is the existing `Section` wrapper (`max-w-[1140px] px-6 sm:px-8`), keep it.

Vertical rhythm, top of each beat to the previous content: 110px on desktop (`pt-[110px]`), 72px below 1024, 56px on phones.

Page ground is `--lp-page` (#e7e1d4). Windows lift off it with `.lp-win`.

| Breakpoint | Behaviour |
|---|---|
| ≥ 1280 | Layout exactly as the artboard. Desktop scene shows Console and panel overlapping. |
| 1024 to 1279 | Content column shrinks to the viewport minus 48px. Desktop scene scales down proportionally (wrap it in a container with `aspect-ratio: 1084 / 660` and scale the inner 1084-wide stage with `transform: scale(w/1084)`, origin top-left). Numbers band drops to a 2×2 grid. Switch band stacks its two columns. |
| 768 to 1023 | Hero headline 48px. Desktop scene shows the panel only (hide the Console recreation as the current page already does with `hidden lg:block`). auth.ts piece: the chat window sits below the band instead of overlapping it. Three sentences 28px. Spawn window tabs scroll horizontally. |
| < 768 | Hero headline 40px, lede 15.5px. Everything single column. Numbers band 2×2 with 64px numerals. auth.ts band 260px tall, filename 72px, chat window full width below. Spawn window: show only the active tab as a label above the transcript. Switch band: switch and label on one row, four numbers 2×2 at 48px. Download card padding 24px. |

Never let the body scroll horizontally. Any window recreation wider than the viewport goes inside its own `overflow-x:auto` container.

---

## 3. Design tokens

All values already exist in `globals.css` under `.lp` (the landing overrides) or the root `--wg-*` set. Use the Tailwind aliases from `tailwind.config.ts` where one exists.

| Token | Value | Used for |
|---|---|---|
| `--lp-page` | #e7e1d4 | page ground |
| `--wg-ink` (`bg-ink`) | #f4f1ea | composed bands, panel body, window body |
| `--wg-row` (`bg-row`) | #fbfaf6 | cards, panel header, download card |
| `--wg-pane` (`bg-pane`) | #f8f6f0 | Console list pane |
| `--wg-row2` (`bg-row2`) | #ebe6da | selected rows, avatar fill |
| `--wg-line` / `--wg-line2` / `--wg-line3` | #e3ded2 / #d6d0c2 / #c8c2b4 | hairlines, card borders, stronger borders |
| `--wg-txt` (`text-txt`) | #1d1b17 | headings, primary text |
| `--wg-body` (`text-body`) | #3a3630 | ledes |
| `--wg-muted` (`text-muted`) | #625e56 (landing) | secondary text, labels inside visuals |
| `--wg-faint` | #9b968a (app) | mono labels inside windows |
| `--wg-go` / `--wg-wait` / `--wg-stop` | #1d9a55 / #a86b12 / #bc2a2f | lights, Lena/Jonah colours, big numerals |
| `--wg-accent` | #c9554c | panel accents, Sam's cursor tag |
| `--wg-accent-text` (`text-accenttext`) | #a53a33 (landing) | accent as text (AA on the ground) |
| `--wg-accent-strong` (`bg-accent2`) | #c14b43 | primary button, active tab underline, ×3 badge |
| `--wg-coral-ink` / `--wg-coral-line` | #fbe8e5 / #f0b8b2 | the pink guard note, "you" avatar |
| `--wg-wait-bg` / `--wg-wait-line` | #fcf1dc / #edcf92 | Lena's chat avatar |
| `--wg-code-bg` / `--wg-code-fg` | #1b1916 / #e6dfd2 | spawn window body |
| code title bar | #242019 (bar), #2e2922 (tab strip) | spawn window chrome |
| `.lp-win` | radius 11, border 1px rgba(60,40,20,.16), shadow `0 1px 1px rgba(60,40,20,.10), 0 8px 18px rgba(60,40,20,.10), 0 34px 70px rgba(60,40,20,.22)` | every window |
| front-window shadow | `0 1px 1px rgba(60,40,20,.14), 0 12px 26px rgba(60,40,20,.18), 0 44px 90px rgba(60,40,20,.32)` | the panel in the desktop scene |
| band | radius 12, `bg-ink`, border 1px `--wg-line2` | numbers band, auth.ts band, sentences band, switch band |
| traffic lights | #ec6a5e / #f4bf4f / #61c554, 11px | title bars |

Type ramp (desktop):

| Role | Face | Size / weight / tracking / leading |
|---|---|---|
| H1 | Bricolage (`font-display`) | 68 / 500 / −.035em / 1.0 |
| H2 | Bricolage | 38 / 500 / −.028em / 1.08, max 20ch |
| Band headline ("Since Lena logged off") | Bricolage | 56 / 500 / −.035em / 1 |
| Big numerals | Bricolage | 96 / 500 / −.04em / 1 (switch band: 64) |
| Three sentences | Bricolage | 38 / 500 / −.025em / 1.22, paths in Plex Mono 31 |
| Guard sentence | Bricolage | 26 / 500 / −.02em / 1.3, path in Plex Mono 22 |
| Lede | Plex Sans | 16.5 / 400 / 1.6, max 54ch; hero lede 17.5, max 60ch |
| Body note under a band | Plex Sans | 14.5 / 400 / 1.6, muted, max 62ch |
| Buttons | Bricolage | 16.5 / 600 / −.01em (hero), 15.5 (download card), 13 (nav) |
| Labels inside visuals | Plex Mono | 12 / 400, muted; uppercase labels 11 with .12em tracking. No captions under visuals. |
| Panel and Console text | as in `app-shots.tsx` and the panel (13.5 body, 13 rows, 11.5 sub, 10 mono) | |

---

## 4. Page structure and copy (final)

### 4.1 Header (keep as is)
Brain mark 26×21 · "DevBrain" Bricolage 17/600 · right: FAQ · **Download for Mac** button (accent-strong, white, 13px, radius 8, download icon 14px). Sticky, `bg-[color:var(--wg-ink)]/70 backdrop-blur`, bottom hairline `--wg-line2`.

### 4.2 Hero (centred)
- H1: `Work like you're the <accent-text>only one</accent-text> in the repo.` max 16ch, centred.
- Lede (17.5, max 60ch, centred): *You're not. Your agents just handle it. They know who's in which file, they steer around each other, and the PRs land in the right order without you refereeing any of it.*
- Buttons, centred, 14px gap: **Download for Mac** (primary, padding 14×24, download icon 18px) · **Read the FAQ →** (ghost: `bg-row`, 1px `--wg-line2`, padding 13×22; links to `/faq`).
- Under buttons, 13px muted: *Mac only for now. You sign in with GitHub once the app is open. No card.*
- Beta pill, 22px below: green dot · `{spotsLeft}` (Plex Mono 13/500) · *beta spots left · free until the beta ends*. Pill: 1px `--wg-line2`, `bg-row`, radius 999, padding 7×16. `spotsLeft` is real, from `platformCounts()` as today. When the beta is full, swap the primary button for `EmailForm` exactly as the current page does.
- **Desktop scene**, 56px below the pill, 1084×660, text-align left. No menu bar, no caption.
  - `ConsoleWindow` (existing) at left 0, top 0, width 900. Its grid is `180px 272px 1fr`, so the reading pane is 448 wide here; that is fine, the panel covers its right edge.
  - `PanelWindow` (new, section 5.1) at right 0, top 0, width 440, front-window shadow.
  - Below the scene, 22px, left aligned, Plex Sans 14.5/1.6 body, max 62ch: *The panel lives in the bottom corner of your screen. Move your mouse into the corner, a small badge appears, click it and the panel opens. Move away and it's gone.* (This describes the shell's real hot-corner behaviour in `widget/src-tauri/src/main.rs`: hot zone in the chosen bottom corner, badge pops in, click opens the panel.)
- 14px below that, same style: *That's your side of it. Your agents don't use the panel. They read and write the same thing directly, through the plugin: who's where, what's claimed, what was decided, what's next. Everything below this is them doing that on their own.*

### 4.3 Beat 1: the brief
- H2: *Every session starts already caught up.*
- Lede: *Nobody writes a status. When a session opens, DevBrain hands the agent what happened since it last looked: who's active, what got merged, what was decided, what a teammate left half-done. It's put together from what actually happened, so it's never stale.*
- `NumbersBand` (5.2), 32px below.
- Note under band (14.5 muted, max 62ch, 22px below): *It can dig further on its own, too. Before an agent goes exploring the codebase, it can ask the team's memory whether anyone has dealt with this before, and get back what past sessions learned, tried, and gave up on, with a name and a date on each.*

### 4.4 Beat 2: the guard
- H2: *It stops the second agent before it writes.*
- Lede: *Lena's agent and Sam's agent both go for `auth.ts` around 9:14. Without DevBrain they find out at 4:30, from a merge conflict. With it, the second one gets stopped before it touches the file.* (`auth.ts` in Plex Mono 14.5, txt colour.)
- `CollisionPiece` (5.3), 36px below.
- `GuardNote` (5.4), 28px below the piece.

### 4.5 Beat 3: routing
- H2: *They stay out of each other's way on their own.*
- Lede: *When an agent starts a task, it claims the files that task is likely to touch, and every other agent on the repo steers around them until the work lands. When your agent asks what's next, it gets the highest-priority task whose files nobody else is in. You never type a path.*
- `SentencesBand` (5.5), 32px below.
- Note under band: *Claims let go by themselves. They release when the work lands and expire on a timer as a backstop, so a forgotten one never blocks anybody. Starting a bigger job, like a refactor or a migration? The agent claims the area up front with a one-line note, and everyone else's agent reads it.*

### 4.6 Beat 4: spawn
- H2: *Run more agents than you have people.*
- Lede: *One command spawns another agent on a fresh clone of the repo. It shows up as its own session, gets its own guard and its own claims, and is handed a task whose files are free. Three of your own sessions coordinate with each other exactly the way three teammates would.*
- `SpawnWindow` (5.6), 32px below.
- Note under: *Your spawned sessions are teammates too. Each shows up on the team board under its own name, and if one of them wanders into a file another one is in, it gets the same stop as it would from Lena.*

### 4.7 Beat 5: pull requests
- H2: *PRs merge themselves, in the right order.*
- Lede: *Every open PR gets a light. Green means approved, conflict-free, and its turn. When two PRs touch the same files, the one that should land first goes green and the other one waits, so each takes a small rebase instead of one big mess at the end. Turn on auto-merge and DevBrain presses merge the moment a PR goes green, and keeps the waiting ones up to date with main.*
- `SwitchBand` (5.7), 32px below.
- Note under: *Every write is a branch and a PR, or the merge of a PR a person approved. Anything branch protection would block, DevBrain can't do either. Working alone? Flip one more switch and a clean PR that DevBrain's own review passed goes green, labelled as AI-reviewed so nobody mistakes it for a teammate's approval.*

### 4.8 Download card
Card: radius 16, 1px `--wg-line2`, `bg-row`, padding 48×44.
- H2: *Try it on one repo.*
- Lede: *Download it, sign in with GitHub, pick a repo. It takes about five minutes. The next time anyone on the team opens a session, it will know who else is there.*
- Row: **Download for Mac** (primary) · green dot · `{spotsLeft}` · *beta spots left · free until the beta ends*.
- 13px muted below: *Signing in doesn't give DevBrain access to your code. You pick the repo yourself, after.*
- Hairline, then: *Not on a Mac, or not ready yet? Leave your email and we'll let you know.* and the existing `EmailForm` (placeholder `you@company.com`, button label **Send**).

### 4.9 Footer
Links: DevBrain · FAQ · Privacy · Terms. No credit line. Trademark line from `LEGAL.trademarks` unchanged. The site does not name the operator anywhere except where the Terms and Privacy pages require it.

### 4.10 FAQ page (`/faq`, replaces How it works)
Same header (FAQ shown as the current item, no link) and footer as Home. Same page ground. No composed visuals; this page is text.

- H1 (Bricolage 56/500/−.035em/1.02, max 17ch): *The questions people ask before they download.*
- Lede (16.5, max 58ch): *Short answers, no marketing. If yours isn't here, the [privacy page](/privacy) has the long version of most of them, and the repo is public.*
- 56px below, a two-column grid (1fr 1fr, 56px column gap). Each item: top hairline `--wg-line2`, padding 22 0 24; question Bricolage 21/500/−.015em, max 24ch; answer paragraphs Plex Sans 14.5/1.65 body, max 50ch, 8px between paragraphs; inline code Plex Mono 13; links accent-text. Eleven items, six in the left column and five in the right, in this order and with this copy (verbatim, from `FAQ.artboard.html`):
  - Left: Does it see my code? · Does it write to my repos? · What does it actually install? · Will it slow my agent down? · Do we all have to use the same agent? · Can I use it on my own?
  - Right: How does the panel work? · Do I need the Mac app? · What about sessions I spawn myself? · What does it cost? · What happens to my data if I stop using it?
- 80px below, the download card from 4.8 without the email form (headline, lede, button row, the sign-in line).
- Motion: H1 and lede as the Home hero (mount). Each Q&A item reveals on scroll (opacity 0→1, y 12→0, 500ms, `once: false`), items staggered 60ms within whichever column enters. Download card as on Home.
- Two answers make promises on the team's behalf ("you'll hear it from us first, and nothing will ever be charged to a beta team without asking"; "Ask and we'll delete the team's data entirely"). They are deliberate. Do not soften them.
- "Do I need the Mac app?" is answered with an unqualified yes. Nothing on the site may suggest DevBrain can be used without the app; do not mention the manual `/plugin` commands on the site.

### 4.11 Terms and Privacy pages (`/terms`, `/privacy`)
Replace the content of both existing pages with the two Markdown documents in this folder, `DevBrain-Terms-of-Use.md` and `DevBrain-Privacy-Policy.md`. Render them as prose pages in the site's style: the Home header and footer, page ground `--lp-page`, a single 720px column, H1 Bricolage 44/500, section headings Bricolage 22/500, body Plex Sans 15.5/1.7 body colour, lists with 8px between items, links accent-text. No composed visuals.

Both documents contain bracketed placeholders ([DOMAIN], [EMAIL], [SECURITY EMAIL], governing law and venue, [EFFECTIVE DATE], provider names, region, two retention figures). Leave them as bracketed text in the page source until Luke supplies the values; do not invent them. When they are filled, update `LEGAL.operator`, `LEGAL.contact` and `LEGAL.effective` in `src/lib/legal.ts` to match, because the app reads those constants too. Remove the "GitHub issues page" contact wording from `legal.ts` at the same time.

The "trading as DevBrain" wording and "legal name and address available on request" are deliberate: the operator is a sole proprietorship and the site does not print a personal name.

### 4.12 Pages still to be designed (not in this revision)
These are needed before launch and will arrive as a later revision with their own artboards; do not build placeholders for them now:
- a custom 404 page in the site style;
- the beta-full state on the FAQ download card (Home already specifies its own in section 8);
- an after-download page at `/start` (open the DMG, drag to Applications, open it from there, sign in with GitHub, pick a repo), which the app's onboarding can link to;
- the social card (Open Graph image 1200×630, title, description) and site metadata (favicon from the brain mark, canonical, robots, sitemap).

---

## 5. Components

All new components go in `src/app/landing/`. Mock data is passed as props with the defaults below so the names live in one place (`src/app/landing/mock-team.ts` exporting `TEAM = { you: "Sam", cursor: "Lena", codex: "Jonah", repo: "northwind/api", team: "Northwind" }`).

### 5.1 `PanelWindow` (product UI; add to the test's FILES)
Recreation of the panel's Home tab (the panel opens from the bottom corner of the screen when the mouse reaches it), 440 wide, `bg-ink`, `.lp-win`. Build from `src/app/widget/app.tsx` and the artboard's `.pn*` markup. Contents, top to bottom:
- Header (`bg-row`, padding 14 16 8): brain mark 20px with glow · "DevBrain" Bricolage 15/700 · live dot 6px `--wg-go` with `0 0 8px` glow · right: team name 11.5 faint · repo picker `northwind/api ▾` (mono 11, 1px `--wg-line2`, radius 7) · gear ⚙ 15px muted.
- Tabs (`bg-row`, bottom hairline): Home (active: `text-accent`, 2px `bg-accent2` underline) · Tasks · PRs (5px `--wg-wait` attention dot).
- Body (padding 0 16 16): Pulse strip (72px; label `last hour · 3 people · 3 PR events · collision`, the SVG trace with the coral gradient fill, three event dots, the red now-dot, dashed now-line, axis `−60m −30m now`); **Needs you 3** with rows `#133 has conflicts / Auth refactor — resolve against main / Fix`, `#128 is cleared to land / cleared to land — press merge / Merge`, `Handoff from Jonah on chore/coverage / auth tests need the new fixture / Pick up`; the four counts `3 PRs · 1 conflict (stop) · 1 collision (stop) · 4 open tasks`; **Team now 3** with Lena · Cursor · *refactoring the session guard* · since 09:02, Jonah · Codex · *adding coverage for the auth fixtures* · since 09:41, **you** · Claude · *wiring the login form* · since 09:14 with the `×3` badge on the avatar; **Open the Console** button row.
- Omit Pinned, Open handoffs and the Claim a lane form from the recreation (they exist in the app; the page just does not show them).
- Row strings above are the real formats from `needs-you.ts` and `traffic.ts` (they contain em dashes because the product does).

### 5.2 `NumbersBand`
Band, padding 40 48 36. Headline *Since Lena logged off on Friday<accent-text>.</accent-text>* (56). Four columns, 24px gap: numeral 96 in colour, label 14/500, detail Plex Mono 11.5 muted.

| Numeral | Colour | Label | Detail |
|---|---|---|---|
| 17 | go | PRs merged | #112 to #128 · rate limiting, the new fixture, docs |
| 5 | wait | decisions logged | tokens are hashed, never stored · and four more |
| 3 | wait | dead ends recorded | mocking the clock in the login spec · and two more |
| 2 | accent-text | handoffs waiting for Sam | the auth fixture from Jonah · CI wiring from Lena |

Rule 36px below (1px `--wg-line2`), then a row: avatar S (34px, radius 9, coral) and *<b>Sam's session opened Monday at 09:02 with all of it in front of it.</b> She didn't ask Lena, or anyone, anything. Neither did her agent.* (15.5, body).

### 5.3 `CollisionPiece`
Container 1084×480, relative.
- Band 1084×360 at 0,0: `src/api/auth.ts · 09:14` mono 12 muted at 28,22. Filename `auth.ts` Plex Mono 128, tracking −.045em, at left 64 top 112. Lena's cursor (SVG pointer 26×30, fill `--wg-wait`, 1.5 stroke `--wg-ink`) at 104,70 with tag *Lena · Cursor* (mono 10.5, white on `--wg-wait`, radius 6, padding 3×8) at 126,96. Sam's cursor (fill `--wg-accent-strong`) at 430,242 with tag *Sam · Claude Code* on accent-strong at 452,268. Bottom-left mono 12 in `--wg-stop`: `2 agents · 0 aware`.
- Chat window (`.lp-win`, `bg-row`, 440 wide) absolute at right 0, top 112. Title bar with traffic lights and `# eng-backend`. Four messages, 13.5/1.5, avatars 32px radius 7 (S on coral-ink/accent-text, L on wait-bg/wait), name bold + time mono 11 faint:
  - Sam 4:31 PM · *hey is anyone in auth.ts? just got a conflict on my login PR*
  - Lena 4:38 PM · *yeah since this morning, session guard refactor. did you change login()?*
  - Sam 4:38 PM · *rewrote it*
  - Lena 4:39 PM · *ok. call?*
- Label `seven hours later` mono 12 muted at right 0, top 82.

### 5.4 `GuardNote`
Full width, radius 12, 1px `--wg-coral-line`, `bg-coral-ink`, padding 28 32 26.
- Label mono 11.5 accent-text: `09:14:07 · what Sam's agent gets back, before it touches the file`
- Sentence, Bricolage 26/500/1.3, max 40ch: *DevBrain: `src/api/auth.ts` is being worked on right now by Lena (claimed: refactoring the session guard). Editing it anyway risks a collision — coordinate first, or approve to proceed deliberately.* (Path in Plex Mono 22. The second sentence is the verbatim guard string; the first sentence is the guard's real format with mock values.)
- Paragraph 13.5/1.6 body, max 70ch: *Her agent shows her that and waits. DevBrain never decides for you. It just makes sure you get asked. Cursor can't ask, only refuse, so there the edit is blocked until you tell the agent what to do.*

### 5.5 `SentencesBand`
Band, padding 44 48 40. Three lines, Bricolage 38, max 26ch, names coloured (Lena `--wg-wait`, Jonah `--wg-go`, Sam `--wg-accent-text`), paths Plex Mono 31:
1. *Lena's agent claimed `src/api/**` when it started the guard refactor.*
2. *Jonah's agent claimed `tests/**` when it picked up the fixtures.*
3. *Sam's agent was handed the one task that touched neither.*

Counter row 30px below, 26px gap, 13px muted, numerals Bricolage 28/500 txt: `0 paths typed by a person` · `0 messages about who's where` · `3 agents, none in each other's files`.

### 5.6 `SpawnWindow` (product-adjacent; add to the test's FILES)
`.lp-win`, full width. Tab strip `#2e2922`, 38px: traffic lights, then tabs (Plex Mono 12, `rgba(255,255,255,.55)`, right hairline `rgba(0,0,0,.35)`, green 7px dot each): `Sam · src/ui/**`, **`Sam · 2 · src/api/limits/**`** (active: `bg-code-bg`, white), `Sam · 3 · tests/**`, `+`. Body `bg-code-bg`, padding 20 22, min-height 230, Plex Mono 12.5/1.8, `text-codefg`, tones as `terminal.tsx`:

```
$ devbrain spawn
  token "Sam · 2" minted · cloned northwind/api → ~/dev/northwind-api-2

› rate limit the token endpoint

● DevBrain brief: Sam is in src/ui/**, Sam · 3 is in tests/**. #44 is yours; its files are free.
● devbrain - start_task (MCP)(id: "t_44")
  ⎿  started · claimed src/api/limits/** for 8h
● Update(src/api/limits/limiter.ts)▍
```

`$` and `⎿` lines dim, `›` prompt dim with the command bright, `●` ok-green, paths in warn-amber. Reuse the `Terminal` reveal logic (setInterval, 6s safety, full transcript on the server). The tool names `devbrain spawn`, `start_task`, `Update(...)` are real; the exact wording the agent prints is illustrative, keep it as written.

### 5.7 `SwitchBand`
Band, padding 40 48 36, two columns 1fr 1fr, 48px gap, aligned centre.
- Left: toggle (64×36, radius 999, `--wg-go`, white 30px knob with `0 1px 3px rgba(0,0,0,.25)`) and *Auto-merge approved green PRs* (Bricolage 26/500). Paragraph 14/1.6 muted, max 44ch: *When a PR's light turns green, a teammate approved it, it's conflict-free, and it's this PR's turn in the merge order, DevBrain presses merge for you. A PR only the AI cleared is never auto-merged. Branch protection still applies.* Then mono 11.5 faint: `Settings → Rules · per repo · admin only · off by default`.
- Right (left hairline, padding-left 48): label `since you flipped it` (mono 11 uppercase .12em faint), 2×2 grid, 18px gap, numerals Bricolage 64/500: **23** go *PRs merged by DevBrain* · **9** wait *branches updated from main* · **0** txt *pushes to main* · **0** txt *merged without a human's approval*.
- The rule label is the real one from `src/lib/rules-catalog.ts`; the paragraph is its real `detail` text minus the em dashes. See open decision D1 for the four numbers.

### 5.8 Buttons
| Variant | Rest | Hover | Focus | Active |
|---|---|---|---|---|
| Primary (`Download for Mac`) | `bg-accent2` white, radius 10 | background #b4453d, translateY(−1px), 120ms | 2px `--wg-accent` outline, 3px offset (already in `.lp :focus-visible`) | translateY(0), 60ms |
| Ghost (`Read the FAQ →`) | `bg-row`, 1px `--wg-line2` | border `--wg-line3`, arrow translateX(2px) | same | same |
| Nav links | muted | txt | same | |

The download icon is the 16-viewBox arrow-to-tray path used on the artboard.

---

## 6. Routes and data

- **`/download`**: new route handler. Resolve the latest release asset from GitHub Releases (`lukeb230/devbrain`, asset matching `*.dmg`; prefer the stable channel) and 302 to it. Cache the lookup for 5 minutes. If no asset resolves, 302 to the releases page. Every "Download for Mac" button links here. Do not gate it behind sign-in.
- **Beta counter**: unchanged, `platformCounts()`. The mock "148" on the artboard is a placeholder for the real number.
- **Email form**: unchanged (`EmailForm`, source `landing`), button label **Send**.
- **`/faq`**: new page, section 4.10. `/how-it-works` 301s to `/faq`.
- **`/terms`, `/privacy`**: rebuilt from the Markdown documents, section 4.11.
- **`/pricing`**: removed, 301 to `/`. Remove every link to it (header, footer, FAQ, any onboarding notice that points at the pricing page for the marketing site; the in-app billing pages are not part of this work).

---

## 7. Motion

### 7.1 Library and mechanics
Use `motion` (Motion for React, `import { motion, useInView, useReducedMotion, useMotionValue, animate } from "motion/react"`). Install the current major; it supports React 19 / Next 15.

One hook, `useReveal(ref, { amount })`, wraps `useInView(ref, { once: false, margin: "-15% 0px -15% 0px", amount })` and returns `visible`. `once: false` is what makes every animation replay when the element scrolls back into view from either direction. Every animated element renders `initial={false}` on the server (so the DOM is complete), then on the client sets `animate={visible ? "in" : "out"}` with variants. Exit ("out") is always faster than enter ("in"): enter 600 to 900ms, exit 250ms, so scrolling up never feels laggy.

Easing: enter `[0.16, 1, 0.3, 1]` (the same curve the app's `lp-interrupt` uses), exit `[0.4, 0, 1, 1]`. Only `opacity` and `transform` are animated; no layout properties, no `filter`, no box-shadow animation. Add `will-change: transform` only on elements that are currently animating (Motion does this).

Stagger children with `staggerChildren: 0.07`, `delayChildren: 0.05`. Groups arrive as groups.

Counting numerals: `useMotionValue(0)` + `animate(mv, target, { duration: 0.9, ease: [0.16, 1, 0.3, 1] })` when `visible`, `animate(mv, 0, { duration: 0.25 })` when not; render `Math.round`. Numerals use `font-variant-numeric: tabular-nums` so widths do not jitter.

Reduced motion: `useReducedMotion()` true → every variant is `{ opacity: 1, x: 0, y: 0, scale: 1 }` in both states, counters render their target immediately, typing renders the full transcript, the switch renders on. The page must look identical at rest with or without motion.

### 7.2 Per-element spec

| Element | Trigger | In | Out | Duration / delay |
|---|---|---|---|---|
| Hero H1 | mount (not scroll) | opacity 0→1, y 24→0 | n/a | 700ms, 0 |
| Hero lede, buttons, sub-line, pill | mount | opacity 0→1, y 16→0, staggered | n/a | 600ms, stagger 80ms from 150ms |
| Desktop scene: Console | in view | opacity 0→1, y 28→0, scale .985→1 | reverse | 800ms, delay 100ms |
| Desktop scene: Panel | in view | opacity 0→1, y 24→0 (rises from the bottom corner, the way it opens), scale .98→1, origin bottom right | reverse | 700ms, delay 420ms |
| Every H2 | in view (amount .6) | opacity 0→1, y 18→0 | opacity→0, y→10 | 600ms |
| Every lede, note and the two lines under the scene | in view | opacity 0→1, y 12→0 | opacity→0 | 600ms, delay 80ms after its H2 |
| NumbersBand headline | in view (amount .4) | opacity 0→1, y 16→0 | reverse | 600ms |
| NumbersBand numerals | in view | count 0→target; column opacity 0→1, y 14→0, stagger 90ms | count→0 (250ms), opacity→0 | 900ms, first column at 200ms |
| NumbersBand closing row | in view | opacity 0→1, x −10→0 | reverse | 600ms, delay 700ms |
| CollisionPiece band | in view (amount .3) | opacity 0→1 | opacity→0 | 400ms |
| `auth.ts` filename | in view | opacity 0→1, scale .96→1, origin left | reverse | 700ms, delay 100ms |
| Lena's cursor + tag | in view | opacity 0→1, x −40→0, y −24→0 | reverse | 600ms, delay 350ms |
| Sam's cursor + tag | in view | opacity 0→1, x 40→0, y 24→0 | reverse | 600ms, delay 500ms |
| `2 agents · 0 aware` | in view | opacity 0→1 | opacity→0 | 400ms, delay 800ms |
| Chat window | in view | opacity 0→1, x 48→0, y 8→0 | opacity→0, x→24 | 700ms, delay 1100ms (the pause is the seven hours) |
| Chat messages | after window | opacity 0→1, y 6→0, stagger 140ms | opacity→0 | 400ms each |
| `seven hours later` | with window | opacity 0→1 | opacity→0 | 400ms, delay 1000ms |
| GuardNote box | in view (amount .5) | opacity 0→1, y 16→0, then one `lp-interrupt` pulse (already in globals.css) | reverse, no pulse | 600ms |
| GuardNote sentence | in view | opacity 0→1 line by line (split on the two sentences) | opacity→0 | 500ms, stagger 220ms from 250ms |
| GuardNote paragraph | in view | opacity 0→1 | opacity→0 | 500ms, delay 800ms |
| SentencesBand lines | in view (amount .5) | each line opacity 0→1, y 14→0, stagger 260ms | opacity→0, stagger 0 | 600ms |
| SentencesBand counters | in view | opacity 0→1, y 8→0, numerals count, stagger 100ms | reverse | 500ms, delay 900ms |
| SpawnWindow tabs | in view (amount .4) | each tab opacity 0→1, y −6→0, stagger 120ms; active tab underline last | opacity→0 | 400ms |
| SpawnWindow transcript | in view | typing reveal (existing Terminal mechanics, 2 chars/16ms, 6s safety) | reset to empty on exit, retype on re-entry | up to 6s |
| SwitchBand toggle | in view (amount .5) | knob x 0→28 with `spring(stiffness 500, damping 32)`, track `--wg-line3`→`--wg-go` | reverse | 450ms, delay 150ms |
| SwitchBand label + paragraph | in view | opacity 0→1, x −10→0 | reverse | 600ms |
| SwitchBand numerals | in view | count 0→target, opacity 0→1, y 12→0, stagger 110ms; the two zeros animate opacity/y only | count→0, opacity→0 | 900ms, first at 500ms (after the toggle lands) |
| Download card | in view (amount .3) | opacity 0→1, y 24→0, scale .99→1 | reverse | 700ms |
| Download card children | in view | opacity 0→1, y 10→0, stagger 70ms | opacity→0 | 500ms |
| Footer | in view | opacity 0→1 | opacity→0 | 400ms |

Hover motion (not scroll): primary button lifts 1px and darkens (120ms); `.lp-win` windows do not react to hover; the chat window and panel are static once landed.

### 7.3 Performance rules
- Each scene runs at most ~12 simultaneous animated elements; the panel and Console animate as single layers (animate the wrapper, not their rows).
- No scroll-linked (`useScroll`) effects on this page; everything is threshold-triggered, which keeps scrolling itself smooth.
- Images: the brain mark only (`/brain.png?v=3`); no other raster. All cursors, dots and the pulse trace are inline SVG.
- Lighthouse target on desktop: no CLS from motion (initial state is the final layout, only opacity/transform change), LCP is the H1 text.

---

## 8. States and edge cases

| Element | State | Behaviour |
|---|---|---|
| Beta pill / download row | spots available | real count, green dot |
| | beta full (`spotsLeft === 0`) | primary button replaced by `EmailForm source="beta_full"`, pill hidden, download card headline *The beta is full. Get the next place.* and lede *All {maxTeams} places are taken. Leave an address and you'll hear when one opens.* (existing behaviour, new wording) |
| `/download` | no release asset | redirect to the releases page |
| Email form | submitting / error / done | existing `EmailForm` states, unchanged |
| Long names | the mock team is fixed; the components take names as props but truncate at 12 characters with an ellipsis in the panel rows and chat headers |
| Narrow viewports | see section 2; nothing may overflow the viewport width |
| JS off | full page, final state, no motion, buttons work (they are plain links) |
| Reduced motion | full page, final state, counters at target, transcript complete, switch on |

---

## 9. Accessibility

- Heading order: one `h1` (hero), `h2` per beat and for the download card. The band headline "Since Lena logged off on Friday." is a `p` with a class, not a heading.
- All composed visuals are `figure` elements with an `aria-label` describing the picture in one sentence (there are no visible captions); decorative SVG cursors, dots and the pulse trace are `aria-hidden`.
- The chat window and the panel recreation carry `aria-label="Illustration: ..."` and `role="img"`; their inner text is not read as live UI.
- Counters expose the final value in the DOM (`aria-live` off; the number is text) so screen readers get "17", never the counting.
- Focus order follows the DOM: header links, hero buttons, then each beat, then download button, email input, Send, footer links. Focus style is the existing `.lp :focus-visible`.
- Contrast: all text on the ground uses the landing overrides (`--wg-muted` #625e56, `--wg-accent-text` #a53a33) which pass AA; do not use the app's #9b968a for anything outside a window recreation.
- Motion respects `prefers-reduced-motion` (section 7.1).

---

## 10. Tests and acceptance

1. `npm test` passes, including `no-invented-ui.test.ts` with `PanelWindow` and `SpawnWindow` added to `FILES`. If a label in `PanelWindow` is not found in the app, the label is wrong, not the test.
2. A Playwright smoke test renders `/` at 1440, 1024, 768 and 390 wide with JS disabled and asserts: no horizontal overflow, the H1 text, the guard sentence verbatim, and that every `Download for Mac` link points to `/download`.
3. The same test with JS on scrolls to the bottom and back to the top and asserts that the numerals read 17 / 5 / 3 / 2 at rest at the end.
4. `prefers-reduced-motion: reduce` snapshot at 1440 matches the artboard within reason (no hidden elements).
5. `/pricing` and `/how-it-works` return 301s to `/` and `/faq`; no page on the site contains the strings "Pricing", "$29", "$99", "per seat" or "trial" (assert with a grep over `src/app/landing`, `src/app/faq` and the header/footer).
6. No em dash appears in `landing.tsx` or `faq` string literals except inside the guard sentence and the product row strings in `PanelWindow` (assert with a grep in the test).

---

## 11. Open decisions (Luke)

- **D1. The four numbers on the switch band.** Either (a) illustrative, with the mono caption `illustrative · your numbers will be your own` under the grid, or (b) real, from a query over the write log (count of `writer_auto_merge` merges and `writer_update_branch` updates for the deployment, plus the two zeros which are true by construction). (b) is honest and cheap if the write log already records the rule that produced each write. Default if undecided: (a).
- **D2. Beta counter.** Stays real (recommended). The artboard's 148 is a placeholder.
- **D3. Notarization.** The `/download` route only makes sense once the DMG opens without the "damaged" dialog. Ship the page with the route, but do not announce until the notarized build is on Releases.
- **D4. Resolved.** How it works is replaced by the FAQ page (4.10). Pricing is removed.
