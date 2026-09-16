// src/lib/__tests__/support-forms.test.tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SupportForm } from "@/app/support/support-form";
import { HelpForms } from "@/app/desk/help/help-forms";
import { DESK_PAGES, DESK_SECTIONS } from "@/app/desk/sections";

describe("SupportForm (website)", () => {
  it("offers all three kinds, a honeypot, and posts as web", () => {
    const html = renderToStaticMarkup(<SupportForm email={null} />);
    for (const k of ["support", "bug", "feature"]) expect(html).toContain(`value="${k}"`);
    expect(html).toContain("Ask a question");
    expect(html).toContain("Report a bug");
    expect(html).toContain("Request a feature");
    expect(html).toContain('name="website"');
    expect(html).toContain('name="source" value="web"');
    expect(html).toContain('name="email"');
    // Same reasoning as the signed-in test below: React 19's
    // renderToStaticMarkup would emit `readOnly=""` (camelCase), never the
    // lowercase substring "readonly" — so a bare `not.toContain("readonly")`
    // can't fail even if the field were wrongly read-only. Extract the email
    // <input> tag and check it directly, symmetric with the signed-in case.
    const emailTagOut = html.match(/<input[^>]*\bname="email"[^>]*>/)?.[0] ?? "";
    expect(emailTagOut).not.toContain("readOnly");
  });
  it("locks the email to the signed-in account", () => {
    const html = renderToStaticMarkup(<SupportForm email="luke@example.com" />);
    expect(html).toContain('value="luke@example.com"');
    // React 19's renderToStaticMarkup (a) serializes the boolean readOnly prop
    // as the attribute `readOnly=""` (camelCase, not lowercase — confirmed in
    // react-dom/cjs/react-dom-server-legacy.node.development.js, which pushes
    // the literal JSX prop name for this class of boolean attribute), and (b)
    // reorders `name`/`value` to the end of the tag, after `readOnly`. So the
    // assertion pulls the email <input> tag out first and checks it for
    // readOnly regardless of attribute order or case, rather than assuming
    // `name="email"` precedes a lowercase `readonly` in the string.
    const emailTag = html.match(/<input[^>]*\bname="email"[^>]*>/)?.[0] ?? "";
    expect(emailTag).toContain("readOnly");
  });
});

describe("HelpForms (Console)", () => {
  it("is a bug form and a feature form, no support question, posting as console with the attach note", () => {
    const html = renderToStaticMarkup(<HelpForms />);
    expect(html.match(/<form/g)).toHaveLength(2);
    expect(html).toContain('name="kind" value="bug"');
    expect(html).toContain('name="kind" value="feature"');
    expect(html).not.toContain('value="support"');
    expect(html.match(/name="source" value="console"/g)).toHaveLength(2);
    expect(html).not.toContain('name="website"');
    expect(html).not.toContain('name="email"');
    expect(html).toContain("We attach your app version");
  });
  it("is reachable from the sidebar and the palette", () => {
    const settings = DESK_SECTIONS.find((g) => g.group === "Settings")!;
    expect(settings.items.map((i) => i.slug)).toEqual(["team", "mac", "help"]);
    expect(DESK_PAGES.find((p) => p.slug === "help")).toEqual({ slug: "help", label: "Help", group: "Settings" });
  });
});
