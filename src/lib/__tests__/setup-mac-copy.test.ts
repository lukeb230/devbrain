import { describe, expect, it } from "vitest";
import { macSetupState, setupMacCopy } from "../setup-mac-copy";

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

describe("macSetupState", () => {
  const live = ["codex-mac", "Sam's MacBook"];
  it("fresh Mac: no local token, nothing done here even if the team has tokens", () => {
    expect(macSetupState({ liveLabels: live, hostname: "codex-mac", hasToken: false, bootstrapOk: null })).toEqual({ doneHere: false });
  });
  it("a token from a deleted Mac with the same name does not count without a local token", () => {
    expect(macSetupState({ liveLabels: ["Managed's Virtual Machine"], hostname: "Managed's Virtual Machine", hasToken: false, bootstrapOk: null })).toEqual({ doneHere: false });
  });
  it("local token whose label is live in this team, last bootstrap fine: done", () => {
    expect(macSetupState({ liveLabels: live, hostname: "codex-mac", hasToken: true, bootstrapOk: true })).toEqual({ doneHere: true });
    expect(macSetupState({ liveLabels: live, hostname: "codex-mac", hasToken: true, bootstrapOk: null })).toEqual({ doneHere: true });
  });
  it("hostname match is case-insensitive and trims whitespace", () => {
    expect(macSetupState({ liveLabels: ["Codex-Mac"], hostname: " codex-mac ", hasToken: true, bootstrapOk: true })).toEqual({ doneHere: true });
  });
  it("local token but this team has no live token with this Mac's name: not done (it is another team's token)", () => {
    expect(macSetupState({ liveLabels: [], hostname: "codex-mac", hasToken: true, bootstrapOk: true })).toEqual({ doneHere: false });
  });
  it("last bootstrap failed: not done", () => {
    expect(macSetupState({ liveLabels: live, hostname: "codex-mac", hasToken: true, bootstrapOk: false })).toEqual({ doneHere: false });
  });
  it("no hostname from the app: not done", () => {
    expect(macSetupState({ liveLabels: live, hostname: null, hasToken: true, bootstrapOk: true })).toEqual({ doneHere: false });
  });
});
