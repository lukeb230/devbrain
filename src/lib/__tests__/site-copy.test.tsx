// src/lib/__tests__/site-copy.test.tsx
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LandingBody } from "@/app/landing/landing";
import { FAQ_ITEMS } from "@/app/faq/faq-items";
import { WRITER_CATALOG } from "@/lib/rules-catalog";

const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : []; });
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SITE_FILES = [...walk("src/app/landing"), ...walk("src/app/faq")].filter((p) => !p.includes("__tests__"));
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
  it("every Download for Mac points at /download and nothing points at the retired pages", () => {
    const links = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]*(?:<[^a][^>]*>[^<]*)*)<\/a>/g)];
    const downloads = links.filter((m) => m[2].includes("Download for Mac"));
    expect(downloads.length).toBeGreaterThanOrEqual(2);
    for (const m of downloads) expect(m[1]).toBe("/download");
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
    expect(fullHtml).not.toMatch(/href="\/download"/);
    expect(fullHtml).not.toContain("Sign in with GitHub");
  });
});
