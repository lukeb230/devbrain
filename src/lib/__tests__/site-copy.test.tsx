// src/lib/__tests__/site-copy.test.tsx
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LandingBody, SiteHeader } from "@/app/landing/landing";
import { START_STEPS, StartBody } from "@/app/start/start-body";
import NotFound from "@/app/not-found";
import { FAQ_ITEMS } from "@/app/faq/faq-items";
import { WRITER_CATALOG } from "@/lib/rules-catalog";

const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : []; });
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SITE_FILES = [...walk("src/app/landing"), ...walk("src/app/faq"), ...walk("src/app/start"), "src/app/not-found.tsx"].filter((p) => !p.includes("__tests__"));
const source = SITE_FILES.map((p) => strip(readFileSync(p, "utf8"))).join("\n");

const html = renderToStaticMarkup(<LandingBody spotsLeft={148} maxTeams={200} free full={false} />);
const text = html.replace(/<[^>]+>/g, " ");

// Drops every element carrying role="img" (the panel recreation, the chat
// window, the spawn window) and everything inside it, tracking tag depth so
// nested markup inside the illustration doesn't leak out.
const dropIllustrations = (h: string) => {
  let out = "", depth = 0;
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)\b([^>]*?)(\/?)>/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = tagRe.exec(h))) {
    const [full, closing, , attrs, selfClose] = m;
    if (depth === 0) out += h.slice(last, m.index);
    last = m.index + full.length;
    if (depth === 0 && !closing && /role="img"/.test(attrs) && !selfClose) { depth = 1; continue; }
    if (depth > 0) { if (!closing && !selfClose) depth++; else if (closing) depth--; }
  }
  return out + h.slice(last);
};

describe("the site's copy", () => {
  it("renders the hero and the guard sentence on the server", () => {
    expect(text).toContain("Work like you");
    expect(text.replace(/\s+/g, " ")).toContain("Editing it anyway risks a collision — coordinate first, or approve to proceed deliberately.");
    expect(text).toContain("17"); expect(text).toContain("PRs merged");
  });
  it("every Download for Mac points at /start?dl=1 and nothing points at the retired pages", () => {
    const links = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]*(?:<[^a][^>]*>[^<]*)*)<\/a>/g)];
    const downloads = links.filter((m) => m[2].includes("Download for Mac"));
    expect(downloads.length).toBeGreaterThanOrEqual(2);
    for (const m of downloads) expect(m[1]).toBe("/start?dl=1");
    expect(html).not.toMatch(/href="\/(pricing|how-it-works)/);
    expect(html).not.toContain("Sign in with GitHub");
  });
  it("no prices, plans or trial mechanics", () => {
    for (const bad of ["Pricing", "$29", "$99", "per seat", "free trial", "trial ends", "14-day"]) {
      expect(source).not.toContain(bad);
      expect(text).not.toContain(bad);
    }
  });
  it("no em dash outside the guard sentence and the panel's product rows", () => {
    const allowed = ["Editing it anyway risks a collision — coordinate", "Auth refactor — resolve against main", "cleared to land — press merge"];
    let s = source;
    for (const a of allowed) s = s.split(a).join("");
    expect(s).not.toContain("—");
  });
  it("speaks as a team, never as one person", () => {
    // Illustrations (role="img") are mock people talking inside a recreated
    // screenshot, not the site itself, so a character may say "I" or "my";
    // the rule only binds the site's own voice.
    const textWithoutIllustrations = dropIllustrations(html).replace(/<[^>]+>/g, " ");
    const own = textWithoutIllustrations.replace(/[^.?!]*\?/g, ""); // drop FAQ-style questions (the visitor speaking)
    expect(own).not.toMatch(/\b(I|me|my)\b/);
    expect(FAQ_ITEMS).toHaveLength(11);
    const startHtml = renderToStaticMarkup(<StartBody dl={false} />);
    const startOwn = dropIllustrations(startHtml).replace(/<[^>]+>/g, " ").replace(/[^.?!]*\?/g, "");
    expect(startOwn).not.toMatch(/\b(I|me|my)\b/);
    const nfHtml = renderToStaticMarkup(<NotFound />);
    const nfOwn = dropIllustrations(nfHtml).replace(/<[^>]+>/g, " ").replace(/[^.?!]*\?/g, "");
    expect(nfOwn).not.toMatch(/\b(I|me|my)\b/);
  });
  it("the 404 page is in the site style and links home and to the FAQ", () => {
    const nf = renderToStaticMarkup(<NotFound />);
    expect(nf).toContain("404");
    expect(nf).toContain("There is nothing at this address.");
    expect(nf).toMatch(/<a\b[^>]*href="\/"[^>]*>/);
    expect(nf).toMatch(/<a\b[^>]*href="\/faq"[^>]*>/);
  });
  it("the writer_auto_merge rule still exists in the catalogue", () => {
    // switch-band.tsx falls back to a hardcoded label if this rule is ever
    // renamed; this keeps the fallback from silently going stale too.
    expect(WRITER_CATALOG.some((r) => r.rule === "writer_auto_merge")).toBe(true);
  });
  it("beta-full: no download link in the hero, and no sign-in copy", () => {
    const fullHtml = renderToStaticMarkup(<LandingBody spotsLeft={0} maxTeams={150} free full />);
    const fullText = fullHtml.replace(/<[^>]+>/g, " ");
    expect(fullText).toContain("The beta is full. Get the next place.");
    expect(fullHtml).not.toMatch(/href="\/(download|start)/);
    expect(fullHtml).not.toContain("Sign in with GitHub");
  });
  it("the header mark links home on every page", () => {
    const header = renderToStaticMarkup(<SiteHeader current="faq" />);
    // next/link's <a> always re-appends href after spreading the other props
    // (see node_modules/next/dist/client/link.js), so aria-label lands before
    // href in the markup; match both regardless of attribute order.
    expect(header).toMatch(/<a\b(?=[^>]*\bhref="\/")(?=[^>]*\baria-label="DevBrain home")[^>]*>/);
    expect(header).toContain("DevBrain</span>");
  });
  it("the spawn window has three real tabs and starts on the second", () => {
    const tabButtons = [...html.matchAll(/<button [^>]*role="tab"[^>]*>/g)].map((m) => m[0]);
    const tabs = tabButtons.map((b) => b.match(/aria-selected="(true|false)"/)?.[1]);
    expect(tabs).toEqual(["false", "true", "false"]);
    expect(html).toContain("Sam · 2 · src/api/limits/**");
    for (const b of tabButtons) expect(b).toContain('aria-controls="spawn-panel"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain("$ devbrain spawn --auto");
    expect(html).toContain("~/.devbrain/clones/api-2");
  });
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
});
