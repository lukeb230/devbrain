import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { alert } from "@/lib/alerts";
import { PLANS } from "@/lib/billing/plans";
import { planFromLookupKey, stripe, stripeConfigured } from "@/lib/billing/stripe";
import { patchFromSubscription } from "@/lib/billing/sync";
import { supabaseAdmin } from "@/lib/supabase/server";

// ============================================================================
// Stripe → DevBrain. Verified with STRIPE_WEBHOOK_SECRET. Every event that
// carries a subscription is folded into the team row through the same pure
// mapping, so replays and out-of-order deliveries converge on Stripe's truth.
// ============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function orgIdForCustomer(customerId: string, hint?: string | null): Promise<string | null> {
  const admin = supabaseAdmin();
  if (hint) {
    const { data } = await admin.from("orgs").select("id").eq("id", hint).maybeSingle();
    if (data) return data.id;
  }
  const { data } = await admin.from("orgs").select("id").eq("stripe_customer_id", customerId).maybeSingle();
  return data?.id ?? null;
}

async function syncSubscription(sub: Stripe.Subscription, orgHint?: string | null): Promise<string | null> {
  const patch = patchFromSubscription(sub, planFromLookupKey);
  const orgId = await orgIdForCustomer(patch.stripe_customer_id, orgHint ?? sub.metadata?.org_id);
  if (!orgId) return null;
  const admin = supabaseAdmin();
  await admin.from("orgs").update(patch).eq("id", orgId);
  if (patch.plan) await admin.from("orgs").update({ ai_daily_cap: PLANS[patch.plan].actionsPerDay }).eq("id", orgId);
  return orgId;
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeConfigured() || !secret) return NextResponse.json({ error: "billing not configured" }, { status: 503 });
  const sig = request.headers.get("stripe-signature") ?? "";
  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    return NextResponse.json({ error: `bad signature: ${e instanceof Error ? e.message : String(e)}` }, { status: 400 });
  }

  const admin = supabaseAdmin();
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        const customer = typeof s.customer === "string" ? s.customer : s.customer?.id;
        const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
        if (customer && s.client_reference_id) await admin.from("orgs").update({ stripe_customer_id: customer }).eq("id", s.client_reference_id);
        if (subId) await syncSubscription(await stripe().subscriptions.retrieve(subId), s.client_reference_id);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncSubscription(event.data.object);
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const inv = event.data.object;
        const parent = (inv as unknown as { parent?: { subscription_details?: { subscription?: string | { id: string } } } }).parent;
        const subRef = parent?.subscription_details?.subscription ?? (inv as unknown as { subscription?: string | { id: string } }).subscription;
        const subId = typeof subRef === "string" ? subRef : subRef?.id;
        const orgId = subId ? await syncSubscription(await stripe().subscriptions.retrieve(subId)) : null;
        if (event.type === "invoice.payment_failed" && orgId) {
          await alert({
            scope: { orgId },
            key: `billing.payment_failed.${inv.id}`,
            severity: "error",
            title: "Payment failed",
            detail: "Stripe could not charge the card on file. Update it under Console → Team → Manage billing; the AI layer pauses after seven days if the payment keeps failing.",
          });
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    // 500 makes Stripe retry, which is what we want for transient failures.
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
