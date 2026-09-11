// ============================================================================
// One Checkout Session builder for both surfaces: the Console (opens the URL
// outside the app) and the site (redirects to it). 7-day trial with card up
// front for a team that has never subscribed; a returning team pays now.
// ============================================================================

import { supabaseAdmin } from "@/lib/supabase/server";
import { PLANS, TRIAL_DAYS, type PlanId } from "./plans";
import { customerFor, lineItemsFor, stripe, stripeConfigured, stripeIds } from "./stripe";

export const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://devbrain-seven.vercel.app").replace(/\/$/, "");

export type CheckoutOutcome = { url: string } | { error: string };

export async function createCheckout(orgId: string, planId: PlanId, urls: { success: string; cancel: string }): Promise<CheckoutOutcome> {
  if (!stripeConfigured()) return { error: "Billing is not configured on this deployment." };
  const ids = await stripeIds();
  if (!ids) return { error: "Billing products are not set up yet." };
  if (!(planId in PLANS)) return { error: "Unknown plan." };
  const admin = supabaseAdmin();
  const { data: org } = await admin.from("orgs").select("name, billing_status, stripe_subscription_id").eq("id", orgId).single();
  if (!org) return { error: "Team not found." };
  if (org.stripe_subscription_id) return { error: "This team already has a subscription — use Manage billing." };
  const customer = await customerFor(orgId, { name: org.name });
  const firstTime = org.billing_status === "trialing";
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: orgId,
    line_items: lineItemsFor(ids, planId),
    payment_method_collection: "always",
    allow_promotion_codes: true,
    subscription_data: { metadata: { org_id: orgId }, ...(firstTime ? { trial_period_days: TRIAL_DAYS } : {}) },
    success_url: urls.success,
    cancel_url: urls.cancel,
  });
  return session.url ? { url: session.url } : { error: "Stripe did not return a Checkout URL." };
}
