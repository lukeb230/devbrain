// ============================================================================
// Subscription → team. Pure mapping (tested) plus the one write that applies
// it. Every webhook that carries a subscription ends up here, so the team row
// is always a faithful copy of Stripe and replaying events is harmless.
// ============================================================================

import type { BillingStatus, PlanId } from "./plans";

export interface SubLike {
  id: string;
  status: string;
  customer: string | { id: string };
  trial_end?: number | null;
  /** Older API shapes carry the period on the subscription… */
  current_period_start?: number | null;
  current_period_end?: number | null;
  /** …newer ones on each item. */
  items: { data: { price: { lookup_key?: string | null }; current_period_start?: number | null; current_period_end?: number | null }[] };
}

export interface OrgBillingPatch {
  plan?: PlanId;
  billing_status: BillingStatus;
  trial_ends_at: string | null;
  period_start: string | null;
  period_end: string | null;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
}

const iso = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : null);

export function statusFromStripe(status: string): BillingStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "trialing"; // incomplete, paused: entitled but not yet paid — treated like a trial
  }
}

/** The team-row patch for a subscription. `planOf` maps a flat price's
 *  lookup key to a plan; items without a plan (seats, actions) are ignored. */
export function patchFromSubscription(sub: SubLike, planOf: (lookupKey: string | null | undefined) => PlanId | null): OrgBillingPatch {
  const first = sub.items.data[0];
  let plan: PlanId | undefined;
  for (const it of sub.items.data) {
    const p = planOf(it.price.lookup_key);
    if (p) { plan = p; break; }
  }
  const status = statusFromStripe(sub.status);
  return {
    ...(plan ? { plan } : {}),
    billing_status: status,
    trial_ends_at: iso(sub.trial_end),
    period_start: iso(sub.current_period_start ?? first?.current_period_start),
    period_end: iso(sub.current_period_end ?? first?.current_period_end),
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripe_subscription_id: status === "canceled" ? null : sub.id,
  };
}
