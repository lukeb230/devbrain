import { describe, expect, it } from "vitest";
import { appChannel } from "../app-channel";

describe("appChannel", () => {
  it("defaults to stable", () => {
    expect(appChannel(undefined)).toEqual({ channel: "stable", scheme: "devbrain", name: "DevBrain", other: { scheme: "devbrain-beta", name: "DevBrain Beta" } });
    expect(appChannel("nonsense").channel).toBe("stable");
  });
  it("beta flips both the primary and the alternative", () => {
    expect(appChannel("beta")).toEqual({ channel: "beta", scheme: "devbrain-beta", name: "DevBrain Beta", other: { scheme: "devbrain", name: "DevBrain" } });
  });
});
