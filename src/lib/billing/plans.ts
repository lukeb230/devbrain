// ============================================================================
// Plans — the one place the pricing table lives. Decided 2026-09-10.
//
//   Per TEAM, not per seat. A seat is any identity (human on any host, or a
//   spawned agent session) with at least one session in the billing month;
//   extra seats and extra AI actions are metered on the same invoice.
//   The Base allowance is deliberately low to move real agent teams to Scale.
//
// supabase/migrations/0037_billing.sql mirrors the two caps in plan_cap();
// the parity test in __tests__/plans.test.ts keeps them in step.
// ============================================================================

export type PlanId = "base" | "scale";
export type BillingStatus = "trialing" | "active" | "past_due" | "canceled" | "comped";

export interface Plan {
  id: PlanId;
  name: string;
  /** Flat monthly price. */
  priceCents: number;
  /** Identities included per month. */
  seats: number;
  /** Per extra identity per month. */
  extraSeatCents: number;
  /** Server-side AI actions per day (reviews, digests, standups, matching…). */
  actionsPerDay: number;
  /** Per action past the daily allowance. */
  extraActionCents: number;
  /** Default monthly overage spend before the AI layer pauses. */
  overageLimitCents: number;
}

export const PLANS: Record<PlanId, Plan> = {
  base: { id: "base", name: "Base", priceCents: 2900, seats: 3, extraSeatCents: 800, actionsPerDay: 40, extraActionCents: 10, overageLimitCents: 2000 },
  scale: { id: "scale", name: "Scale", priceCents: 9900, seats: 12, extraSeatCents: 600, actionsPerDay: 500, extraActionCents: 10, overageLimitCents: 10000 },
};

export const TRIAL_DAYS = 7;
/** Days a past_due team keeps its entitlement while Stripe retries the card. */
export const PAST_DUE_GRACE_DAYS = 7;

/** Plan for an org row; unknown or legacy values ("beta") read as Base. */
export function planOf(plan: string | null | undefined): Plan {
  return plan === "scale" ? PLANS.scale : PLANS.base;
}

export function capFor(plan: string | null | undefined): number {
  return planOf(plan).actionsPerDay;
}

/** Does this team currently get the AI layer and new tokens? Coordination
 *  (presence, collisions, tasks, handoffs) is never gated. */
export function isEntitled(
  status: string | null | undefined,
  opts: { trialEndsAt?: string | Date | null; periodEnd?: string | Date | null; now?: Date } = {},
): boolean {
  const now = opts.now ?? new Date();
  switch (status) {
    case "comped":
    case "active":
      return true;
    case "trialing": {
      const end = opts.trialEndsAt ? new Date(opts.trialEndsAt) : null;
      return !end || end.getTime() > now.getTime();
    }
    case "past_due": {
      const end = opts.periodEnd ? new Date(opts.periodEnd) : null;
      if (!end) return true;
      return end.getTime() + PAST_DUE_GRACE_DAYS * 86_400_000 > now.getTime();
    }
    default:
      return false; // canceled, unknown
  }
}

export interface UsageSummary {
  /** Distinct identities with a session this billing period. */
  seatsUsed: number;
  /** AI actions today. */
  actionsToday: number;
  /** Overage actions so far this billing period. */
  overageActions: number;
}

export interface InvoiceEstimate {
  planCents: number;
  extraSeats: number;
  extraSeatCents: number;
  overageActions: number;
  overageCents: number;
  totalCents: number;
}

/** What this period's invoice would be if it closed now. */
export function estimateInvoice(plan: Plan, usage: UsageSummary): InvoiceEstimate {
  const extraSeats = Math.max(0, usage.seatsUsed - plan.seats);
  const extraSeatCents = extraSeats * plan.extraSeatCents;
  const overageCents = usage.overageActions * plan.extraActionCents;
  return {
    planCents: plan.priceCents,
    extraSeats,
    extraSeatCents,
    overageActions: usage.overageActions,
    overageCents,
    totalCents: plan.priceCents + extraSeatCents + overageCents,
  };
}

/** The upgrade argument for the cap banner: what Scale would cost this team
 *  for the same usage. Positive savings = Scale is cheaper. */
export function scaleSavingsCents(usage: UsageSummary): number {
  const onBase = estimateInvoice(PLANS.base, usage).totalCents;
  // On Scale the same overage actions would mostly fall inside the allowance;
  // count only what would still exceed it, pro-rated by the cap ratio.
  const ratio = PLANS.base.actionsPerDay / PLANS.scale.actionsPerDay;
  const onScale = estimateInvoice(PLANS.scale, { ...usage, overageActions: Math.round(usage.overageActions * ratio) }).totalCents;
  return onBase - onScale;
}

export function dollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 === 0 ? 0 : 2 });
}
