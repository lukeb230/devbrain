// ============================================================================
// Usage → Stripe meters. Called from the agent tick at most once an hour.
//
//   actions  every completed UTC day with overage > 0 that hasn't been
//            reported yet → one meter event per team per day (identifier
//            keeps a retry from double-counting within Stripe's 24h window)
//   seats    once per billing period, in the last 12 hours before the period
//            ends → one meter event with the number of seats past the plan's
//            allowance, computed from billing_seats() over the whole period
//
// Complimentary teams and teams without a Stripe customer are skipped.
// ============================================================================

import { supabaseAdmin } from "@/lib/supabase/server";
import { planOf } from "./plans";
import { METER_EVENT, stripe, stripeConfigured } from "./stripe";

export interface ReportSummary { actions: number; seats: number; skipped: string[] }

export async function reportUsage(now = new Date()): Promise<ReportSummary> {
  const out: ReportSummary = { actions: 0, seats: 0, skipped: [] };
  if (!stripeConfigured()) { out.skipped.push("stripe not configured"); return out; }
  const admin = supabaseAdmin();
  const today = now.toISOString().slice(0, 10);

  // ---- actions ------------------------------------------------------------
  const { data: rows } = await admin
    .from("ai_usage")
    .select("org_id, day, overage, orgs!inner(stripe_customer_id, billing_status)")
    .gt("overage", 0)
    .is("reported_at", null)
    .lt("day", today)
    .limit(200);
  for (const r of rows ?? []) {
    const org = r.orgs as unknown as { stripe_customer_id: string | null; billing_status: string };
    if (!org.stripe_customer_id || org.billing_status === "comped") continue;
    await stripe().billing.meterEvents.create({
      event_name: METER_EVENT.action,
      identifier: `act:${r.org_id}:${r.day}`,
      payload: { stripe_customer_id: org.stripe_customer_id, value: String(r.overage) },
    });
    await admin.from("ai_usage").update({ reported_at: now.toISOString() }).eq("org_id", r.org_id).eq("day", r.day);
    out.actions++;
  }

  // ---- seats --------------------------------------------------------------
  const soon = new Date(now.getTime() + 12 * 3600_000).toISOString();
  const { data: orgs } = await admin
    .from("orgs")
    .select("id, plan, stripe_customer_id, period_start, period_end, seats_reported_period_end")
    .not("stripe_customer_id", "is", null)
    .not("stripe_subscription_id", "is", null)
    .in("billing_status", ["trialing", "active", "past_due"])
    .not("period_end", "is", null)
    .lte("period_end", soon)
    .gt("period_end", now.toISOString());
  for (const o of orgs ?? []) {
    if (o.seats_reported_period_end === o.period_end) continue;
    const { data: seats } = await admin.rpc("billing_seats", { p_org: o.id, p_from: o.period_start ?? o.period_end, p_to: o.period_end });
    const extra = Math.max(0, Number(seats ?? 0) - planOf(o.plan).seats);
    if (extra > 0) {
      await stripe().billing.meterEvents.create({
        event_name: METER_EVENT.seat,
        identifier: `seat:${o.id}:${o.period_end}`,
        payload: { stripe_customer_id: o.stripe_customer_id as string, value: String(extra) },
      });
    }
    await admin.from("orgs").update({ seats_reported_period_end: o.period_end }).eq("id", o.id);
    out.seats++;
  }
  return out;
}
