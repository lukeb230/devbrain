import { describe, expect, it } from "vitest";
import { setupMacCopy } from "../setup-mac-copy";

describe("setupMacCopy", () => {
  it("fresh Mac: plain set-up button, no note", () => {
    expect(setupMacCopy({ done: false, hasToken: false, orgName: "Northwind" })).toEqual({ button: "Set up this Mac", note: null });
  });
  it("Mac holds a token that is not live for this team: explains the re-setup", () => {
    const c = setupMacCopy({ done: false, hasToken: true, orgName: "Northwind" });
    expect(c.button).toBe("Set up this Mac for Northwind");
    expect(c.note).toBe("This Mac was set up before, but not for Northwind. Setting it up again points it at Northwind, so your editor sessions show up here.");
  });
  it("done: re-run only, no note", () => {
    expect(setupMacCopy({ done: true, hasToken: true, orgName: "Northwind" })).toEqual({ button: "Re-run setup", note: null });
  });
  it("done but config lost locally still offers re-run", () => {
    expect(setupMacCopy({ done: true, hasToken: false, orgName: "Northwind" }).button).toBe("Re-run setup");
  });
});
