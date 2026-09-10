import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLANS, TRIAL_DAYS, capFor, dollars, estimateInvoice, isEntitled, planOf, scaleSavingsCents } from "../billing/plans";

describe("plans", () => {
  it("holds the decided pricing table", () => {
    expect(PLANS.base).toMatchObject({ priceCents: 2900, seats: 3, extraSeatCents: 800, actionsPerDay: 40, extraActionCents: 10, overageLimitCents: 2000 });
    expect(PLANS.scale).toMatchObject({ priceCents: 9900, seats: 12, extraSeatCents: 600, actionsPerDay: 500, extraActionCents: 10, overageLimitCents: 10000 });
    expect(TRIAL_DAYS).toBe(7);
  });
  it("reads legacy or unknown plan values as Base", () => {
    expect(planOf("beta").id).toBe("base");
    expect(planOf(null).id).toBe("base");
    expect(planOf("scale").id).toBe("scale");
    expect(capFor("scale")).toBe(500);
    expect(capFor(undefined)).toBe(40);
  });
  it("keeps the SQL caps in step with the code", () => {
    const sql = readFileSync(new URL("../../../supabase/migrations/0037_billing.sql", import.meta.url), "utf8");
    expect(sql).toContain(`when 'scale' then ${PLANS.scale.actionsPerDay} else ${PLANS.base.actionsPerDay} end`);
    expect(sql).toContain(`when 'scale' then ${PLANS.scale.overageLimitCents} else ${PLANS.base.overageLimitCents} end`);
    expect(sql).toContain(`* ${PLANS.base.extraActionCents} > v_limit`); // per-action price in the reserve
  });
});

describe("isEntitled", () => {
  const now = new Date("2026-09-10T12:00:00Z");
  it("active and comped always; canceled never", () => {
    expect(isEntitled("active", { now })).toBe(true);
    expect(isEntitled("comped", { now })).toBe(true);
    expect(isEntitled("canceled", { now })).toBe(false);
    expect(isEntitled(undefined, { now })).toBe(false);
  });
  it("trialing until the trial end", () => {
    expect(isEntitled("trialing", { now, trialEndsAt: "2026-09-11T00:00:00Z" })).toBe(true);
    expect(isEntitled("trialing", { now, trialEndsAt: "2026-09-10T11:59:00Z" })).toBe(false);
    expect(isEntitled("trialing", { now })).toBe(true); // no end recorded yet (Checkout pending)
  });
  it("past_due keeps a 7-day grace after the period end", () => {
    expect(isEntitled("past_due", { now, periodEnd: "2026-09-05T00:00:00Z" })).toBe(true);
    expect(isEntitled("past_due", { now, periodEnd: "2026-09-01T00:00:00Z" })).toBe(false);
  });
});

describe("invoice estimate", () => {
  it("adds extra seats and overage to the flat price", () => {
    const e = estimateInvoice(PLANS.base, { seatsUsed: 5, actionsToday: 12, overageActions: 150 });
    expect(e).toEqual({ planCents: 2900, extraSeats: 2, extraSeatCents: 1600, overageActions: 150, overageCents: 1500, totalCents: 6000 });
    expect(estimateInvoice(PLANS.scale, { seatsUsed: 3, actionsToday: 0, overageActions: 0 }).totalCents).toBe(9900);
  });
  it("shows when Scale would be cheaper", () => {
    // 5 people + 10 agents on Base with heavy overage: Scale wins.
    expect(scaleSavingsCents({ seatsUsed: 15, actionsToday: 40, overageActions: 400 })).toBeGreaterThan(0);
    // A solo with two agents: Base wins.
    expect(scaleSavingsCents({ seatsUsed: 3, actionsToday: 5, overageActions: 0 })).toBeLessThan(0);
  });
  it("formats dollars", () => {
    expect(dollars(2900)).toBe("$29");
    expect(dollars(1150)).toBe("$11.50");
  });
});
