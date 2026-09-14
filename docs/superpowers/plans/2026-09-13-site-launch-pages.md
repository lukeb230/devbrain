# Site Launch Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the public site for launch: an after-download page at `/start`, a custom 404, search and social metadata (canonical, robots, sitemap, Apple touch icon), and a `www` to apex redirect.

**Architecture:** Every new page reuses the existing site chrome (`BrowserShell` + `.lp` ground + `MotionGate` + `SiteHeader` + `SiteFooter`) exactly the way `src/app/legal-page.tsx` does. Metadata uses the Next.js 15 file conventions (`robots.ts`, `sitemap.ts`, `apple-icon.png`) and the root layout's `metadata.alternates`. The `www` redirect is a pure function in `src/lib/site-redirects.ts` called first thing in `src/middleware.ts`, beside the retired-page redirects that already live there. The download button now sends people to `/start?dl=1`, and that page starts the DMG download itself and shows what to do next, because the app is menu-bar only and first launch is otherwise invisible.

**Tech Stack:** Next.js 15 App Router (React 19), Tailwind, vitest (`src/lib/__tests__`), `npm run typecheck`, `npm run build`.

**Spec:** `docs/site-handoff/DevBrain-Site-Handoff.md` §4.12 (the "pages still to be designed" list). Already covered before this plan and out of scope here: the Open Graph image (`src/app/opengraph-image.tsx`, live), the favicon (`src/app/icon.png`, 256 px, live), and the FAQ download card's beta-full state (`DownloadCard` renders it whenever `full` is true, and `src/app/faq/page.tsx` passes `full`).

## Global Constraints

- Site voice is plural ("we", "us"), never "I", "me", "my" outside `role="img"` illustrations. `src/lib/__tests__/site-copy.test.tsx` enforces this over every file in `SITE_FILES`.
- No em dashes in site copy. The only allowed strings are the three in the em-dash allowlist of `site-copy.test.tsx`. Use a comma, a full stop, or a colon instead.
- No prices, plans, or trial mechanics anywhere on the site: the words "Pricing", "$29", "$99", "per seat", "free trial", "trial ends", "14-day" must not appear in source or rendered text.
- No real people, handles, or repos on the site. Mock team only (`src/app/landing/mock-team.ts`).
- Animations play once (the `Reveal`/`Mount` components already do this). No motion library.
- Copy about the app must be true today: DevBrain is a menu-bar app with no Dock icon (`widget/src-tauri/src/main.rs`), the panel opens from the bottom corner of the screen when the mouse reaches it, sign-in is "Sign in with GitHub", and the first thing to do after sign-in is link a repository.
- Do not mention notarization anywhere new. The Terms already carry the signed-and-notarised sentence and that is where it stays.
- Every page keeps `SiteHeader`/`SiteFooter`, the `.lp ${siteDisplay.variable}` main, and `MotionGate`, in that order, as in `src/app/legal-page.tsx`.
- Tests live in `src/lib/__tests__/` and run with `npx vitest run <file>`. Finish each task with `npm run typecheck` green.
- Commit after each task. Never push (the user pushes).
- Work in a worktree under `.worktrees/` on branch `site/launch-pages` off `main`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/app/start/page.tsx` | The after-download page: metadata, five install steps, the download-again link, optional auto-download. Dynamic (reads `?dl`). |
| `src/app/start/auto-download.tsx` | Client component: when mounted with `dl` true, starts the DMG download once by assigning `location.href = "/download"`. |
| `src/app/landing/download-button.tsx` | Existing. `href` changes from `/download` to `/start?dl=1`. |
| `src/app/not-found.tsx` | Root custom 404 in the site style. Applies to every unmatched route. |
| `src/app/layout.tsx` | Existing. Adds `alternates: { canonical: "./" }` so every page's canonical is its own URL under `metadataBase`. |
| `src/app/robots.ts` | Robots file: allow the site pages, disallow the app and API routes, point at the sitemap. |
| `src/app/sitemap.ts` | Sitemap of the five public pages. |
| `src/app/apple-icon.png` | 180×180 PNG resized from `src/app/icon.png`. Next serves it as `apple-touch-icon`. |
| `src/lib/site-redirects.ts` | Existing. Adds `wwwRedirect(host, url)` returning the apex URL string or `null`. |
| `src/middleware.ts` | Existing. Calls `wwwRedirect` before anything else and answers 308. |
| `src/lib/__tests__/site-copy.test.tsx` | Existing. `SITE_FILES` grows to cover `src/app/start` and `src/app/not-found.tsx`; the download-link assertions move to `/start?dl=1`; new render tests for `/start` and the 404. |
| `src/lib/__tests__/site-meta.test.ts` | New. Robots, sitemap, and `wwwRedirect` unit tests. |

---

### Task 1: The `/start` page and the download button

**Files:**
- Create: `src/app/start/auto-download.tsx`
- Create: `src/app/start/page.tsx`
- Modify: `src/app/landing/download-button.tsx:16` (the `href`)
- Test: `src/lib/__tests__/site-copy.test.tsx`

**Interfaces:**
- Consumes: `BrowserShell` (`@/app/browser-shell`), `MotionGate`, `Mount`, `Reveal` (`@/app/landing/reveal`), `SiteHeader`, `SiteFooter` (`@/app/landing/landing`), `siteDisplay` (`@/app/fonts`).
- Produces: `export function StartBody({ dl }: { dl: boolean })` in `src/app/start/page.tsx` (rendered by the default export; tests render `StartBody` directly). `export const START_STEPS: readonly { title: string; body: string }[]` in the same file. `export function AutoDownload({ enabled }: { enabled: boolean })` in `auto-download.tsx`.

- [ ] **Step 1: Write the failing tests**

Append to the `describe("the site's copy", …)` block in `src/lib/__tests__/site-copy.test.tsx`, before its closing `});`:

```tsx
  it("the start page lists the install steps and can download again", () => {
    const start = renderToStaticMarkup(<StartBody dl={false} />);
    const startText = start.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(START_STEPS).toHaveLength(5);
    for (const s of START_STEPS) expect(startText).toContain(s.title);
    expect(startText).toContain("menu bar");
    expect(startText).toContain("Sign in with GitHub");
    expect(start).toMatch(/href="\/download"/);
    expect(start).not.toContain('data-autodownload="1"');
    const withDl = renderToStaticMarkup(<StartBody dl />);
    expect(withDl).toContain('data-autodownload="1"');
  });
```

Add the import at the top of the file, after the `SiteHeader` import line:

```tsx
import { START_STEPS, StartBody } from "@/app/start/page";
```

Change the existing download-link test so the site's buttons point at the start page. Replace the body of `it("every Download for Mac points at /download and nothing points at the retired pages", …)` with:

```tsx
    const links = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]*(?:<[^a][^>]*>[^<]*)*)<\/a>/g)];
    const downloads = links.filter((m) => m[2].includes("Download for Mac"));
    expect(downloads.length).toBeGreaterThanOrEqual(2);
    for (const m of downloads) expect(m[1]).toBe("/start?dl=1");
    expect(html).not.toMatch(/href="\/(pricing|how-it-works)/);
    expect(html).not.toContain("Sign in with GitHub");
```

and rename that test to `"every Download for Mac points at /start?dl=1 and nothing points at the retired pages"`.

In `it("beta-full: no download link in the hero, and no sign-in copy", …)` replace

```tsx
    expect(fullHtml).not.toMatch(/href="\/download"/);
```

with

```tsx
    expect(fullHtml).not.toMatch(/href="\/(download|start)/);
```

Finally widen the copy sweep. Replace the `SITE_FILES` line with:

```tsx
const SITE_FILES = [...walk("src/app/landing"), ...walk("src/app/faq"), ...walk("src/app/start"), "src/app/not-found.tsx"].filter((p) => !p.includes("__tests__"));
```

(`src/app/not-found.tsx` is created in Task 2. Until then `readFileSync` throws, so for this task only, leave `"src/app/not-found.tsx"` out of the array and add it in Task 2.)

- [ ] **Step 2: Run the test file to verify it fails**

Run: `cd ~/Downloads/devbrain-product/.worktrees/site-launch-pages && npx vitest run src/lib/__tests__/site-copy.test.tsx`
Expected: FAIL. The import of `@/app/start/page` cannot resolve, and the download-link test expects `/start?dl=1` but sees `/download`.

- [ ] **Step 3: Create the auto-download client component**

Create `src/app/start/auto-download.tsx`:

```tsx
"use client";
import { useEffect, useRef } from "react";

// Starts the DMG download once the page has painted. /download answers with a
// 302 to a GitHub release asset served as an attachment, so assigning
// location.href downloads the file and leaves this page in place. The ref
// guards React's development double-mount so nobody gets two DMGs.
export function AutoDownload({ enabled }: { enabled: boolean }) {
  const fired = useRef(false);
  useEffect(() => {
    if (!enabled || fired.current) return;
    fired.current = true;
    const t = window.setTimeout(() => window.location.assign("/download"), 600);
    return () => window.clearTimeout(t);
  }, [enabled]);
  return enabled ? <span hidden data-autodownload="1" /> : null;
}
```

- [ ] **Step 4: Create the page**

Create `src/app/start/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { BrowserShell } from "@/app/browser-shell";
import { MotionGate, Mount, Reveal } from "@/app/landing/reveal";
import { SiteFooter, SiteHeader } from "@/app/landing/landing";
import { siteDisplay } from "@/app/fonts";
import { AutoDownload } from "./auto-download";

// /start: where the Download button lands. With ?dl=1 the page starts the
// DMG download itself; either way it shows the five things to do next. The
// app is menu-bar only, so without this page a first launch looks like
// nothing happened.

export const metadata: Metadata = { title: "Start", description: "What to do after downloading DevBrain: install it, sign in with GitHub, link a repo." };
// Reading searchParams makes this page dynamic. Do not add force-static: it
// would make searchParams empty and ?dl=1 would never start the download.

export const START_STEPS = [
  { title: "Open the DMG", body: "It is in your Downloads folder, named DevBrain.dmg. If the download did not start, use the button below." },
  { title: "Drag DevBrain into Applications", body: "Then eject the DMG. You can delete it afterwards." },
  { title: "Open DevBrain from Applications", body: "It lives in the menu bar and has no Dock icon. The panel opens from the bottom corner of the screen when your mouse reaches it." },
  { title: "Sign in with GitHub", body: "The panel opens a browser tab for sign-in and hands you straight back to the app. Signing in does not give DevBrain access to any code." },
  { title: "Link a repository", body: "Pick one repo to start with and choose its rules. The next time anyone on the team opens a session there, it will know who else is around." },
] as const;

export function StartBody({ dl }: { dl: boolean }) {
  return (
    <BrowserShell>
      <main className={`lp ${siteDisplay.variable} min-h-screen pb-24`}>
        <MotionGate />
        <AutoDownload enabled={dl} />
        <SiteHeader />
        <section className="mx-auto w-full max-w-[720px] px-6 pt-14 sm:px-8 sm:pt-[70px]">
          <Mount as="p" className="font-mono text-[12px] uppercase tracking-[.12em] text-muted">{dl ? "Your download is starting" : "After the download"}</Mount>
          <Mount as="h1" delay={60} duration={700} y={24} className="mt-3 max-w-[17ch] font-display text-[40px] font-semibold leading-[1.02] tracking-[-.03em] text-txt text-balance sm:text-[56px]">Five steps, about five minutes.</Mount>
          <Mount as="p" delay={150} className="mt-4 max-w-[58ch] text-[16.5px] leading-[1.6] text-body">DevBrain is a small Mac app. Once it is running and linked to a repo, every coding session on the team sees the same picture.</Mount>
          <ol className="mt-12 space-y-0">
            {START_STEPS.map((s, i) => (
              <Reveal key={s.title} as="li" delay={i * 70} y={12} duration={500} className="grid grid-cols-[44px_1fr] gap-x-4 border-t border-line2 py-6">
                <span className="font-mono text-[13px] tabular-nums text-accenttext">0{i + 1}</span>
                <div>
                  <h2 className="font-display text-[21px] font-medium leading-[1.2] tracking-[-.015em] text-txt">{s.title}</h2>
                  <p className="mt-2 max-w-[50ch] text-[14.5px] leading-[1.65] text-body">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
          <Reveal delay={420} y={12} duration={500} className="mt-10 flex flex-wrap items-center gap-4 border-t border-line2 pt-8">
            <a href="/download" className="inline-flex items-center gap-2.5 whitespace-nowrap rounded-[10px] border border-line2 bg-row px-5 py-3 font-display text-[15px] font-semibold text-txt hover:border-line">Download again</a>
            <span className="text-[13.5px] text-muted">Stuck? Write to us at team@getdevbrain.com, or read the <Link href="/faq" className="text-accenttext hover:underline">FAQ</Link>.</span>
          </Reveal>
        </section>
        <SiteFooter />
      </main>
    </BrowserShell>
  );
}

export default async function StartPage({ searchParams }: { searchParams: Promise<{ dl?: string }> }) {
  const { dl } = await searchParams;
  return <StartBody dl={dl === "1"} />;
}
```

The "Download again" control is a plain anchor to `/download` on purpose: `DownloadButton` now points at `/start?dl=1`, which would loop back here.

- [ ] **Step 5: Point the download button at the start page**

In `src/app/landing/download-button.tsx` change

```tsx
    <a href="/download" className={
```

to

```tsx
    <a href="/start?dl=1" className={
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run src/lib/__tests__/site-copy.test.tsx && npm run typecheck`
Expected: PASS, including the em-dash, plural-voice and banned-word sweeps now covering `src/app/start`.

- [ ] **Step 7: Check the page in a browser**

Run `npm run dev` in the worktree (the DB is unreachable locally, but `/start` needs none of it), open `http://localhost:3000/start` and `http://localhost:3000/start?dl=1`. The second one should trigger one download prompt (it redirects to GitHub, which needs network) and stay on the page. Check 390 px width: the number column and the step text must not overlap.

- [ ] **Step 8: Commit**

```bash
git add src/app/start src/app/landing/download-button.tsx src/lib/__tests__/site-copy.test.tsx
git commit -m "Site: /start after-download page; download button lands there"
```

---

### Task 2: Custom 404

**Files:**
- Create: `src/app/not-found.tsx`
- Test: `src/lib/__tests__/site-copy.test.tsx`

**Interfaces:**
- Consumes: the same chrome as Task 1 (`BrowserShell`, `MotionGate`, `Mount`, `SiteHeader`, `SiteFooter`, `siteDisplay`).
- Produces: `export default function NotFound()` (Next's root not-found convention). Rendered for every unmatched route, including app-surface ones, so it must not assume a signed-in user and must not call the database.

- [ ] **Step 1: Write the failing test**

Append to the `describe` block in `src/lib/__tests__/site-copy.test.tsx`:

```tsx
  it("the 404 page is in the site style and links home and to the FAQ", () => {
    const nf = renderToStaticMarkup(<NotFound />);
    expect(nf).toContain("404");
    expect(nf).toContain("There is nothing at this address.");
    expect(nf).toMatch(/<a\b[^>]*href="\/"[^>]*>/);
    expect(nf).toMatch(/<a\b[^>]*href="\/faq"[^>]*>/);
  });
```

Add the import after the `StartBody` import:

```tsx
import NotFound from "@/app/not-found";
```

And now add `"src/app/not-found.tsx"` to `SITE_FILES` (see Task 1, Step 1) so the copy sweeps cover it:

```tsx
const SITE_FILES = [...walk("src/app/landing"), ...walk("src/app/faq"), ...walk("src/app/start"), "src/app/not-found.tsx"].filter((p) => !p.includes("__tests__"));
```

- [ ] **Step 2: Run the test file to verify it fails**

Run: `npx vitest run src/lib/__tests__/site-copy.test.tsx`
Expected: FAIL, `@/app/not-found` cannot resolve.

- [ ] **Step 3: Create the page**

Create `src/app/not-found.tsx`:

```tsx
import Link from "next/link";
import { BrowserShell } from "./browser-shell";
import { MotionGate, Mount } from "./landing/reveal";
import { SiteFooter, SiteHeader } from "./landing/landing";
import { siteDisplay } from "./fonts";

// The root 404. Next renders it for every route that does not exist, on the
// site and the app surface alike, so it stays static: no session, no DB.

export default function NotFound() {
  return (
    <BrowserShell>
      <main className={`lp ${siteDisplay.variable} min-h-screen pb-24`}>
        <MotionGate />
        <SiteHeader />
        <section className="mx-auto w-full max-w-[720px] px-6 pt-14 sm:px-8 sm:pt-[70px]">
          <Mount as="p" className="font-mono text-[12px] uppercase tracking-[.12em] text-muted">404</Mount>
          <Mount as="h1" delay={60} duration={700} y={24} className="mt-3 max-w-[17ch] font-display text-[40px] font-semibold leading-[1.02] tracking-[-.03em] text-txt text-balance sm:text-[56px]">There is nothing at this address.</Mount>
          <Mount as="p" delay={150} className="mt-4 max-w-[58ch] text-[16.5px] leading-[1.6] text-body">The link may be old, or the page moved. The <Link href="/" className="text-accenttext hover:underline">home page</Link> and the <Link href="/faq" className="text-accenttext hover:underline">FAQ</Link> cover most of what people come here for.</Mount>
        </section>
        <SiteFooter />
      </main>
    </BrowserShell>
  );
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run src/lib/__tests__/site-copy.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Check it renders**

With `npm run dev` running, open `http://localhost:3000/definitely-not-a-page`. Expect the site header, the 404 headline, and a 404 status in the Network tab.

- [ ] **Step 6: Commit**

```bash
git add src/app/not-found.tsx src/lib/__tests__/site-copy.test.tsx
git commit -m "Site: custom 404 in the site style"
```

---

### Task 3: Canonical, robots, sitemap, Apple touch icon

**Files:**
- Modify: `src/app/layout.tsx:8-19` (the `metadata` object)
- Create: `src/app/robots.ts`
- Create: `src/app/sitemap.ts`
- Create: `src/app/apple-icon.png`
- Test: `src/lib/__tests__/site-meta.test.ts`

**Interfaces:**
- Consumes: `process.env.NEXT_PUBLIC_SITE_URL` (production value `https://getdevbrain.com`; falls back to that literal).
- Produces: `export const SITE_URL: string` and `export const SITE_PAGES: readonly string[]` from `src/app/sitemap.ts`, reused by `robots.ts` and the tests.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/site-meta.test.ts`:

```ts
// src/lib/__tests__/site-meta.test.ts
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap, { SITE_PAGES, SITE_URL } from "@/app/sitemap";
import { metadata } from "@/app/layout";

describe("site metadata", () => {
  it("lists exactly the public pages in the sitemap, on the canonical host", () => {
    expect(SITE_PAGES).toEqual(["/", "/faq", "/start", "/terms", "/privacy"]);
    const urls = sitemap().map((e) => e.url);
    expect(urls).toEqual(SITE_PAGES.map((p) => `${SITE_URL}${p}`));
    for (const u of urls) expect(u.startsWith("https://")).toBe(true);
    expect(SITE_URL.endsWith("/")).toBe(false);
  });
  it("robots allows the site and blocks the app and API, and names the sitemap", () => {
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    const allow = rules.flatMap((x) => [x.allow ?? []].flat());
    const disallow = rules.flatMap((x) => [x.disallow ?? []].flat());
    expect(allow).toContain("/");
    for (const p of ["/api/", "/desk/", "/auth/", "/widget/", "/open", "/download", "/join/", "/welcome", "/settings/", "/dashboard/", "/billing/"]) expect(disallow).toContain(p);
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
  it("every page gets a canonical of its own path", () => {
    expect(metadata.alternates?.canonical).toBe("./");
    expect(String(metadata.metadataBase)).toBe(`${SITE_URL}/`);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/__tests__/site-meta.test.ts`
Expected: FAIL, `@/app/robots` and `@/app/sitemap` cannot resolve.

- [ ] **Step 3: Create the sitemap**

Create `src/app/sitemap.ts`:

```ts
import type { MetadataRoute } from "next";

// The public site. Everything else (the Console, the widget, auth, the API)
// is either signed-in or machine-facing and stays out of search.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://getdevbrain.com").replace(/\/+$/, "");
export const SITE_PAGES = ["/", "/faq", "/start", "/terms", "/privacy"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return SITE_PAGES.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.6,
  }));
}
```

- [ ] **Step 4: Create robots**

Create `src/app/robots.ts`:

```ts
import type { MetadataRoute } from "next";
import { SITE_URL } from "./sitemap";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: ["/api/", "/desk/", "/auth/", "/widget/", "/open", "/download", "/join/", "/welcome", "/settings/", "/dashboard/", "/billing/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
```

- [ ] **Step 5: Add the canonical**

In `src/app/layout.tsx`, inside the `metadata` object, add one line after `description: DESCRIPTION,`:

```ts
  alternates: { canonical: "./" },
```

With `metadataBase` set, `"./"` resolves per page to that page's own URL (Next documents this form), so `/faq` gets `https://getdevbrain.com/faq` without each page declaring it.

- [ ] **Step 6: Create the Apple touch icon**

Run from the worktree root:

```bash
sips -z 180 180 src/app/icon.png --out src/app/apple-icon.png
sips -g pixelWidth -g pixelHeight src/app/apple-icon.png
```

Expected: 180 × 180. Next serves `src/app/apple-icon.png` as `<link rel="apple-touch-icon">` automatically.

- [ ] **Step 7: Run the tests, typecheck and build**

Run: `npx vitest run src/lib/__tests__/site-meta.test.ts && npm run typecheck && npm run build`
Expected: PASS; the build output lists `/robots.txt`, `/sitemap.xml`, `/apple-icon.png`, `/start` and `/_not-found`.

- [ ] **Step 8: Check the head**

With `npm run dev` running:

```bash
curl -s http://localhost:3000/faq | grep -o '<link rel="canonical"[^>]*>\|<link rel="apple-touch-icon"[^>]*>'
curl -s http://localhost:3000/robots.txt
curl -s http://localhost:3000/sitemap.xml | head -c 600
```

Expected: a canonical of `https://getdevbrain.com/faq` (or the local site URL if the env sets one), the apple-touch-icon link, a robots body with the disallow list and the sitemap line, and a sitemap with five `<url>` entries.

- [ ] **Step 9: Commit**

```bash
git add src/app/layout.tsx src/app/robots.ts src/app/sitemap.ts src/app/apple-icon.png src/lib/__tests__/site-meta.test.ts
git commit -m "Site: canonical, robots, sitemap and Apple touch icon"
```

---

### Task 4: `www` to apex redirect

**Files:**
- Modify: `src/lib/site-redirects.ts`
- Modify: `src/middleware.ts:12-13` (top of `middleware`) 
- Test: `src/lib/__tests__/site-meta.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `export function wwwRedirect(host: string | null, url: URL, siteUrl?: string): string | null` in `src/lib/site-redirects.ts`. Returns the full apex URL (path and query preserved) when `host` is `www.` + the site host, otherwise `null`.

`www.getdevbrain.com` currently answers 200 with the whole site (checked 2026-09-13), which splits search and share links across two hosts. A dashboard redirect on Vercel would also work, but a code redirect ships with the repo, is tested, and needs no clicking.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/site-meta.test.ts`, inside the `describe` block:

```ts
  it("www redirects to the apex host and keeps the path and query", () => {
    const site = "https://getdevbrain.com";
    const u = (s: string) => new URL(s);
    expect(wwwRedirect("www.getdevbrain.com", u("https://www.getdevbrain.com/faq?x=1"), site)).toBe("https://getdevbrain.com/faq?x=1");
    expect(wwwRedirect("www.getdevbrain.com:443", u("https://www.getdevbrain.com/"), site)).toBe("https://getdevbrain.com/");
    expect(wwwRedirect("getdevbrain.com", u("https://getdevbrain.com/faq"), site)).toBeNull();
    expect(wwwRedirect("devbrain-seven.vercel.app", u("https://devbrain-seven.vercel.app/"), site)).toBeNull();
    expect(wwwRedirect("www.example.com", u("https://www.example.com/"), site)).toBeNull();
    expect(wwwRedirect(null, u("https://www.getdevbrain.com/"), site)).toBeNull();
  });
```

Add the import at the top:

```ts
import { wwwRedirect } from "@/lib/site-redirects";
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/__tests__/site-meta.test.ts`
Expected: FAIL, `wwwRedirect` is not exported.

- [ ] **Step 3: Implement the function**

Append to `src/lib/site-redirects.ts`:

```ts
// www.<site host> → <site host>, path and query kept. Only the configured
// site host is folded; previews and the old vercel.app host are left alone.
export function wwwRedirect(host: string | null, url: URL, siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://getdevbrain.com"): string | null {
  if (!host) return null;
  const apex = new URL(siteUrl).host;
  const bare = host.replace(/:\d+$/, "").toLowerCase();
  if (bare !== `www.${apex}`) return null;
  const target = new URL(url.toString());
  target.host = apex;
  target.protocol = "https:";
  return target.toString();
}
```

- [ ] **Step 4: Wire it into the middleware**

In `src/middleware.ts`, at the very top of `middleware`, before `let response = NextResponse.next({ request });`, add:

```ts
  // www → apex before anything else, so the redirect costs no session refresh.
  const www = wwwRedirect(request.headers.get("host"), request.nextUrl);
  if (www) return NextResponse.redirect(www, 308);
```

and change the existing import line

```ts
import { siteRedirect } from "@/lib/site-redirects";
```

to

```ts
import { siteRedirect, wwwRedirect } from "@/lib/site-redirects";
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run src/lib/__tests__/site-meta.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/site-redirects.ts src/middleware.ts src/lib/__tests__/site-meta.test.ts
git commit -m "Site: 308 www.getdevbrain.com to the apex host"
```

---

### Task 5: Full suite, build, and the live checklist

**Files:** none new.

- [ ] **Step 1: Run everything**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: all green. If `no-invented-ui.test.ts` complains about `src/app/start` or `not-found.tsx`, that test bans invented product UI in site files; the new pages contain no product recreation, so read the failure and fix the copy rather than the test.

- [ ] **Step 2: Hand off**

Use superpowers:finishing-a-development-branch. After the user pushes and Vercel deploys, verify on the live host:

```bash
curl -sI https://www.getdevbrain.com/faq | grep -i '^HTTP\|^location'
curl -s https://getdevbrain.com/robots.txt
curl -s https://getdevbrain.com/sitemap.xml | grep -c '<url>'
curl -s https://getdevbrain.com/faq | grep -o '<link rel="canonical"[^>]*>'
curl -sI https://getdevbrain.com/apple-icon.png | head -1
curl -sI https://getdevbrain.com/start | head -1
curl -sI https://getdevbrain.com/no-such-page | head -1
```

Expected: `308` with `location: https://getdevbrain.com/faq`; the robots body; `5`; the canonical link; `200`; `200`; `404`. Then click "Download for Mac" on the live home page in a browser: it should land on `/start?dl=1` and the DMG should begin downloading without leaving the page.

---

## Self-Review

- **Spec coverage.** §4.12 lists four things: custom 404 (Task 2), FAQ beta-full card (already shipped, noted under Spec), `/start` (Task 1), social card and metadata (OG image and favicon already shipped; canonical, robots, sitemap in Task 3). The `www` redirect (Task 4) is not in §4.12 but is a launch item from the domain cutover.
- **Placeholders.** None. Every code step carries the code.
- **Type consistency.** `StartBody({ dl })`, `START_STEPS`, `AutoDownload({ enabled })`, `SITE_URL`, `SITE_PAGES`, `wwwRedirect(host, url, siteUrl?)` are named identically in their producing task, their consuming test, and the File Structure table.
- **Known judgment call.** Sending the download button to `/start?dl=1` changes what the button does today (a direct 302 to the DMG). The reason is in Task 1's header comment: the app has no Dock icon, so a first launch with no guidance looks like nothing happened. If the user prefers the direct download, revert Step 5 of Task 1 and the two test edits that reference `/start?dl=1`; the rest of the plan is unaffected.
