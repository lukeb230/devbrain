// src/lib/__tests__/site-copy.test.tsx
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LandingBody } from "@/app/landing/landing";
import { FAQ_ITEMS } from "@/app/faq/faq-items";

const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : []; });
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SITE_FILES = [...walk("src/app/landing"), ...walk("src/app/faq")].filter((p) => !p.includes("__tests__"));
const source = SITE_FILES.map((p) => strip(readFileSync(p, "utf8"))).join("\n");

const html = renderToStaticMarkup(<LandingBody spotsLeft={148} maxTeams={200} free full={false} />);
const text = html.replace(/<[^>]+>/g, " ");

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
    const own = text.replace(/[^.?!]*\?/g, ""); // drop FAQ-style questions (the visitor speaking)
    expect(own).not.toMatch(/\b(I|me|my)\b/);
    expect(FAQ_ITEMS).toHaveLength(11);
  });
});
