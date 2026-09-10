// ============================================================================
// Billing usage for one team, read server-side: plan, status, the current
// billing period, seats used, actions today, overage so far. One query set
// shared by Team settings, the Plan page and the cap banner.
// ============================================================================

import { supabaseAdmin } from "@/lib/supabase/server";
import { PLANS, isEntitled, planOf, type Plan, type UsageSummary } from "./plans";

export interface BillingSnapshot {
  plan: Plan;
  status: string;
  trialEndsAt: string | null;
  periodStart: string;
  periodEnd: string;
  /** Effective limit: the team's override, else the plan default; null = unlimited (comped). */
  overageLimitCents: number | null;
  usage: UsageSummary;
  overageCents: number;
  entitled: boolean;
  /** Overage spend reached the limit (the AI layer is paused for the period). */
  overageExhausted: boolean;
  hasSubscription: boolean;
}

function periodOf(row: { period_start: string | null; period_end: string | null }): { start: Date; end: Date } {
  if (row.period_start && row.period_end) return { start: new Date(row.period_start), end: new Date(row.period_end) };
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export async function loadBilling(orgId: string): Promise<BillingSnapshot | null> {
  const admin = supabaseAdmin();
  const { data: org } = await admin
    .from("orgs")
    .select("plan, billing_status, trial_ends_at, period_start, period_end, overage_limit_cents, stripe_subscription_id")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return null;
  const plan = planOf(org.plan);
  const { start, end } = periodOf(org);
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: seats }, { data: todayRow }, { data: periodRows }] = await Promise.all([
    admin.rpc("billing_seats", { p_org: orgId, p_from: start.toISOString(), p_to: end.toISOString() }),
    admin.from("ai_usage").select("calls").eq("org_id", orgId).eq("day", today).maybeSingle(),
    admin.from("ai_usage").select("overage").eq("org_id", orgId).gte("day", start.toISOString().slice(0, 10)).lt("day", end.toISOString().slice(0, 10)),
  ]);
  const overageActions = (periodRows ?? []).reduce((a, r) => a + (r.overage ?? 0), 0);
  const comped = org.billing_status === "comped";
  const limit = comped ? null : (org.overage_limit_cents ?? plan.overageLimitCents);
  const overageCents = overageActions * plan.extraActionCents;
  return {
    plan,
    status: org.billing_status,
    trialEndsAt: org.trial_ends_at,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    overageLimitCents: limit,
    usage: { seatsUsed: Number(seats ?? 0), actionsToday: todayRow?.calls ?? 0, overageActions },
    overageCents,
    entitled: isEntitled(org.billing_status, { trialEndsAt: org.trial_ends_at, periodEnd: org.period_end }),
    overageExhausted: limit !== null && (limit <= 0 || overageCents + plan.extraActionCents > limit),
    hasSubscription: !!org.stripe_subscription_id,
  };
}

export { PLANS };
