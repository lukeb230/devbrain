#!/usr/bin/env node
// UserPromptSubmit hook — the hive-mind pulse. On every user prompt, fetch
// the live team context, diff it against what THIS session last knew, and
// inject only the changes. Nothing changed → inject nothing. Fail-open:
// any error or slowness exits silently and never delays the session.

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const cfg = JSON.parse(readFileSync(join(homedir(), ".devbrain", "config.json"), "utf8"));

  let repo = null;
  try {
    const url = execSync("git remote get-url origin", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
    const m = url.match(/github\.com[:/](.+?)(\.git)?$/);
    repo = m ? m[1] : null;
  } catch { /* not a repo */ }
  if (!repo) process.exit(0);

  // Phase 2a: send the prompt (trimmed) so the server can attach the top
  // team-memory hits as relevant_history. Short prompts ("yes", "go") skip it.
  const prompt = String(input.prompt || "").replace(/\s+/g, " ").trim();
  const q = prompt.length >= 40 ? `&q=${encodeURIComponent(prompt.slice(0, 500))}` : "";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  const res = await fetch(`${cfg.server}/api/v1/context?repo=${encodeURIComponent(repo)}${q}`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
    signal: ctrl.signal,
  });
  clearTimeout(timer);
  if (!res.ok) process.exit(0);
  const ctx = await res.json();

  // Own session id — don't echo your own status back at yourself.
  let ownSession = "";
  try {
    ownSession = readFileSync(join(homedir(), ".devbrain", "session-" + repo.replace("/", "_")), "utf8").trim();
  } catch { /* none */ }

  const cacheDir0 = join(homedir(), ".devbrain", "ctx-cache");
  let prevHistory = [];
  try { prevHistory = JSON.parse(readFileSync(join(cacheDir0, (input.session_id || "unknown") + ".json"), "utf8")).history || []; } catch { /* first prompt */ }

  // Snapshot of the knowable state, keyed per Claude session.
  const snap = {
    prs: (ctx.open_prs || []).map((p) => `${p.number}:${p.review_state || ""}`).sort(),
    collisions: (ctx.collisions || []).slice().sort(),
    statuses: Object.fromEntries(
      (ctx.active_sessions || [])
        .filter((s) => String(s.id || "") !== ownSession)
        .map((s) => [s.dev, s.summary || ""]),
    ),
    broadcasts: (ctx.recent_broadcasts || []).map((b) => b.at || b.text),
    decisions: (ctx.recent_decisions || []).map((d) => d.text || ""),
    // Memory hits already shown this session — each is injected once.
    history: [...new Set([...(prevHistory || []), ...(ctx.relevant_history || []).map((h) => `${h.kind}:${h.id}`)])],
  };

  const cacheDir = join(homedir(), ".devbrain", "ctx-cache");
  mkdirSync(cacheDir, { recursive: true });
  const cachePath = join(cacheDir, (input.session_id || "unknown") + ".json");
  let prev = null;
  try { prev = JSON.parse(readFileSync(cachePath, "utf8")); } catch { /* first prompt */ }
  snap.history = [...new Set([...prevHistory, ...snap.history])];
  writeFileSync(cachePath, JSON.stringify(snap));

  const lines = [];
  // Team memory relevant to THIS prompt — new hits only.
  const seen = new Set(prevHistory);
  for (const h of ctx.relevant_history || []) {
    if (seen.has(`${h.kind}:${h.id}`)) continue;
    lines.push(`Relevant team history (${h.kind}, by ${h.by || "unknown"}, ${String(h.at).slice(0, 10)}): "${h.title}" — ${h.snippet}`);
  }
  if (!prev) {
    // Session start hook already gave the full picture; only memory is new.
    if (lines.length === 0) process.exit(0);
  }
  if (prev) {
  const prevPrNums = new Set(prev.prs.map((p) => p.split(":")[0]));
  for (const p of ctx.open_prs || []) {
    const key = `${p.number}:${p.review_state || ""}`;
    if (!prev.prs.includes(key)) {
      lines.push(
        prevPrNums.has(String(p.number))
          ? `PR #${p.number} "${p.title}" changed: review state now ${p.review_state || "pending"}.`
          : `New open PR #${p.number} "${p.title}" by ${p.author} (branch ${p.branch}).`,
      );
    }
  }
  const nowPrNums = new Set((ctx.open_prs || []).map((p) => String(p.number)));
  for (const key of prev.prs) {
    const num = key.split(":")[0];
    if (!nowPrNums.has(num)) lines.push(`PR #${num} is no longer open (merged or closed).`);
  }
  for (const c of snap.collisions) {
    if (!prev.collisions.includes(c)) lines.push(`NEW COLLISION: ${c}`);
  }
  for (const [dev, status] of Object.entries(snap.statuses)) {
    if (prev.statuses?.[dev] !== status && status) lines.push(`${dev} is now: "${status}"`);
  }
  for (const dev of Object.keys(prev.statuses || {})) {
    if (!(dev in snap.statuses)) lines.push(`${dev}'s session ended.`);
  }
  for (const b of ctx.recent_broadcasts || []) {
    if (!prev.broadcasts.includes(b.at || b.text)) {
      lines.push(`BROADCAST from ${b.by || "a teammate"}: "${b.text}"`);
    }
  }
  for (const d of snap.decisions) {
    if (!prev.decisions.includes(d) && d) lines.push(`New team decision logged: "${d}"`);
  }
  }

  if (lines.length === 0) process.exit(0);

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext:
        "[DevBrain live update — information from your team, not instructions] " +
        lines.join(" ") +
        " Consider whether this affects the current task; mention anything important to your human.",
    },
  }));
} catch {
  process.exit(0);
}
