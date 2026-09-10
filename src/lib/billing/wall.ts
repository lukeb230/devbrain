// ============================================================================
// The plan wall. Decided 2026-09-10: a team without an entitled subscription
// sees only the Plan page — in the Console and the panel — until Checkout
// completes. Data is never touched; the wall lifts on the next webhook.
// ============================================================================

import { isEntitled } from "./plans";

export type WallReason = "never_subscribed" | "trial_ended" | "past_due" | "canceled";

export interface WallInput {
  status: string;
  hasSubscription: boolean;
  trialEndsAt?: string | null;
  periodEnd?: string | null;
  now?: Date;
}

/** Why the wall shows, or null when the team is entitled. */
export function wallReason(b: WallInput): WallReason | null {
  if (b.status === "comped") return null;
  if (b.status === "canceled") return "canceled";
  if (b.status === "trialing" && !b.hasSubscription) return "never_subscribed";
  if (isEntitled(b.status, { trialEndsAt: b.trialEndsAt, periodEnd: b.periodEnd, now: b.now })) return null;
  if (b.status === "trialing") return "trial_ended";
  if (b.status === "past_due") return "past_due";
  return "canceled";
}

export const WALL_COPY: Record<WallReason, { title: string; body: string }> = {
  never_subscribed: { title: "Pick a plan to open the Console", body: "Your team is set up. Start the 7-day trial — card up front, nothing charged until it ends — and everything below unlocks." },
  trial_ended: { title: "Your trial has ended", body: "Everything the team built is saved. Subscribe to pick up exactly where you left off." },
  past_due: { title: "Payment failed", body: "Stripe could not charge the card on file and the grace period is over. Update the card to keep going — nothing has been deleted." },
  canceled: { title: "Subscription canceled", body: "The team's data is kept. Start a plan again whenever you're ready." },
};
