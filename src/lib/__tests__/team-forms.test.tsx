import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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
    const html = renderToStaticMarkup(<TeamForms appNext="/widget" full="DevBrain's beta is full right now." compact createAction={noop} joinAction={noop} />);
    // React escapes the apostrophe in the copy, so compare on the unescaped text.
    expect(html.replace(/&#x27;/g, "'")).toContain("DevBrain's beta is full right now.");
    expect(html).not.toContain('name="name"');
    expect(html).toContain('name="invite"');
  });
});
