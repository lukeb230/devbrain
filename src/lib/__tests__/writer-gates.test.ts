import { describe, expect, it } from "vitest";
import { canAutoMerge, canRevert, canUpdateBranch, writeGranted, WRITE_RULES } from "@/lib/writer-gates";

describe("writeGranted", () => {
  it("needs write on both contents and pull requests", () => {
    expect(writeGranted({ contents: "write", pull_requests: "write" })).toBe(true);
    expect(writeGranted({ contents: "read", pull_requests: "write" })).toBe(false);
    expect(writeGranted({ contents: "write", pull_requests: "read" })).toBe(false);
    expect(writeGranted({ contents: null, pull_requests: null })).toBe(false);
    expect(writeGranted(null)).toBe(false);
  });
});

describe("canAutoMerge — the gating table", () => {
  const ok = { policyOn: true, installationId: 1, reviewState: "approved", light: "green" };
  it("merges only when every gate is open", () => {
    expect(canAutoMerge(ok)).toBe(true);
  });
  it("never merges with the switch off", () => {
    expect(canAutoMerge({ ...ok, policyOn: false })).toBe(false);
    expect(canAutoMerge({ ...ok, policyOn: null })).toBe(false);
  });
  it("never merges without an installation", () => {
    expect(canAutoMerge({ ...ok, installationId: null })).toBe(false);
  });
  it("never merges a PR that is not green", () => {
    expect(canAutoMerge({ ...ok, light: "yellow" })).toBe(false);
    expect(canAutoMerge({ ...ok, light: "red" })).toBe(false);
  });
  it("never merges on an AI-only verdict — a human must have approved", () => {
    // solo_green can turn the light green with review_state null.
    expect(canAutoMerge({ ...ok, reviewState: null })).toBe(false);
    expect(canAutoMerge({ ...ok, reviewState: "changes_requested" })).toBe(false);
  });
});

describe("canUpdateBranch / canRevert", () => {
  it("need the switch and an installation, nothing else", () => {
    expect(canUpdateBranch({ policyOn: true, installationId: 7 })).toBe(true);
    expect(canUpdateBranch({ policyOn: false, installationId: 7 })).toBe(false);
    expect(canUpdateBranch({ policyOn: true, installationId: null })).toBe(false);
    expect(canRevert({ policyOn: true, installationId: 7 })).toBe(true);
    expect(canRevert({ policyOn: undefined, installationId: 7 })).toBe(false);
    expect(canRevert({ policyOn: true, installationId: undefined })).toBe(false);
  });
});

describe("WRITE_RULES", () => {
  it("names exactly the three switches the Rules page shows", () => {
    expect([...WRITE_RULES]).toEqual(["writer_auto_merge", "writer_update_branch", "writer_revert_pr"]);
  });
});
