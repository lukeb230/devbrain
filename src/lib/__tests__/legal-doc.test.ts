import { describe, expect, it } from "vitest";
import { COOKIE } from "../cookies";
import { LEGAL } from "../legal";
import { WRITE_RULES } from "../writer-gates";
import { fillTokens, legalHtml, legalMarkdown, placeholders } from "../legal-doc";

describe("legal documents", () => {
  it("fill every token from LEGAL and leave no placeholder", () => {
    for (const doc of ["terms", "privacy"] as const) {
      const md = legalMarkdown(doc);
      expect(placeholders(md)).toEqual([]);
      expect(md).toContain(`Effective: ${LEGAL.effective}`);
      expect(md).toContain(LEGAL.domain);
      expect(md).toContain(LEGAL.contact);
    }
  });

  it("the privacy policy discloses support requests and the email provider", () => {
    const privacy = legalMarkdown("privacy");
    expect(privacy).toContain("**Support requests.**");
    expect(privacy).toContain(`Email delivery: ${LEGAL.emailProvider}`);
    expect(privacy).not.toContain("we do not send email at all");
    expect(privacy).toContain("**Support requests:**");
  });

  it("refuses an unknown token or a leftover draft placeholder", () => {
    expect(() => fillTokens("hello {{nope}}")).toThrow(/unknown token/);
    expect(placeholders("see [EMAIL] and [STATE / COUNTRY] and {{x}}")).toEqual(["[EMAIL]", "[STATE / COUNTRY]", "{{x}}"]);
    expect(placeholders("the `.brain` folder and [a link](/privacy)")).toEqual([]);
  });

  it("state the facts the code enforces", () => {
    const privacy = legalMarkdown("privacy");
    for (const fact of [
      "hash of the token, never the token itself",
      "exactly three",
      "15 minutes after its last signal",
      "24 hours by default and at most 72",
      "deleted 72 hours after completion",
      "in any case within 7 days",
      "Unlinking a repository alone keeps them",
      "do not keep separate database backups today",
      "run no analytics today",
      LEGAL.aiProvider,
      LEGAL.hosting,
      LEGAL.database,
      LEGAL.region,
    ]) expect(privacy).toContain(fact);
    const terms = legalMarkdown("terms");
    for (const fact of [LEGAL.law, LEGAL.venue, LEGAL.repo, LEGAL.trademarks, "one hundred US dollars", "at least 18 years old"]) expect(terms).toContain(fact);
  });

  it("describe every cookie and the real number of write rules", () => {
    const privacy = legalMarkdown("privacy");
    // One purpose per cookie in src/lib/cookies.ts, in the order they are declared.
    const purposes: Record<keyof typeof COOKIE, string> = { org: "active team", lastRepo: "last repository", next: "where to return after sign-in", newToken: "the token itself", notice: "one-time notice", channel: "which app build you use" };
    for (const key of Object.keys(COOKIE) as (keyof typeof COOKIE)[]) expect(privacy).toContain(purposes[key]);
    expect(WRITE_RULES).toHaveLength(3);
    expect(privacy).toContain("There are exactly three");
  });

  it("render to HTML with headings, lists and the privacy link", () => {
    const html = legalHtml("terms");
    expect(html).toContain("<h1>Terms of Use</h1>");
    expect((html.match(/<h2>/g) ?? []).length).toBe(18);
    expect(html).toContain('<a href="/privacy">Privacy Policy</a>');
    expect(html).toContain("<li>");
    const p = legalHtml("privacy");
    expect((p.match(/<h2>/g) ?? []).length).toBe(13);
  });
});
