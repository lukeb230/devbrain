# Site Home v2 Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four changes Luke asked for after seeing the new site live: the header mark is a home link, a tighter display face for the two hero headlines (chosen from a tryout), the collision piece's cursors move, and the spawn window's tabs are clickable with a transcript per session.

**Architecture:** All changes stay inside `src/app/landing/` and `src/app/faq/`, on the components shipped in PR #3. The font change adds a fourth `next/font` face scoped to the site through a CSS variable so the app is untouched. Cursor motion is CSS keyframes gated on the existing `data-in` reveal attribute. The spawn window becomes a small client component with tab state; switching tabs remounts the transcript so it retypes.

**Tech Stack:** Next.js 15 App Router, React 19, next/font, Tailwind aliases, vitest. No new dependencies.

**Spec:** Luke's message on 2026-09-13 (four items). Ground rules carried from `docs/site-handoff/DevBrain-Site-Handoff.md`: copy stays verbatim, no em dashes, no real people, every window label real or illustrative-and-not-banned, server output is the final state, reduced motion is fully at rest, only opacity and transform animate.

## Global Constraints

- Product repo only: `~/Downloads/devbrain-product`. Never touch `~/Downloads/devbrain`.
- No em dash in `src/app/landing/**` or `src/app/faq/**` except the guard sentence and the two panel row strings (the copy test enforces this).
- Motion: opacity and transform only; nothing hidden without JavaScript; `prefers-reduced-motion` disables every animation added here; play-once reveals stay as they are (a looping idle motion on the cursors is allowed because it is decorative and off under reduced motion).
- Illustrations that become interactive lose `role="img"` (interactive controls inside an image role are not reachable); they keep a `<figure aria-label>`.
- Strings inside `spawn-window.tsx` are checked by `src/lib/__tests__/no-invented-ui.test.ts` (BANNED list); tool names in transcripts must be real (`devbrain spawn`, `start_task`, `claim_area`, `get_team_context`, `Update(...)`, `Write(...)`, `Read(...)`).
- Tests: `npm test`, `npm run typecheck`, `npm run build`. Visual checks on a Vercel preview (local dev has no database).
- Commit trailers on every commit:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH`

---

### Task 1: The header mark is a home link

**Files:**
- Modify: `src/app/landing/landing.tsx` (`SiteHeader`, the `<img>` + wordmark at lines ~112-113)
- Test: `src/lib/__tests__/site-copy.test.tsx` (one assertion)

**Interfaces:**
- Produces: the header's mark and wordmark wrapped in one `<Link href="/" aria-label="DevBrain home">` on every page that uses `SiteHeader` (Home and FAQ).

- [ ] **Step 1: Failing test**

Add to `src/lib/__tests__/site-copy.test.tsx`, inside the existing describe, rendering `SiteHeader` (import it from `@/app/landing/landing`):

```tsx
  it("the header mark links home on every page", () => {
    const header = renderToStaticMarkup(<SiteHeader current="faq" />);
    expect(header).toMatch(/<a [^>]*href="\/"[^>]*aria-label="DevBrain home"[^>]*>/);
    expect(header).toContain("DevBrain</span>");
  });
```

Run: `npx vitest run src/lib/__tests__/site-copy.test.tsx` → FAIL (no such anchor).

- [ ] **Step 2: Implement**

In `SiteHeader`, replace

```tsx
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brain.png" width={26} height={21} alt="" />
          <span className="font-display text-[17px] font-semibold tracking-[-.02em] text-txt">DevBrain</span>
```

with

```tsx
          <Link href="/" aria-label="DevBrain home" className="-my-2 flex items-center gap-5 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brain.png" width={26} height={21} alt="" />
            <span className="font-display text-[17px] font-semibold tracking-[-.02em] text-txt">DevBrain</span>
          </Link>
```

(`Link` is already imported in the file.) The visible layout is unchanged: same gap, same sizes.

- [ ] **Step 3: Tests, commit**

```bash
npx vitest run src/lib/__tests__/site-copy.test.tsx && npm run typecheck
git add src/app/landing/landing.tsx src/lib/__tests__/site-copy.test.tsx
git commit -m "Site: the header mark and wordmark link home"
```

---

### Task 2: Display-face tryout (Luke decides)

**Files:**
- Create: `/private/tmp/claude-501/-Users-lukebrowne-Downloads-devbrain/b240179b-df70-4cc2-9008-2cba4c63958c/scratchpad/hero-font-tryout.html` (published as an Artifact; not committed)

**Interfaces:**
- Produces: Luke's choice of one of four options, recorded in the ledger before Task 3 runs.

- [ ] **Step 1: Build the tryout page**

A single HTML page on the site's ground (`#e7e1d4`, text `#1d1b17`, accent `#a53a33`) showing the Home hero H1 (`Work like you're the only one in the repo.` with `only one` in accent, 68px, weight 500, line-height 1.0, max 16ch, centred) and the FAQ H1 (`The questions people ask before they download.`, 56px, weight 500, line-height 1.02, max 17ch) four times, one row per option, with the body lede under each in IBM Plex Sans 17.5px so the pairing is judged too. Load fonts from Google Fonts:

| Option | Face | Settings |
|---|---|---|
| A (today) | Bricolage Grotesque | tracking −.035em |
| B | Bricolage Grotesque, tightened | tracking −.05em, `font-variation-settings: "wdth" 90`, `text-wrap: pretty` |
| C | Instrument Sans | weight 600, tracking −.03em |
| D | Schibsted Grotesk | weight 500, tracking −.025em |

Each row is labelled A to D only (no face names above the fold, so the choice is made on looks). Also render each option at 390px width in a second column (headline 40px) so the phone size is part of the decision.

- [ ] **Step 2: Publish and ask**

Publish with the Artifact tool (favicon 🔤, title "Hero Face Tryout") and ask Luke: "A, B, C or D?" Record the answer in the ledger as `Ruling: display face = <letter>`. Do not start Task 3 until it is recorded.

---

### Task 3: Apply the chosen display face to the site only

**Files:**
- Modify: `src/app/fonts.ts`, `src/app/globals.css` (`.lp` block), and for option B only `src/app/landing/landing.tsx` + `src/app/faq/page.tsx` (tracking classes)

**Interfaces:**
- Produces: `siteDisplay` export from `fonts.ts` with CSS variable `--font-site-display`, included in `FONT_VARS`; `.lp{--font-display:var(--font-site-display)}` so every `font-display` utility inside the site resolves to the new face while the app keeps Bricolage.

- [ ] **Step 1: Add the face (skip this step for option A; for option B skip to Step 3)**

In `src/app/fonts.ts` add ONE of:

```ts
// option C
import { Instrument_Sans } from "next/font/google";
export const siteDisplay = Instrument_Sans({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-site-display", display: "swap" });
```

```ts
// option D
import { Schibsted_Grotesk } from "next/font/google";
export const siteDisplay = Schibsted_Grotesk({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-site-display", display: "swap" });
```

and change the last line to

```ts
export const FONT_VARS = `${display.variable} ${body.variable} ${mono.variable} ${siteDisplay.variable}`;
```

- [ ] **Step 2: Point the site at it**

In `src/app/globals.css`, inside the `.lp{…}` block, add `--font-display:var(--font-site-display);` as the first line (the Tailwind `font-display` utility reads `var(--font-display)`; only elements under `.lp` change). Then in `landing.tsx` and `faq/page.tsx` the two H1s' tracking becomes the option's value from the tryout table (C: `tracking-[-.03em]` and `font-semibold`; D: `tracking-[-.025em]`).

- [ ] **Step 3: Option B only**

No new face. In the two H1s replace `tracking-[-.035em]` with `tracking-[-.05em] [font-variation-settings:'wdth'_90] [text-wrap:pretty]` (Tailwind arbitrary properties) and remove `text-balance`.

- [ ] **Step 4: Verify the app is untouched**

`grep -rn "font-site-display" src` must show only `fonts.ts` and `globals.css` (`.lp`). `npm run typecheck && npm test && npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/app/fonts.ts src/app/globals.css src/app/landing/landing.tsx src/app/faq/page.tsx
git commit -m "Site: <face> for the two hero headlines, scoped to the site"
```

---

### Task 4: The cursors move

**Files:**
- Modify: `src/app/landing/collision-piece.tsx`, `src/app/globals.css`
- Test: `src/lib/__tests__/landing-motion.test.ts` (CSS contract)

**Interfaces:**
- Produces: CSS classes `lp-cursor-lena` and `lp-cursor-sam` applied to the two cursor `<Reveal>` wrappers; keyframes `lp-wander-a` and `lp-wander-b`; animations start only after `data-in`, loop gently, and are off under reduced motion.

- [ ] **Step 1: Failing contract test**

Append to `src/lib/__tests__/landing-motion.test.ts`:

```ts
describe("cursor motion CSS", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  it("wander keyframes exist and are gated on the reveal", () => {
    expect(css).toContain("@keyframes lp-wander-a");
    expect(css).toContain("@keyframes lp-wander-b");
    expect(css).toMatch(/html\.lp-js \.lp-cursor-lena\[data-in\]\{animation:lp-wander-a/);
    expect(css).toMatch(/html\.lp-js \.lp-cursor-sam\[data-in\]\{animation:lp-wander-b/);
  });
  it("is off under reduced motion", () => {
    const reduced = css.split("@media (prefers-reduced-motion: reduce)").slice(1).join("\n");
    expect(reduced).toMatch(/\.lp-cursor-lena[^{]*\{animation:none/);
    expect(reduced).toMatch(/\.lp-cursor-sam[^{]*\{animation:none/);
  });
});
```

(`readFileSync` from `node:fs`, add the import.) Run → FAIL.

- [ ] **Step 2: The CSS**

Append to `src/app/globals.css` after the landing motion block:

```css
/* The two cursors in the collision piece. After they reveal, Lena's drifts
   in a small loop over the filename (she is editing), Sam's creeps toward it
   and hesitates (he is about to). Transform only; off under reduced motion. */
@keyframes lp-wander-a{
  0%{transform:translate(0,0)}
  25%{transform:translate(14px,-6px)}
  50%{transform:translate(6px,10px)}
  75%{transform:translate(-10px,4px)}
  100%{transform:translate(0,0)}
}
@keyframes lp-wander-b{
  0%{transform:translate(0,0)}
  40%{transform:translate(-26px,-18px)}
  55%{transform:translate(-22px,-14px)}
  100%{transform:translate(0,0)}
}
html.lp-js .lp-cursor-lena[data-in]{animation:lp-wander-a 7s ease-in-out 1s infinite}
html.lp-js .lp-cursor-sam[data-in]{animation:lp-wander-b 5s ease-in-out 1.6s infinite}
@media (prefers-reduced-motion: reduce){
  html.lp-js .lp-cursor-lena[data-in],html.lp-js .lp-cursor-sam[data-in]{animation:none}
}
```

The reveal transition on these elements also animates `transform`; the keyframe animation takes over once the enter transition has finished (its delay is longer than the enter duration), so the two never fight.

- [ ] **Step 3: Apply the classes**

In `collision-piece.tsx` add `lp-cursor-lena` to Lena's `<Reveal fx="cursor-l" …className="…">` and `lp-cursor-sam` to Sam's `<Reveal fx="cursor-r" …>`. Nothing else changes; the `aria-hidden` SVGs stay.

- [ ] **Step 4: Tests, commit**

```bash
npx vitest run src/lib/__tests__/landing-motion.test.ts && npm run typecheck
git add src/app/globals.css src/app/landing/collision-piece.tsx src/lib/__tests__/landing-motion.test.ts
git commit -m "Site: the collision piece's cursors move once they appear"
```

---

### Task 5: Clickable spawn tabs, one transcript per session

**Files:**
- Modify: `src/app/landing/spawn-window.tsx` (becomes a client component)
- Test: `src/lib/__tests__/no-invented-ui.test.ts` (unchanged; must pass), `src/lib/__tests__/site-copy.test.tsx` (one assertion)

**Interfaces:**
- Produces: `SpawnWindow({ team })` with `useState<number>(1)` for the active tab; three transcripts keyed by tab; tab strip as `role="tablist"` of `<button role="tab" aria-selected>`; the `+` stays inert; `<Transcript key={active} …>` so a switch retypes. The figure keeps `aria-label` and drops `role="img"`.

- [ ] **Step 1: Failing test**

Add to `site-copy.test.tsx`:

```tsx
  it("the spawn window has three real tabs and starts on the second", () => {
    const tabs = [...html.matchAll(/<button [^>]*role="tab"[^>]*aria-selected="(true|false)"[^>]*>/g)].map((m) => m[1]);
    expect(tabs).toEqual(["false", "true", "false"]);
    expect(html).toContain("Sam · 2 · src/api/limits/**");
  });
```

Run → FAIL (no role="tab" buttons yet).

- [ ] **Step 2: The transcripts**

They mirror what the tools really print: `devbrain spawn` writes `identity:`, `cloning … → … …`, `dispatched:` and `launching claude as … in …` (see `cli/bin/devbrain.mjs`, the spawn command); Claude Code shows an MCP call as `● devbrain - <tool> (MCP)(<args>)` with a `⎿` result line and a file edit as `● Update(<path>)` / `● Write(<path>)`. Replace `LINES` in `spawn-window.tsx` with three, keyed by tab index.

Tab 1, the original session in `src/ui/**` (no spawn; it was started by hand):

```ts
const LINES_1 = (t: typeof TEAM): Line[] => [
  { text: "› wire the login form to the new session endpoint", tone: "cmd" },
  { text: "" },
  { text: `● devbrain - get_team_context (MCP)(repo: "${t.repo}")`, tone: "ok" },
  { text: `  ⎿  ${t.cursor} in src/api/** (refactoring the session guard) · ${t.codex} in tests/** · src/ui/** is clear`, tone: "dim" },
  { text: '● devbrain - claim_area (MCP)(paths: ["src/ui/**"], note: "wiring the login form")', tone: "ok" },
  { text: "  ⎿  claimed src/ui/** for 4h", tone: "dim" },
  { text: "● Read(src/ui/LoginForm.tsx)", tone: "ok" },
  { text: "  ⎿  Read 84 lines", tone: "dim" },
  { text: "● Update(src/ui/LoginForm.tsx)", tone: "warn" },
];
```

Tab 2, `Sam · 2` (replaces the shipped transcript):

```ts
const LINES_2 = (t: typeof TEAM): Line[] => [
  { text: "$ devbrain spawn", tone: "dim" },
  { text: `identity: ${t.you} · 2`, tone: "dim" },
  { text: `cloning ${t.repo} → ~/dev/northwind-api-2 …`, tone: "dim" },
  { text: "dispatched: rate limit the token endpoint", tone: "dim" },
  { text: `launching claude as ${t.you} · 2 in ~/dev/northwind-api-2`, tone: "dim" },
  { text: "" },
  { text: "› rate limit the token endpoint", tone: "cmd" },
  { text: "" },
  { text: `● devbrain - get_team_context (MCP)(repo: "${t.repo}")`, tone: "ok" },
  { text: `  ⎿  ${t.you} in src/ui/** · ${t.you} · 3 in tests/** · #44 is yours, its files are free`, tone: "dim" },
  { text: '● devbrain - start_task (MCP)(id: "t_44")', tone: "ok" },
  { text: "  ⎿  started · claimed src/api/limits/** for 8h", tone: "dim" },
  { text: "● Update(src/api/limits/limiter.ts)", tone: "warn" },
];
```

Tab 3, `Sam · 3` in `tests/**`:

```ts
const LINES_3 = (t: typeof TEAM): Line[] => [
  { text: "$ devbrain spawn", tone: "dim" },
  { text: `identity: ${t.you} · 3`, tone: "dim" },
  { text: `cloning ${t.repo} → ~/dev/northwind-api-3 …`, tone: "dim" },
  { text: "dispatched: add coverage for the limiter", tone: "dim" },
  { text: `launching claude as ${t.you} · 3 in ~/dev/northwind-api-3`, tone: "dim" },
  { text: "" },
  { text: "› add coverage for the limiter", tone: "cmd" },
  { text: "" },
  { text: `● devbrain - get_team_context (MCP)(repo: "${t.repo}")`, tone: "ok" },
  { text: `  ⎿  ${t.you} in src/ui/** · ${t.you} · 2 in src/api/limits/** · tests/** is free`, tone: "dim" },
  { text: '● devbrain - start_task (MCP)(id: "t_45")', tone: "ok" },
  { text: "  ⎿  started · claimed tests/** for 8h", tone: "dim" },
  { text: "● Write(tests/limits/limiter.spec.ts)", tone: "warn" },
];
const TRANSCRIPTS = [LINES_1, LINES_2, LINES_3];
```

No em dash anywhere in these (the real `start_task` result contains one; the shortened `started · claimed …` form is used instead). None of the strings is in the BANNED list.

- [ ] **Step 3: The component**

```tsx
"use client";

import { useState } from "react";
import { Reveal } from "./reveal";
import { TEAM } from "./mock-team";
import { Transcript, type Line } from "./terminal";

// (LINES_1 / LINES_2 / LINES_3 / TRANSCRIPTS as above)

export function SpawnWindow({ team = TEAM }: { team?: typeof TEAM }) {
  const [active, setActive] = useState(1);
  const tabs = [`${team.you} · src/ui/**`, `${team.you} · 2 · src/api/limits/**`, `${team.you} · 3 · tests/**`];
  const lights = (
    <div className="flex items-center gap-2 px-3.5"><span className="h-[11px] w-[11px] rounded-full bg-[#ec6a5e]" /><span className="h-[11px] w-[11px] rounded-full bg-[#f4bf4f]" /><span className="h-[11px] w-[11px] rounded-full bg-[#61c554]" /></div>
  );
  return (
    <figure aria-label="Illustration: a terminal with three spawned sessions; click a tab to see that session" className="lp-win w-full overflow-hidden">
      <div role="tablist" aria-label="Sessions" className="flex h-[38px] items-stretch overflow-x-auto bg-[#2e2922]">
        {lights}
        {tabs.map((t, i) => (
          <Reveal key={t} as="button" fx="tab" amount={0.4} delay={i * 120} duration={400} role="tab" aria-selected={i === active} type="button" onClick={() => setActive(i)}
            className={`hidden items-center gap-2 whitespace-nowrap border-r border-black/35 px-3.5 font-mono text-[12px] sm:flex ${i === active ? "bg-codebg text-white" : "text-white/55 hover:text-white/80"}`}>
            <span className="h-[7px] w-[7px] rounded-full bg-[#7fd39b]" />{t}
          </Reveal>
        ))}
        <span aria-hidden className="hidden items-center px-3.5 font-mono text-[12px] text-white/55 sm:flex">+</span>
        {/* phones: the active tab as a label; previous/next switch */}
        <div className="flex items-center gap-3 px-3.5 font-mono text-[12px] text-white sm:hidden">
          <button type="button" aria-label="Previous session" onClick={() => setActive((a) => (a + 2) % 3)} className="text-white/55">‹</button>
          <span>{tabs[active]}</span>
          <button type="button" aria-label="Next session" onClick={() => setActive((a) => (a + 1) % 3)} className="text-white/55">›</button>
        </div>
      </div>
      <Transcript key={active} lines={TRANSCRIPTS[active]!(team)} className="min-h-[230px] bg-codebg px-[22px] py-5 font-mono text-[12.5px] leading-[1.8] text-codefg" />
    </figure>
  );
}
```

Notes: `Reveal` forwards unknown props (`...rest`), so `role`, `aria-selected`, `type` and `onClick` reach the `<button>`. The server renders tab 2 active with its full transcript (unchanged first paint). `key={active}` remounts `Transcript`, whose in-view trigger fires immediately for an element already on screen, so the new transcript types out; under reduced motion it appears complete. Keyboard: buttons are focusable; arrow-key roving is not added (three buttons, Tab order is fine).

- [ ] **Step 4: The label test**

`spawn-window.tsx` is in the BANNED corpus; the new strings contain none of the banned phrases. Run `npx vitest run src/lib/__tests__/no-invented-ui.test.ts src/lib/__tests__/site-copy.test.tsx`.

- [ ] **Step 5: Typecheck, full suite, build, commit**

```bash
npm run typecheck && npm test && npm run build
git add src/app/landing/spawn-window.tsx src/lib/__tests__/site-copy.test.tsx
git commit -m "Site: the spawn window's tabs switch between three sessions"
```

---

### Task 6: Preview pass

**Files:** none unless the checks demand a fix.

- [ ] **Step 1:** Luke pushes the branch; find the preview with `vercel ls --scope dev-brain1 --meta githubCommitRef=<branch>`.
- [ ] **Step 2:** In Chrome via the same-origin iframe harness used for PR #3 (1440 / 1024 / 768 / 390): header mark navigates to `/` from `/faq`; the hero and FAQ headlines in the chosen face on both widths; cursors moving after reveal and still after `data-in` (and not under reduced motion); spawn tabs switch and retype, phone strip shows the label with ‹ ›; no horizontal overflow; `role="tab"` buttons reachable by keyboard.
- [ ] **Step 3:** Fix anything found in one commit; re-run `npm test`.

## Self-review

- **Coverage:** item 1 → Task 1; item 2 → Tasks 2 and 3 (decision then apply); item 3 → Task 4; item 4 → Task 5; verification → Task 6.
- **Placeholders:** Task 3 gives the exact code for every option so no step depends on an unwritten value; the only open input is Luke's letter, recorded before Task 3 starts.
- **Type consistency:** `Reveal` prop passthrough (`[k: string]: unknown`) is what Task 5 relies on for `role`/`onClick`; `Transcript({ lines, className })` and `Line` match `terminal.tsx`; `TEAM` fields used (`you`, `cursor`, `codex`, `repo`) exist in `mock-team.ts`.
