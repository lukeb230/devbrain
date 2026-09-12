#!/usr/bin/env node
// ============================================================================
// The beta switch and the limits, from the terminal.
//
//   node scripts/beta.mjs                      # show everything
//   node scripts/beta.mjs free on|off
//   node scripts/beta.mjs cap teams 150
//   node scripts/beta.mjs cap members 600
//   node scripts/beta.mjs cap teams none       # no ceiling
//   node scripts/beta.mjs signups open|invite
//   node scripts/beta.mjs limit org_per_min 2000
//   node scripts/beta.mjs ends 2026-11-01     # announce the end (or "none")
//   node scripts/beta.mjs convert --days 14   # ...then move the cohort onto a trial
//
// Coming out of the beta is two deliberate steps, in this order:
//   1. ends <date>   teams are told, on the Plan page and by a notice from a
//                    week out. Give people real warning.
//   2. free off      NEW teams start paying the normal way. The teams already
//                    on the beta are untouched — no wall, no surprise.
//   3. convert       the beta cohort gets a trial and the ordinary wall and
//                    Checkout take over from there. Prints what it will do;
//                    add --yes to actually write.
//
// Everything it writes lives in system_state, so a change takes effect within
// a minute with no deploy. Reads SUPABASE_SERVICE_ROLE_KEY and
// NEXT_PUBLIC_SUPABASE_URL from the environment, else from .env.local.
//
// What each switch does:
//   free      new teams are created comped, and teams that never subscribed
//             are treated as comped. Turning it off does NOT wall the teams
//             already created during the beta — they stay comped until you
//             convert them deliberately (they carry orgs.beta = true).
//   cap       how many teams / distinct people may exist before signups close
//   signups   invite = only people arriving on an invite link may make a team
//   limit     the API ceilings in system_state.rate_limits
// ============================================================================

import { readFileSync } from "node:fs";

for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL"]) {
  if (process.env[name]) continue;
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const i = line.indexOf("=");
      if (i > 0 && line.slice(0, i).trim() === name) process.env[name] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
    }
  } catch {}
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required (they are in .env.local)"); process.exit(1); }

const rest = (path, init = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json", ...(init.headers ?? {}) } });

async function get(key) {
  const r = await rest(`system_state?key=eq.${key}&select=value`);
  const rows = await r.json();
  return rows?.[0]?.value ?? {};
}
async function put(key, value) {
  const r = await rest("system_state", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) { console.error(await r.text()); process.exit(1); }
}
async function counts() {
  const r = await rest("rpc/platform_counts", { method: "POST", body: "{}" });
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

const [cmd, a, b] = process.argv.slice(2);

if (!cmd || cmd === "show") {
  const [beta, signups, limits, c] = await Promise.all([get("beta"), get("signups"), get("rate_limits"), counts()]);
  const cap = (v) => (v === null || v === undefined ? "no ceiling" : v);
  console.log(`
  beta       free: ${beta.free === true ? "YES — nobody is charged" : "no — plans and trials apply"}
             teams: ${c?.teams ?? "?"} / ${cap(beta.max_teams)}
             people: ${c?.members ?? "?"} / ${cap(beta.max_members)}
  ends       ${beta.ends_at ? `${beta.ends_at}  (shown to every beta team)` : "not announced"}
  signups    ${signups.mode ?? "invite"}${(signups.mode ?? "invite") === "invite" ? "  (only people arriving on an invite link may create a team)" : "  (anyone signed in may create a team)"}
  limits     ${Object.entries(limits).map(([k, v]) => `${k}=${v}`).join("  ") || "(defaults)"}
`);
  process.exit(0);
}

if (cmd === "free" && (a === "on" || a === "off")) {
  const beta = await get("beta");
  await put("beta", { ...beta, free: a === "on" });
  console.log(`Free beta ${a}. Teams already created during the beta keep their comped status.`);
} else if (cmd === "cap" && (a === "teams" || a === "members")) {
  const beta = await get("beta");
  const v = b === "none" ? null : Number(b);
  if (b !== "none" && !Number.isFinite(v)) { console.error("cap <teams|members> <number|none>"); process.exit(1); }
  await put("beta", { ...beta, [a === "teams" ? "max_teams" : "max_members"]: v });
  console.log(`Cap on ${a}: ${v === null ? "removed" : v}.`);
} else if (cmd === "signups" && (a === "open" || a === "invite")) {
  await put("signups", { mode: a });
  console.log(`Signups: ${a}.`);
} else if (cmd === "limit" && a && b) {
  const limits = await get("rate_limits");
  if (!Number.isFinite(Number(b))) { console.error("limit <name> <number>"); process.exit(1); }
  await put("rate_limits", { ...limits, [a]: Number(b) });
  console.log(`${a} = ${b}. In effect within a minute.`);
} else if (cmd === "ends" && a) {
  const beta = await get("beta");
  if (a === "none") {
    await put("beta", { ...beta, ends_at: null });
    console.log("End date cleared — teams are told only that they will hear before anything changes.");
  } else if (Number.isNaN(Date.parse(a))) {
    console.error("ends <YYYY-MM-DD|none>");
    process.exit(1);
  } else {
    const iso = new Date(a).toISOString();
    await put("beta", { ...beta, ends_at: iso });
    console.log(`The beta now says it ends ${iso.slice(0, 10)}. Every beta team sees that on Console → Plan, and gets a notice from a week out.`);
  }
} else if (cmd === "convert") {
  const args = process.argv.slice(3);
  const days = Number(args[args.indexOf("--days") + 1]) || 14;
  const write = args.includes("--yes");
  const beta = await get("beta");
  if (beta.free === true) {
    console.error("The free beta is still on, so converted teams would just read as free again.\nRun `beta.mjs free off` first — that stops NEW free teams without touching anyone already here.");
    process.exit(1);
  }
  const r = await rest("orgs?beta=eq.true&billing_status=eq.comped&stripe_subscription_id=is.null&select=id,name");
  const teams = await r.json();
  if (!teams.length) { console.log("No beta teams left to convert."); process.exit(0); }
  const trialEnds = new Date(Date.now() + days * 86400000).toISOString();
  console.log(`\n  ${teams.length} team${teams.length === 1 ? "" : "s"} → a ${days}-day trial ending ${trialEnds.slice(0, 10)}:`);
  for (const t of teams) console.log(`    ${t.name}`);
  if (!write) { console.log("\n  Nothing written. Add --yes to do it.\n"); process.exit(0); }
  for (const t of teams) {
    // overage_limit_cents back to null: 0 was the beta's leash, not a choice
    // this team made, and a trialing team on 0 would pause at the allowance.
    const u = await rest(`orgs?id=eq.${t.id}`, {
      method: "PATCH",
      body: JSON.stringify({ billing_status: "trialing", trial_ends_at: trialEnds, overage_limit_cents: null }),
    });
    if (!u.ok) { console.error(`  ${t.name}: ${await u.text()}`); process.exit(1); }
    console.log(`  converted  ${t.name}`);
  }
  console.log(`\n  Done. They keep orgs.beta = true, so you can always tell who came from the beta.\n  The ordinary wall and Checkout take it from here.\n`);
} else {
  console.error("usage: beta.mjs [show] | free on|off | cap teams|members <n|none> | signups open|invite |\n       limit <name> <n> | ends <date|none> | convert [--days 14] [--yes]");
  process.exit(1);
}
