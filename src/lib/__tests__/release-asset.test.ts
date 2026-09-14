import { describe, expect, it } from "vitest";
import { pickDmg } from "../release-asset";
const assets = [
  { name: "DevBrain-Beta.app.zip", browser_download_url: "u1" },
  { name: "DevBrain-Beta.dmg", browser_download_url: "u2" },
  { name: "DevBrain.dmg", browser_download_url: "u3" },
  { name: "DevBrain.app.zip.sha256", browser_download_url: "u4" },
];
describe("pickDmg", () => {
  it("prefers the stable dmg", () => { expect(pickDmg(assets, "stable")).toBe("u3"); });
  it("can pick beta", () => { expect(pickDmg(assets, "beta")).toBe("u2"); });
  it("null when no dmg", () => { expect(pickDmg([assets[0], assets[3]], "stable")).toBeNull(); });
});
