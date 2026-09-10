"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireRoleOrRedirect } from "@/lib/org";
import { PLANS, TRIAL_DAYS, type PlanId } from "@/lib/billing/plans";
import { LOOKUP, customerFor, lineItemsFor, planFromLookupKey, stripe, stripeConfigured, stripeIds } from "@/lib/billing/stripe";
import { patchFromSubscription } from "@/lib/billing/sync";

// ============================================================================
// Billing actions (admins). Each returns a URL the client opens OUTSIDE the
// app window (Stripe never loads inside the Console) or an error string.
// ============================================================================

const site = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://devbrain-seven.vercel.app").replace(/\/$/, "");
/** Back into the app on the exact route after Stripe. */
const back = (route: string) => `${site()}/open?to=${encodeURIComponent(route)}`;

export type BillingResult = { url: string } | { error: string };

export async function startCheckout(planId: PlanId): Promise<BillingResult> {
  try {
    return await startCheckoutInner(planId);
  } catch (e) {
    console.error("billing.startCheckout", e);
    return { error: `Stripe error: ${e instanceof Error ? e.message : String(e)}` };
  }
}
async function startCheckoutInner(planId: PlanId): Promise<BillingResult> {
  const me = await requireRoleOrRedirect("admin", "/desk/team");
  if (!stripeConfigured()) return { error: "Billing is not configured on this deployment." };
  const ids = await stripeIds();
  if (!ids) return { error: "Billing products are not set up yet." };
  if (!(planId in PLANS)) return { error: "Unknown plan." };
  const admin = supabaseAdmin();
  const { data: org } = await admin.from("orgs").select("name, billing_status, stripe_subscription_id").eq("id", me.orgId).single();
  if (!org) return { error: "Team not found." };
  if (org.stripe_subscription_id) return { error: "This team already has a subscription — use Manage billing." };
  const customer = await customerFor(me.orgId, { name: org.name });
  const firstTime = org.billing_status === "trialing"; // never subscribed → trial; a canceled team pays from day one
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: me.orgId,
    line_items: lineItemsFor(ids, planId),
    payment_method_collection: "always",
    allow_promotion_codes: true,
    subscription_data: { metadata: { org_id: me.orgId }, ...(firstTime ? { trial_period_days: TRIAL_DAYS } : {}) },
    success_url: back("/desk/plan?checkout=success"),
    cancel_url: back("/desk/plan?checkout=canceled"),
  });
  return session.url ? { url: session.url } : { error: "Stripe did not return a Checkout URL." };
}

export async function openPortal(): Promise<BillingResult> {
  try {
    return await openPortalInner();
  } catch (e) {
    console.error("billing.openPortal", e);
    return { error: `Stripe error: ${e instanceof Error ? e.message : String(e)}` };
  }
}
async function openPortalInner(): Promise<BillingResult> {
  const me = await requireRoleOrRedirect("admin", "/desk/team");
  if (!stripeConfigured()) return { error: "Billing is not configured on this deployment." };
  const { data: org } = await supabaseAdmin().from("orgs").select("name, stripe_customer_id").eq("id", me.orgId).single();
  if (!org?.stripe_customer_id) return { error: "No billing account yet — start a plan first." };
  const session = await stripe().billingPortal.sessions.create({ customer: org.stripe_customer_id, return_url: back("/desk/plan") });
  return { url: session.url };
}

/** Switch an existing subscription between Base and Scale (prorated). */
export async function changePlan(planId: PlanId): Promise<{ ok: true } | { error: string }> {
  try {
    return await changePlanInner(planId);
  } catch (e) {
    console.error("billing.changePlan", e);
    return { error: `Stripe error: ${e instanceof Error ? e.message : String(e)}` };
  }
}
async function changePlanInner(planId: PlanId): Promise<{ ok: true } | { error: string }> {
  const me = await requireRoleOrRedirect("admin", "/desk/team");
  if (!stripeConfigured()) return { error: "Billing is not configured on this deployment." };
  const ids = await stripeIds();
  if (!ids) return { error: "Billing products are not set up yet." };
  const admin = supabaseAdmin();
  const { data: org } = await admin.from("orgs").select("stripe_subscription_id, plan").eq("id", me.orgId).single();
  if (!org?.stripe_subscription_id) return { error: "No subscription to change — start a plan first." };
  if (org.plan === planId) return { ok: true };
  const sub = await stripe().subscriptions.retrieve(org.stripe_subscription_id);
  const flat = sub.items.data.find((it) => planFromLookupKey(it.price.lookup_key));
  const seat = sub.items.data.find((it) => it.price.lookup_key === LOOKUP.seat.base || it.price.lookup_key === LOOKUP.seat.scale);
  if (!flat || !seat) return { error: "Subscription items look unexpected — use Manage billing." };
  const updated = await stripe().subscriptions.update(sub.id, {
    items: [
      { id: flat.id, price: ids.prices[`${planId}_flat`] },
      { id: seat.id, price: ids.prices[`${planId}_seat`] },
    ],
    proration_behavior: "create_prorations",
  });
  await admin.from("orgs").update(patchFromSubscription(updated, planFromLookupKey)).eq("id", me.orgId);
  await admin.from("orgs").update({ ai_daily_cap: PLANS[planId].actionsPerDay }).eq("id", me.orgId);
  revalidatePath("/desk", "layout");
  return { ok: true };
}
