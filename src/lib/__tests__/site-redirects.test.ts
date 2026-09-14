import { describe, expect, it } from "vitest";
import { siteRedirect } from "../site-redirects";
describe("siteRedirect", () => {
  it("retires the two pages", () => {
    expect(siteRedirect("/how-it-works")).toBe("/faq");
    expect(siteRedirect("/how-it-works/")).toBe("/faq");
    expect(siteRedirect("/pricing")).toBe("/");
  });
  it("leaves everything else alone", () => {
    expect(siteRedirect("/faq")).toBeNull();
    expect(siteRedirect("/pricing-plans")).toBeNull();
    expect(siteRedirect("/")).toBeNull();
  });
});
