#!/usr/bin/env node
// ============================================================================
// One-time Stripe setup — creates the meters, products and prices that
// src/lib/billing/plans.ts describes, idempotently (lookup keys + metadata
// identify them), and prints the ids as JSON to store in system_state.stripe:
//
//   STRIPE_SECRET_KEY=sk_test_… node scripts/stripe-setup.mjs
//   (reads .env.local when the variable is not set)
//
// Run once per mode (test, then live in phase 5). Safe to re-run.
// ============================================================================

import { readFileSync } from "node:fs";
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const i = line.indexOf("=");
      if (i > 0 && line.slice(0, i).trim() === "STRIPE_SECRET_KEY") process.env.STRIPE_SECRET_KEY = line.slice(i + 1).trim().replace(/^"|"$/g, "");
    }
  } catch { /* no env file */ }
}
const key = process.env.STRIPE_SECRET_KEY;
if (!key || key.includes("SENSITIVE")) { console.error("STRIPE_SECRET_KEY missing (paste it into .env.local first)"); process.exit(1); }
const stripe = new Stripe(key);
const mode = key.startsWith("sk_live_") ? "live" : "test";

// Mirrors plans.ts (cents).
const PLANS = {
  base: { name: "DevBrain Base", flat: 2900, seat: 800 },
  scale: { name: "DevBrain Scale", flat: 9900, seat: 600 },
};
const ACTION_CENTS = 10;
const LOOKUP = { flat: { base: "devbrain_base_flat", scale: "devbrain_scale_flat" }, seat: { base: "devbrain_base_seat", scale: "devbrain_scale_seat" }, action: "devbrain_action" };
const METER_EVENT = { seat: "devbrain_extra_seat", action: "devbrain_extra_action" };

async function meter(eventName, displayName) {
  const existing = (await stripe.billing.meters.list({ limit: 100, status: "active" })).data.find((m) => m.event_name === eventName);
  if (existing) return existing;
  return stripe.billing.meters.create({
    display_name: displayName,
    event_name: eventName,
    default_aggregation: { formula: "sum" },
    customer_mapping: { type: "by_id", event_payload_key: "stripe_customer_id" },
    value_settings: { event_payload_key: "value" },
  });
}
async function product(key, name) {
  const found = (await stripe.products.search({ query: `metadata['devbrain_key']:'${key}'` })).data[0];
  if (found) return found;
  return stripe.products.create({ name, metadata: { devbrain_key: key } });
}
async function price(lookupKey, params) {
  const found = (await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 })).data[0];
  if (found) return found;
  return stripe.prices.create({ lookup_key: lookupKey, currency: "usd", ...params });
}

const seatMeter = await meter(METER_EVENT.seat, "DevBrain extra seats");
const actionMeter = await meter(METER_EVENT.action, "DevBrain extra AI actions");
const ids = { mode, prices: {}, meters: { seat: seatMeter.id, action: actionMeter.id } };
for (const plan of ["base", "scale"]) {
  const prod = await product(`plan_${plan}`, PLANS[plan].name);
  ids.prices[`${plan}_flat`] = (await price(LOOKUP.flat[plan], { product: prod.id, unit_amount: PLANS[plan].flat, recurring: { interval: "month" } })).id;
  ids.prices[`${plan}_seat`] = (await price(LOOKUP.seat[plan], { product: prod.id, unit_amount: PLANS[plan].seat, recurring: { interval: "month", usage_type: "metered", meter: seatMeter.id }, nickname: `${PLANS[plan].name} · extra seat` })).id;
}
const actionProd = await product("actions", "DevBrain extra AI actions");
ids.prices.action = (await price(LOOKUP.action, { product: actionProd.id, unit_amount: ACTION_CENTS, recurring: { interval: "month", usage_type: "metered", meter: actionMeter.id } })).id;

console.log(JSON.stringify(ids, null, 2));
console.error(`\nStore this as system_state.stripe (${mode} mode).`);

// --webhook https://host/api/billing/webhook — create (or reuse) the endpoint
// and write its signing secret to a private file, never to the terminal.
const wi = process.argv.indexOf("--webhook");
if (wi > 0) {
  const url = process.argv[wi + 1];
  const events = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed"];
  const have = (await stripe.webhookEndpoints.list({ limit: 100 })).data.find((w) => w.url === url);
  if (have) {
    console.error(`Webhook endpoint already exists for ${url} (${have.id}). Its secret is only shown at creation — reveal it in the Stripe dashboard if you need it again.`);
  } else {
    const ep = await stripe.webhookEndpoints.create({ url, enabled_events: events, description: "DevBrain" });
    const { writeFileSync, chmodSync } = await import("node:fs");
    const { homedir } = await import("node:os");
    const file = `${homedir()}/devbrain-stripe-webhook-${mode}.txt`;
    writeFileSync(file, `STRIPE_WEBHOOK_SECRET=${ep.secret}\n`);
    chmodSync(file, 0o600);
    console.error(`Webhook endpoint created (${ep.id}). Signing secret written to ${file} — add it to Vercel as STRIPE_WEBHOOK_SECRET, then delete the file.`);
  }
}
