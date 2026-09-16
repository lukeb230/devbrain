// src/lib/__tests__/support-forms.test.tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SupportForm } from "@/app/support/support-form";

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
    expect(html).not.toContain("readonly");
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
