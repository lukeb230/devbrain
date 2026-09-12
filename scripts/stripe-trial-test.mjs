#!/usr/bin/env node
// ============================================================================
// Prove the money is right when a trial ends — the one billing path real time
// would take a week to reach. Uses a Stripe TEST CLOCK:
//
//   STRIPE_SECRET_KEY=sk_test_… node scripts/stripe-trial-test.mjs [base|scale]
//   (reads .env.local when the variable is not set)
//
//   1. a customer + subscription on a frozen clock, 7-day trial, our real
//      prices (flat + metered seats + metered actions)
//   2. usage reported to both meters, exactly as the agent tick does
//   3. the clock jumps past the trial
//   4. assert: the subscription converts to active, an invoice is finalised,
//      and it carries the flat price plus the metered lines at our rates
//
// Test mode only — it refuses a live key. The customer is unlinked to any
// team, so the production webhook sees it and correctly does nothing.
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
if (!key || key.includes("SENSITIVE")) { console.error("STRIPE_SECRET_KEY missing"); process.exit(1); }
if (key.startsWith("sk_live_")) { console.error("refusing to run against a LIVE key"); process.exit(1); }
const stripe = new Stripe(key);

const PLAN = process.argv[2] === "scale" ? "scale" : "base";
const EXTRA_SEATS = 2;      // 5 identities on Base (3 included) / 14 on Scale
const EXTRA_ACTIONS = 37;   // a busy week past the daily allowance
const LOOKUP = {
  base: { flat: "devbrain_base_flat", seat: "devbrain_base_seat" },
  scale: { flat: "devbrain_scale_flat", seat: "devbrain_scale_seat" },
  action: "devbrain_action",
};
const money = (c) => `$${(c / 100).toFixed(2)}`;
const step = (s) => console.log(`\n── ${s} ${"─".repeat(Math.max(0, 40 - s.length))}`);
let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}: ${actual}${ok ? "" : `  (expected ${expected})`}`);
}

const priceFor = async (lookupKey) => {
  const { data } = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1, expand: ["data.product"] });
  if (!data[0]) throw new Error(`price ${lookupKey} not found — run scripts/stripe-setup.mjs first`);
  return data[0];
};

step("prices");
const flat = await priceFor(LOOKUP[PLAN].flat);
const seat = await priceFor(LOOKUP[PLAN].seat);
const action = await priceFor(LOOKUP.action);
console.log(`  ${PLAN}: flat ${money(flat.unit_amount)}/mo · seat ${money(seat.unit_amount)} · action ${money(action.unit_amount)}`);

step("customer on a frozen clock");
const now = Math.floor(Date.now() / 1000);
const clock = await stripe.testHelpers.testClocks.create({ frozen_time: now, name: `devbrain trial ${PLAN}` });
const customer = await stripe.customers.create({
  name: `Trial test (${PLAN})`,
  test_clock: clock.id,
  payment_method: "pm_card_visa",
  invoice_settings: { default_payment_method: "pm_card_visa" },
});
console.log(`  clock ${clock.id} · customer ${customer.id}`);

step("subscription with a 7-day trial");
let sub = await stripe.subscriptions.create({
  customer: customer.id,
  items: [{ price: flat.id, quantity: 1 }, { price: seat.id }, { price: action.id }],
  trial_period_days: 7,
  metadata: { devbrain_test: "trial-conversion" },
});
check("status during the trial", sub.status, "trialing");
console.log(`  trial ends ${new Date(sub.trial_end * 1000).toISOString().slice(0, 16)}Z`);

step("report usage, the way the agent tick does");
for (const [event, value] of [["devbrain_extra_seat", EXTRA_SEATS], ["devbrain_extra_action", EXTRA_ACTIONS]]) {
  await stripe.billing.meterEvents.create({
    event_name: event,
    identifier: `${event}:${customer.id}:1`,
    payload: { stripe_customer_id: customer.id, value: String(value) },
  });
  console.log(`  ${event} = ${value}`);
}

async function advanceTo(when) {
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: when + 3600 });
  for (let i = 0; i < 90; i++) {
    const c = await stripe.testHelpers.testClocks.retrieve(clock.id);
    if (c.status === "ready") return;
    if (c.status === "internal_failure") throw new Error("test clock failed");
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("test clock never became ready");
}
async function latestInvoice(notThisOne) {
  for (let i = 0; i < 20; i++) {
    const { data } = await stripe.invoices.list({ customer: customer.id, limit: 5 });
    const inv = data.find((x) => x.status !== "draft" && x.id !== notThisOne);
    if (inv) return inv;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("no invoice was generated");
}
function show(inv) {
  console.log(`  invoice ${inv.number ?? inv.id} · ${inv.status} · total ${money(inv.total)}`);
  for (const l of inv.lines.data) console.log(`    · ${l.description ?? l.price?.lookup_key ?? "?"} → ${money(l.amount)}`);
}

step("advance the clock past the trial");
await advanceTo(sub.trial_end);
sub = await stripe.subscriptions.retrieve(sub.id);
check("status after the trial", sub.status, "active");

step("the conversion invoice — trial usage is free, so this is the plan only");
const first = await latestInvoice();
show(first);
check("first invoice total", money(first.total), money(flat.unit_amount));
check("first invoice is paid", first.status, "paid");

step("usage in the first PAID period, then advance a month");
for (const [event, value] of [["devbrain_extra_seat", EXTRA_SEATS], ["devbrain_extra_action", EXTRA_ACTIONS]]) {
  await stripe.billing.meterEvents.create({
    event_name: event,
    identifier: `${event}:${customer.id}:2`,
    payload: { stripe_customer_id: customer.id, value: String(value) },
  });
  console.log(`  ${event} = ${value}`);
}
await advanceTo(sub.items.data[0].current_period_end ?? sub.current_period_end);
sub = await stripe.subscriptions.retrieve(sub.id);
check("still active after renewal", sub.status, "active");

step("the first real invoice — plan + metered extras");
const second = await latestInvoice(first.id);
show(second);
const want = flat.unit_amount + EXTRA_SEATS * seat.unit_amount + EXTRA_ACTIONS * action.unit_amount;
check("renewal invoice total", money(second.total), money(want));
check("renewal invoice is paid", second.status, "paid");

step("clean up");
await stripe.subscriptions.cancel(sub.id).catch(() => {});
await stripe.testHelpers.testClocks.del(clock.id).catch(() => {});   // takes the customer with it
console.log("  clock and customer deleted");

console.log(failures === 0 ? "\n✔ trial conversion and the first invoice are correct" : `\n✗ ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
