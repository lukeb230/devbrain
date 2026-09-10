import { describe, expect, it } from "vitest";
import { wallReason } from "../billing/wall";

const now = new Date("2026-09-10T12:00:00Z");

describe("wallReason", () => {
  it("never walls a complimentary team", () => {
    expect(wallReason({ status: "comped", hasSubscription: false, now })).toBeNull();
  });
  it("walls a team that has never subscribed, even inside its trial window", () => {
    expect(wallReason({ status: "trialing", hasSubscription: false, now })).toBe("never_subscribed");
  });
  it("lets a trialing subscriber through until the trial ends", () => {
    expect(wallReason({ status: "trialing", hasSubscription: true, trialEndsAt: "2026-09-17T00:00:00Z", now })).toBeNull();
    expect(wallReason({ status: "trialing", hasSubscription: true, trialEndsAt: "2026-09-09T00:00:00Z", now })).toBe("trial_ended");
  });
  it("gives past_due a week of grace, then walls", () => {
    expect(wallReason({ status: "past_due", hasSubscription: true, periodEnd: "2026-09-08T00:00:00Z", now })).toBeNull();
    expect(wallReason({ status: "past_due", hasSubscription: true, periodEnd: "2026-09-01T00:00:00Z", now })).toBe("past_due");
  });
  it("walls canceled teams and lets active ones through", () => {
    expect(wallReason({ status: "canceled", hasSubscription: false, now })).toBe("canceled");
    expect(wallReason({ status: "active", hasSubscription: true, now })).toBeNull();
  });
});
