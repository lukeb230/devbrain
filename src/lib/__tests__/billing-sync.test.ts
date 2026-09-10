import { describe, expect, it } from "vitest";
import { patchFromSubscription, statusFromStripe } from "../billing/sync";
import { planFromLookupKey } from "../billing/stripe";

const sub = (over: Record<string, unknown> = {}) => ({
  id: "sub_1",
  status: "trialing",
  customer: "cus_1",
  trial_end: 1_800_000_000,
  items: { data: [
    { price: { lookup_key: "devbrain_base_flat" }, current_period_start: 1_799_000_000, current_period_end: 1_801_000_000 },
    { price: { lookup_key: "devbrain_base_seat" } },
    { price: { lookup_key: "devbrain_action" } },
  ] },
  ...over,
});

describe("statusFromStripe", () => {
  it("maps every Stripe status onto the five we keep", () => {
    expect(statusFromStripe("trialing")).toBe("trialing");
    expect(statusFromStripe("active")).toBe("active");
    expect(statusFromStripe("past_due")).toBe("past_due");
    expect(statusFromStripe("unpaid")).toBe("past_due");
    expect(statusFromStripe("canceled")).toBe("canceled");
    expect(statusFromStripe("incomplete_expired")).toBe("canceled");
    expect(statusFromStripe("incomplete")).toBe("trialing");
  });
});

describe("patchFromSubscription", () => {
  it("reads the plan from the flat price and the period from the item", () => {
    const p = patchFromSubscription(sub(), planFromLookupKey);
    expect(p).toEqual({
      plan: "base",
      billing_status: "trialing",
      trial_ends_at: "2027-01-15T08:00:00.000Z",
      period_start: "2027-01-03T18:13:20.000Z",
      period_end: "2027-01-26T21:46:40.000Z",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
    });
  });
  it("prefers a subscription-level period when present and handles expanded customers", () => {
    const p = patchFromSubscription(sub({ status: "active", trial_end: null, customer: { id: "cus_2" }, current_period_start: 1_700_000_000, current_period_end: 1_702_000_000 }), planFromLookupKey);
    expect(p.billing_status).toBe("active");
    expect(p.trial_ends_at).toBeNull();
    expect(p.period_start).toBe("2023-11-14T22:13:20.000Z");
    expect(p.stripe_customer_id).toBe("cus_2");
  });
  it("drops the subscription id on cancel and keeps the plan unknown when no flat price is present", () => {
    const p = patchFromSubscription(sub({ status: "canceled", items: { data: [{ price: { lookup_key: "devbrain_action" } }] } }), planFromLookupKey);
    expect(p.billing_status).toBe("canceled");
    expect(p.stripe_subscription_id).toBeNull();
    expect("plan" in p).toBe(false);
  });
  it("recognises the Scale flat price", () => {
    const p = patchFromSubscription(sub({ items: { data: [{ price: { lookup_key: "devbrain_scale_flat" } }] } }), planFromLookupKey);
    expect(p.plan).toBe("scale");
  });
});
