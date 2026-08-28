#!/usr/bin/env node
// ============================================================================
// DevBrain Reminders collector — reads a shared Apple Reminders list on this
// Mac and posts it to DevBrain, where each reminder becomes a task.
//
//   node collect.mjs "<List Name>" "<owner/repo>"
//   e.g. node collect.mjs "Team Inbox" "acme/app"
//
// Auth comes from ~/.devbrain/config.json (written by `devbrain init`).
// Runs fine from launchd every few minutes; the server is idempotent, so
// re-posting the same list — even from two Macs — never duplicates a task.
//
// Conventions typed into a reminder's title:
//   @ethan  → assigns the task        #export → tags it
//   Priority Low/Medium/High in Reminders → P3/P2/P1 in DevBrain.
//
// First run: macOS will ask to allow access to Reminders — click Allow.
// ============================================================================

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const [listName, repo] = process.argv.slice(2);
if (!listName || !repo) {
  console.error('usage: node collect.mjs "<List Name>" "<owner/repo>"');
  process.exit(1);
}

let cfg;
try {
  cfg = JSON.parse(readFileSync(join(homedir(), ".devbrain", "config.json"), "utf8"));
} catch {
  console.error("No ~/.devbrain/config.json — run `devbrain init` first.");
  process.exit(1);
}

// JXA (osascript -l JavaScript) reads the list and emits JSON. Properties
// are fetched in bulk (one Apple Event per property for the whole list)
// rather than per reminder — per-item reads cost ~30s each on Reminders,
// so a 45-item list would take ~25 minutes; bulk takes a few seconds.
const jxa = `
  const rs = Application("Reminders").lists.byName(${JSON.stringify(listName)}).reminders;
  const ids = rs.id(), names = rs.name(), bodies = rs.body(),
        pris = rs.priority(), dones = rs.completed(), dues = rs.dueDate();
  JSON.stringify(ids.map((id, i) => ({
    id, title: names[i], notes: bodies[i] || "", priority: pris[i],
    completed: dones[i], due: dues[i] ? dues[i].toISOString() : null,
  })));
`;

let items;
try {
  items = JSON.parse(execFileSync("osascript", ["-l", "JavaScript", "-e", jxa], {
    encoding: "utf8",
    timeout: 60_000,
  }).trim());
} catch (err) {
  console.error("Could not read Reminders list " + JSON.stringify(listName) + ":", String(err.message || err).slice(0, 200));
  console.error("Check the list name, and System Settings → Privacy & Security → Reminders.");
  process.exit(1);
}

const res = await fetch(`${cfg.server.replace(/\/$/, "")}/api/v1/reminders`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
  body: JSON.stringify({ repo, items }),
});
const out = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error("DevBrain rejected the sync:", res.status, JSON.stringify(out));
  process.exit(1);
}
console.log(
  `[${new Date().toISOString()}] ${listName} → ${repo}: ` +
  `${items.length} reminders, ${out.created ?? 0} created, ${out.updated ?? 0} updated, ${out.completed ?? 0} completed`,
);
