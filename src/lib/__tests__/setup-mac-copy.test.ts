import { describe, expect, it } from "vitest";
import { setupMacCopy } from "../setup-mac-copy";

describe("setupMacCopy", () => {
  it("fresh Mac: plain set-up button, no note", () => {
    expect(setupMacCopy({ done: false, hasToken: false, orgName: "Northwind" })).toEqual({ button: "Set up this Mac", note: null });
  });
  it("Mac already belongs to another team: explains the switch", () => {
    const c = setupMacCopy({ done: false, hasToken: true, orgName: "Northwind" });
    expect(c.button).toBe("Switch this Mac to Northwind");
    expect(c.note).toBe("This Mac is set up for a different team. Switching it to Northwind means your editor sessions show up here instead.");
  });
  it("done: re-run only, no note", () => {
    expect(setupMacCopy({ done: true, hasToken: true, orgName: "Northwind" })).toEqual({ button: "Re-run setup", note: null });
  });
  it("done but config lost locally still offers re-run", () => {
    expect(setupMacCopy({ done: true, hasToken: false, orgName: "Northwind" }).button).toBe("Re-run setup");
  });
});
