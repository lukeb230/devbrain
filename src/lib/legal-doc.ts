import { readFileSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";
import { LEGAL } from "./legal";

// ============================================================================
// The legal documents. The prose lives in src/content/legal/*.md so it can be
// read and diffed as text; the facts that change (contact, domain, dates,
// providers, governing law) are {{tokens}} filled from LEGAL so the site and
// the app never disagree. Rendering refuses to ship a document with an
// unfilled token or a leftover [PLACEHOLDER] from the drafts.
// ============================================================================

export type LegalDoc = "terms" | "privacy";

const DOCS: Record<LegalDoc, string> = {
  terms: "terms.md",
  privacy: "privacy.md",
};

/** Substitute {{tokens}} from LEGAL. Throws on an unknown token. */
export function fillTokens(md: string, values: Record<string, string> = LEGAL): string {
  return md.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_, key: string) => {
    const v = values[key];
    if (v === undefined) throw new Error(`legal doc: unknown token {{${key}}}`);
    return v;
  });
}

/** Anything that still looks like an unfilled placeholder. */
export function placeholders(text: string): string[] {
  const found = new Set<string>();
  // An all-caps bracketed run that is not a markdown link, or an unfilled token.
  for (const m of text.matchAll(/\[[A-Z][A-Z /,]+\](?!\()|\{\{[^}]*\}\}/g)) found.add(m[0]);
  return [...found];
}

/** The document's markdown with tokens filled. */
export function legalMarkdown(doc: LegalDoc, values: Record<string, string> = LEGAL): string {
  const raw = readFileSync(join(process.cwd(), "src", "content", "legal", DOCS[doc]), "utf8");
  const filled = fillTokens(raw, values);
  const left = placeholders(filled);
  if (left.length) throw new Error(`legal doc ${doc}: unfilled placeholders ${left.join(", ")}`);
  return filled;
}

/** The document as HTML (our own prose; no user content passes through here). */
export function legalHtml(doc: LegalDoc, values: Record<string, string> = LEGAL): string {
  return marked.parse(legalMarkdown(doc, values), { async: false }) as string;
}
