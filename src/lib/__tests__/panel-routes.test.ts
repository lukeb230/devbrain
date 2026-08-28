import { describe, expect, it } from "vitest";
import { panelAllowed, safeNext } from "../panel-routes";

describe("panelAllowed", () => {
  it("allows the panel surface", () => {
    for (const p of ["/", "/widget", "/widget?x=1", "/auth/device", "/welcome", "/welcome?from=widget", "/join/abc"]) expect(panelAllowed(p)).toBe(true);
  });
  it("blocks the dashboard and settings", () => {
    for (const p of ["/dashboard", "/dashboard/x/rules", "/settings/org", "/joinx", "/welcomeness"]) expect(panelAllowed(p)).toBe(p === "/welcomeness");
  });
});

describe("safeNext", () => {
  it("accepts same-origin paths", () => expect(safeNext("/widget", "/x")).toBe("/widget"));
  it("rejects protocol-relative and absolute urls", () => {
    expect(safeNext("//evil.com", "/x")).toBe("/x");
    expect(safeNext("https://evil.com", "/x")).toBe("/x");
    expect(safeNext(null, "/x")).toBe("/x");
  });
});
