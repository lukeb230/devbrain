// ============================================================================
// Stripe wiring. Test mode until phase 5. Keys come from the environment only
// (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
// the price and meter ids live in system_state.stripe, written once by
// scripts/stripe-setup.mjs (see lookup keys below — the same keys identify
// the objects in Stripe, so setup is idempotent).
// ============================================================================

import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PLANS, type PlanId } from "./plans";

export const LOOKUP = {
  flat: { base: "devbrain_base_flat", scale: "devbrain_scale_flat" },
  seat: { base: "devbrain_base_seat", scale: "devbrain_scale_seat" },
  action: "devbrain_action",
} as const;
export const METER_EVENT = { seat: "devbrain_extra_seat", action: "devbrain_extra_action" } as const;

export interface StripeIds {
  mode: "test" | "live";
  prices: { base_flat: string; scale_flat: string; base_seat: string; scale_seat: string; action: string };
  meters: { seat: string; action: string };
}

let client: Stripe | null = null;
export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}
export function stripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    client = new Stripe(key);
  }
  return client;
}

/** Price/meter ids for the current mode; null until setup has run. */
export async function stripeIds(): Promise<StripeIds | null> {
  const { data } = await supabaseAdmin().from("system_state").select("value").eq("key", "stripe").maybeSingle();
  const v = data?.value as StripeIds | null;
  if (!v?.prices?.base_flat) return null;
  const live = (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_");
  if ((live ? "live" : "test") !== v.mode) return null; // ids from the other mode are useless
  return v;
}

/** Line items for a plan: flat price + metered seats + metered actions. */
export function lineItemsFor(ids: StripeIds, plan: PlanId): Stripe.Checkout.SessionCreateParams.LineItem[] {
  return [
    { price: ids.prices[`${plan}_flat`], quantity: 1 },
    { price: ids.prices[`${plan}_seat`] },
    { price: ids.prices.action },
  ];
}

/** Find or create the Stripe customer for a team. */
export async function customerFor(orgId: string, opts: { name: string; email?: string | null }): Promise<string> {
  const admin = supabaseAdmin();
  const { data: org } = await admin.from("orgs").select("stripe_customer_id").eq("id", orgId).single();
  if (org?.stripe_customer_id) return org.stripe_customer_id;
  const c = await stripe().customers.create({ name: opts.name, email: opts.email ?? undefined, metadata: { org_id: orgId } });
  await admin.from("orgs").update({ stripe_customer_id: c.id }).eq("id", orgId);
  return c.id;
}

export function planFromLookupKey(key: string | null | undefined): PlanId | null {
  if (key === LOOKUP.flat.base) return "base";
  if (key === LOOKUP.flat.scale) return "scale";
  return null;
}

export { PLANS };
