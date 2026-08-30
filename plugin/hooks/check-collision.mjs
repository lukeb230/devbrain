#!/usr/bin/env node
// PreToolUse guard: before Claude edits ANY file, ask DevBrain whether a
// teammate (human or agent) is actively on it. Fail-open (never blocks work
// when DevBrain is unreachable); when someone IS on the file, escalate to the
// human with "ask" so the edit is a conscious choice, not an accident.

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { devbrainHome, loadConfig } from "./home.mjs";

function out(obj) { process.stdout.write(JSON.stringify(obj)); }

// This hook runs on EVERY Edit/Write. The repo's root and remote don't change
// between edits, so resolve them once per working directory and keep the
// answer for a day — two subprocesses saved per edit. Invalidated if the
// cached root no longer contains the cwd (a different checkout at the same
// path) or no longer exists.
function repoInfo() {
  const cwd = process.cwd();
  const cacheFile = join(devbrainHome(), "gitcache.json");
  let cache = {};
  try { cache = JSON.parse(readFileSync(cacheFile, "utf8")); } catch { /* none */ }
  const hit = cache[cwd];
  if (hit && Date.now() - hit.at < 86_400_000 && hit.root && cwd.startsWith(hit.root) && existsSync(join(hit.root, ".git"))) {
    return { repo: hit.repo, root: hit.root };
  }
  let repo = null, root = null;
  try {
    const url = execSync("git remote get-url origin", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
    const m = url.match(/github\.com[:/](.+?)(\.git)?$/);
    repo = m ? m[1] : null;
    root = execSync("git rev-parse --show-toplevel", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim() || null;
  } catch { /* not a repo */ }
  if (repo && root) {
    try {
      const entries = Object.entries(cache).filter(([, v]) => Date.now() - v.at < 86_400_000).slice(-50);
      writeFileSync(cacheFile, JSON.stringify(Object.fromEntries([...entries, [cwd, { repo, root, at: Date.now() }]])));
    } catch { /* cache is optional */ }
  }
  return { repo, root };
}

try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const filePath = input?.tool_input?.file_path;
  if (!filePath) process.exit(0);

  // Config file first; DEVBRAIN_URL/DEVBRAIN_TOKEN env vars as the headless
  // fallback (Cowork, CI). No config at all → exit silently (guard is a no-op).
  const cfg = loadConfig();
  if (!cfg) process.exit(0);
  const { repo, root } = repoInfo();
  let rel = filePath;
  if (root && filePath.startsWith(root)) rel = filePath.slice(root.length + 1);
  if (!repo) process.exit(0);

  // Own session id — so your own activity never flags you.
  let ownSession = "";
  try {
    ownSession = readFileSync(join(devbrainHome(), "session-" + repo.replace("/", "_")), "utf8").trim();
  } catch { /* none */ }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  const res = await fetch(`${cfg.server}/api/v1/context?repo=${encodeURIComponent(repo)}`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
    signal: ctrl.signal,
  });
  clearTimeout(timer);
  if (!res.ok) process.exit(0);
  const ctx = await res.json();

  const others = (ctx.active_sessions || []).filter(
    (s) => String(s.id || "") !== ownSession && (s.files || []).includes(rel),
  );
  const claimed = (ctx.claims || []).filter(
    (c) =>
      c.dev_label !== ctx.you &&
      (c.paths || []).some((p) => rel === p || rel.startsWith(String(p).replace(/\*+$/, ""))),
  );

  if (others.length === 0 && claimed.length === 0) process.exit(0);

  const who = [
    ...others.map((s) => `${s.dev} (active session${s.branch ? ` on ${s.branch}` : ""})`),
    ...claimed.map((c) => `${c.dev_label} (claimed${c.note ? `: ${c.note}` : ""})`),
  ].join(", ");

  out({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: `DevBrain: ${rel} is being worked on right now by ${who}. Editing it anyway risks a collision — coordinate first, or approve to proceed deliberately.`,
    },
  });
} catch {
  process.exit(0); // fail-open, always
}
