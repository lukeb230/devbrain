import { describe, expect, it } from "vitest";
import { browserRedirect, isAppRequest } from "../app-only";

const APP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 DevBrainApp/1";
const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

describe("isAppRequest", () => {
  it("recognises the app's webviews and nothing else", () => {
    expect(isAppRequest(APP)).toBe(true);
    expect(isAppRequest(SAFARI)).toBe(false);
    expect(isAppRequest(null)).toBe(false);
    expect(isAppRequest("curl/8.4.0")).toBe(false);
  });
});

describe("browserRedirect", () => {
  it("does nothing while the gate is off", () => {
    expect(browserRedirect("/desk/board", SAFARI, false)).toBeNull();
  });
  it("sends a browser to /open for the working surfaces, keeping the route", () => {
    expect(browserRedirect("/desk", SAFARI, true)).toBe("/open?to=%2Fdesk");
    expect(browserRedirect("/desk/board", SAFARI, true)).toBe("/open?to=%2Fdesk%2Fboard");
    expect(browserRedirect("/desk/members", SAFARI, true)).toBe("/open?to=%2Fdesk%2Fmembers");
  });
  it("never gets in the app's way", () => {
    for (const p of ["/desk", "/desk/board", "/desk/rules"]) expect(browserRedirect(p, APP, true)).toBeNull();
  });
  it("keeps the front door and billing open to browsers", () => {
    for (const p of ["/", "/welcome", "/welcome/plan", "/join/abc", "/open", "/pricing", "/desk/plan", "/settings/setup", "/privacy", "/auth/callback", "/api/v1/health"]) {
      expect(browserRedirect(p, SAFARI, true)).toBeNull();
    }
  });
});
