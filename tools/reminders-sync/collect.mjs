#!/usr/bin/env node
// ============================================================================
// DevBrain Reminders collector — reads Apple Reminders on this Mac and posts
// lists to DevBrain, where each reminder becomes a task in the repo the TEAM
// mapped that list to (Settings → Reminders). The Mac never decides the repo.
//
//   node collect.mjs --auto            ← what the DevBrain app runs every 3 min:
//                                        asks the server which lists are mapped,
//                                        syncs each, and reports every list it
//                                        can see so unmapped ones can be picked
//   node collect.mjs "<List Name>"     ← sync one list by name (manual/test)
//
// Auth comes from the channel's config.json (DEVBRAIN_HOME, else ~/.devbrain).
// The server is idempotent, so two Macs syncing the same list never duplicate.
//
// Conventions typed into a reminder's title:  @ethan → assigns · #export → tag
// Priority Low/Medium/High in Reminders → P3/P2/P1 in DevBrain.
// ============================================================================

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME_DIR = process.env.DEVBRAIN_HOME || join(homedir(), ".devbrain");
const args = process.argv.slice(2);
const AUTO = args.includes("--auto");
const listArg = args.find((a) => !a.startsWith("--"));
if (!AUTO && !listArg) {
  console.error('usage: node collect.mjs --auto   |   node collect.mjs "<List Name>"');
  process.exit(1);
}

let cfg;
try {
  cfg = JSON.parse(readFileSync(join(HOME_DIR, "config.json"), "utf8"));
} catch {
  console.error(`No ${join(HOME_DIR, "config.json")} — set up DevBrain first.`);
  process.exit(1);
}
const server = String(cfg.server || "").replace(/\/$/, "");
const headers = { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` };
const stamp = () => `[${new Date().toISOString()}]`;

// JXA reads are done in bulk (one Apple Event per property for a whole list);
// per-item reads cost ~30s each on Reminders.
function jxa(script) {
  return JSON.parse(execFileSync("osascript", ["-l", "JavaScript", "-e", script], { encoding: "utf8", timeout: 90_000 }).trim());
}
function listNames() {
  return jxa(`JSON.stringify(Application("Reminders").lists.name())`);
}
function readList(name) {
  return jxa(`
    const rs = Application("Reminders").lists.byName(${JSON.stringify(name)}).reminders;
    const ids = rs.id(), names = rs.name(), bodies = rs.body(),
          pris = rs.priority(), dones = rs.completed(), dues = rs.dueDate();
    JSON.stringify(ids.map((id, i) => ({
      id, title: names[i], notes: bodies[i] || "", priority: pris[i],
      completed: dones[i], due: dues[i] ? dues[i].toISOString() : null,
    })));
  `);
}

async function post(path, body) {
  const res = await fetch(`${server}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, out };
}

async function syncList(name) {
  let items;
  try {
    items = readList(name);
  } catch (err) {
    console.error(`${stamp()} ${name}: could not read list — ${String(err.message || err).slice(0, 160)} (check the name and System Settings → Privacy & Security → Reminders)`);
    return false;
  }
  const { ok, status, out } = await post("/api/v1/reminders", { list: name, items });
  if (!ok) { console.error(`${stamp()} ${name}: DevBrain rejected the sync: ${status} ${JSON.stringify(out)}`); return false; }
  if (out.skipped) { console.log(`${stamp()} ${name}: skipped — ${out.reason}`); return true; }
  console.log(`${stamp()} ${name}: ${items.length} reminders, ${out.created ?? 0} created, ${out.updated ?? 0} updated, ${out.completed ?? 0} completed`);
  return true;
}

if (AUTO) {
  const res = await fetch(`${server}/api/v1/reminders/sources`, { headers });
  const { sources = [] } = await res.json().catch(() => ({}));
  if (!res.ok) { console.error(`${stamp()} could not fetch reminder sources (${res.status})`); process.exit(1); }
  let seen = [];
  try { seen = listNames(); } catch (err) {
    console.error(`${stamp()} could not list Reminders — ${String(err.message || err).slice(0, 160)}`);
    process.exit(1);
  }
  await post("/api/v1/reminders/lists", { lists: seen.map((name) => ({ name })) }).catch(() => {});
  const wanted = sources.map((s) => s.list).filter((l) => seen.some((n) => n.toLowerCase() === l.toLowerCase()));
  if (wanted.length === 0) {
    console.log(`${stamp()} no mapped lists on this Mac (${seen.length} visible, ${sources.length} mapped) — map lists on Settings → Reminders`);
    process.exit(0);
  }
  let ok = true;
  for (const name of wanted) ok = (await syncList(seen.find((n) => n.toLowerCase() === name.toLowerCase()))) && ok;
  process.exit(ok ? 0 : 1);
} else {
  process.exit((await syncList(listArg)) ? 0 : 1);
}
