---
target: the landing page
total_score: 21
max_score: 36
na_heuristics: 7
p0_count: 1
p1_count: 3
timestamp: 2026-09-12T04-47-01Z
slug: src-app-landing-landing-tsx
---
Method: dual-agent (A: design review, isolated · B: detector + browser evidence, isolated)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Live spots counter is real status, but the page never discloses that signups are invite-only. No live regions anywhere in the DOM. |
| 2 | Match System / Real World | 3 | Domain language exact; hub-and-spoke diagram does not match the mental model of an interrupt. |
| 3 | User Control and Freedom | 2 | Email alternative ~4,700px below sign-in on mobile; CTA hands visitor to OAuth with no warning. |
| 4 | Consistency and Standards | 3 | Cool bg-slate-50 under warm #f4f1ea ground; 11/12 controls get a focus ring, email input suppresses it. |
| 5 | Error Prevention | 1 | Loudest element leads to a refusal the page has all information needed to prevent. |
| 6 | Recognition Rather Than Recall | 3 | Amber-vs-green dot must be decoded from memory, no legend. |
| 7 | Flexibility and Efficiency | n/a | Single-decision marketing surface. |
| 8 | Aesthetic and Minimalist Design | 2 | 12 text styles under 13px; card copy pinned at 13px at every width. |
| 9 | Error Recovery | 2 | Good copy announced to nobody; commonest refusal arrives after OAuth and form submit. |
| 10 | Help and Documentation | 3 | "Before you ask" well positioned. No GitHub/docs link despite issues being the only channel. |
| **Total** | | **21/36** | **Acceptable (58%)** — 9 scored, #7 n/a |

## Design Specificity Verdict

Copy is authored for this product; the design is category-interchangeable. Stock dev-tool skeleton (mono eyebrow, 52px headline, filled CTA + text link, right-hand illustration, problem trio, 01/02/03, 8-up grid, 2-col FAQ, tinted CTA card). One card style serves problem card, step card and live agent node. The hero diagram draws connection when the product's claim is interruption: no time axis, no before/after, no stop; Nova and Kai have no link between them.

Deterministic scan: detect.mjs exit 0, zero findings across all four files. Mechanical floor fully met; every real problem is judgment- or measurement-level.

Visual overlays: unavailable. Injection failed at Chrome's Local Network Access gate (public-HTTPS to localhost hangs at `pending`). Mutation works; transport blocked. Proxy workaround denied by permission classifier. Live server started and confirmed stopped.

## What's Working

1. The copy does the persuasion the visuals do not. Pre-agrees with the reader rather than pitching.
2. Honesty architecture is structural: spots from platform_counts(), prices from plans.ts, a `full` branch rewrites hero and close. The page cannot say "free" after the beta ends.
3. "Before you ask" positioned before the close — six real objections in the last place they can change the decision.

## Priority Issues

**[P0] The primary CTA is a trapdoor.** signups.mode is "invite". Visitor grants OAuth, sees an enabled create-team form, submits, only then refused. Hero simultaneously says 147 of 150 spots left. Verified: /welcome gates on the cap only; the invite check lives inside createTeam. Violates Principle 4.
Fix: read signups mode in Landing alongside loadBeta(). Invite-only -> primary becomes email capture, sign-in demotes to "I already have an invite link". At minimum move the gate to /welcome's render. Add reassurance micro-copy under both sign-in buttons.
Command: /impeccable onboard

**[P1] Eleven text styles fail WCAG AA, including both CTAs and the proof block.** Measured: compatibility line/figcaption 2.61-2.63:1; agent tags 2.82:1; both button labels 3.54:1; accent links and scarcity counter 3.81:1; warning pre 3.93:1. None qualify for the 3:1 large-text exemption.
Fix: darken --wg-faint to >= #75706a; accent-on-ground to #b4453d; button to #c14b43; render pre as code on a dark surface.
Command: /impeccable audit

**[P1] Hero diagram invisible, undecodable, arguing the wrong thing.** Root cause verified at globals.css:145 — `.wg svg line { stroke: var(--wg-graph-line) }` beats the presentation attribute; connectors render #e3ded2 at 1.19:1. Semantic payload is a 6px colour-only dot with no legend.
Fix: scope the stroke; redraw to show the edit being stopped; label the amber node in words.
Command: /impeccable bolder

**[P1] The email form is unreachable for assistive tech and ranked last.** No <label> on the page. Error p has no role=alert, no aria-live, no aria-describedby; aria-invalid never set; zero live regions in the DOM. Success replaces the form, destroying focus. focus:outline-none leaves a 1px border change at 2.80:1. Input 42px, button 40px on mobile. Appears once at 5,100px of 5,699px under "Not today?".
Fix: real label, role=alert + aria-describedby + aria-invalid, keep focus on success, visible focus ring, 44px minimum, promote into the hero.
Command: /impeccable harden

**[P2] At 98% empty the scarcity frame is evidence against the product.** Three teams exist, two are the maintainer's own.
Fix: replace with the solo-maintainer frame — "Three teams are running DevBrain today. I'm one person, letting teams in a few at a time."
Command: /impeccable clarify

## Persona Red Flags

Jordan (first-timer): compatibility line is the faintest text on the page; "whoever holds a token" redefines a word he has wrong; nothing warns of a CLI/terminal; ends refused after OAuth.
Riley (stress tester): loses focus indicator on the email field; diagram aria-hidden with no text alternative; the "verbatim" block rewraps at 449px; SignInButton inert with JS off while the form degrades correctly.
Casey (mobile): 4,700px CTA dead zone; only mobile nav item sends her off-page; eyebrow orphans "LEFT"; 42px input 8px above a full-width submit.

## Minor Observations

- Dark mode never applies to the public page: data-wg-theme is only set when localStorage already holds a value.
- Intermittent 503 on the /pricing RSC prefetch, reproduced twice while 35 other requests returned 200/304.
- Heading structure clean (27 headings, one h1, no skips) but "Before you ask" uses an eyebrow div, nesting the FAQ under Price.
- body ships cool bg-slate-50 under the warm ground.
- brain.png raster at 32x26, no @2x.
- No skip link; nav sits in a section, no header landmark.
- captureLead's error design is thoughtful; keep it.

## Questions to Consider

1. If the page cannot let any self-serve visitor sign up, why is sign-in the primary button?
2. The product is nothing but motion; the page has none. What if the hero were the interruption playing out?
3. Is scarcity the wrong frame when the honest number reads as "nobody uses this"?
