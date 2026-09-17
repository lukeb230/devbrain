import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
const { default: GlobalError } = await import("@/app/global-error");
const { default: DeskError } = await import("@/app/desk/error");
const { default: WidgetError } = await import("@/app/widget/error");

const error = Object.assign(new Error("boom"), { digest: "abc" });
const reset = () => {};

describe("error boundaries", () => {
  it("root: says it was reported, offers reload and home", () => {
    const html = renderToStaticMarkup(<GlobalError error={error} reset={reset} />);
    expect(html).toContain("Something broke on our side. It&#x27;s been reported.");
    expect(html).toMatch(/<button[^>]*>Reload/);
    expect(html).toMatch(/href="\/"/);
    expect(html).not.toContain("boom"); // never show the raw message to a visitor
  });
  it("desk: retry and a way back to the Console home", () => {
    const html = renderToStaticMarkup(<DeskError error={error} reset={reset} />);
    expect(html).toContain("This page hit an error. It&#x27;s been reported.");
    expect(html).toMatch(/<button[^>]*>Retry/);
    expect(html).toMatch(/href="\/desk"/);
    expect(html).not.toContain("boom"); // never show the raw message to a visitor
  });
  it("panel: reload only, sized for 440px", () => {
    const html = renderToStaticMarkup(<WidgetError error={error} reset={reset} />);
    expect(html).toContain("The panel hit an error. It&#x27;s been reported.");
    expect(html).toMatch(/<button[^>]*>Reload/);
    expect(html).not.toContain("boom"); // never show the raw message to a visitor
  });
});
