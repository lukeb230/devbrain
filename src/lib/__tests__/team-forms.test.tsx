import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FULL_MESSAGE } from "@/lib/beta";
import { TeamForms } from "@/app/welcome/team-forms";

const noop = async () => {};

describe("TeamForms", () => {
  it("carries the app surface back in both forms", () => {
    const html = renderToStaticMarkup(<TeamForms appNext="/desk" full={null} compact={false} createAction={noop} joinAction={noop} />);
    expect(html.match(/name="next" value="\/desk"/g)).toHaveLength(2);
    expect(html).toContain("Create a team");
    expect(html).toContain("Join with an invite");
  });
  it("omits the hidden next field in the browser", () => {
    const html = renderToStaticMarkup(<TeamForms appNext={null} full={null} compact={false} createAction={noop} joinAction={noop} />);
    expect(html).not.toContain('name="next"');
  });
  it("hides the create form and explains when the beta is full", () => {
    // The real message signupBlock() returns, so the rendered page is pinned to
    // production copy. React escapes its apostrophe, hence the unescaping.
    const html = renderToStaticMarkup(<TeamForms appNext="/widget" full={FULL_MESSAGE} compact createAction={noop} joinAction={noop} />);
    expect(html.replace(/&#x27;/g, "'")).toContain(FULL_MESSAGE);
    expect(html).not.toContain('name="name"');
    expect(html).toContain('name="invite"');
  });
  it("stacks each form's field and button when compact", () => {
    const props = { appNext: null, full: null, createAction: noop, joinAction: noop };
    expect(renderToStaticMarkup(<TeamForms {...props} compact />)).toContain('class="flex flex-col gap-2"');
    const wide = renderToStaticMarkup(<TeamForms {...props} compact={false} />);
    expect(wide).toContain('class="flex gap-2"');
    expect(wide).not.toContain("flex-col");
  });
});
