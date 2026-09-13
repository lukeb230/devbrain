#!/usr/bin/env node
// PreToolUse guard: before Claude edits ANY file, ask DevBrain whether a
// teammate (human or agent) is actively on it. Fail-open (never blocks work
// when DevBrain is unreachable); when someone IS on the file, escalate to the
// human with "ask" so the edit is a conscious choice, not an accident.

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { devbrainHome, loadConfig } from "./home.mjs";
import { cursorAckState, detectHost, editedFile, emitGuard, isEditTool, readInput, sessionKey, workdir } from "./host.mjs";

// This hook runs on EVERY Edit/Write. The repo's root and remote don't change
// between edits, so resolve them once per working directory and keep the
// answer for a day — two subprocesses saved per edit. Invalidated if the
// cached root no longer contains the cwd (a different checkout at the same
// path) or no longer exists.
function repoInfo(cwd) {
  const cacheFile = join(devbrainHome(), "gitcache.json");
  let cache = {};
  try { cache = JSON.parse(readFileSync(cacheFile, "utf8")); } catch { /* none */ }
  const hit = cache[cwd];
  if (hit && Date.now() - hit.at < 86_400_000 && hit.root && cwd.startsWith(hit.root) && existsSync(join(hit.root, ".git"))) {
    return { repo: hit.repo, root: hit.root };
  }
  let repo = null, root = null;
  try {
    const url = execSync("git remote get-url origin", { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
    const m = url.match(/github\.com[:/](.+?)(\.git)?$/);
    repo = m ? m[1] : null;
    root = execSync("git rev-parse --show-toplevel", { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim() || null;
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
  const input = readInput();
  const host = detectHost(process.argv, process.env, input);
  const filePath = editedFile(input);
  if (!filePath || !isEditTool(input)) process.exit(0);

  // Config file first; DEVBRAIN_URL/DEVBRAIN_TOKEN env vars as the headless
  // fallback (Cowork, CI). No config at all → exit silently (guard is a no-op).
  const cfg = loadConfig();
  if (!cfg) process.exit(0);
  const { repo, root } = repoInfo(workdir(input));
  let rel = filePath;
  if (root && filePath.startsWith(root)) rel = filePath.slice(root.length + 1);
  if (!repo) process.exit(0);

  // Own session id — so your own activity never flags you.
  let ownSession = "";
  try {
    ownSession = readFileSync(join(devbrainHome(), "session-" + repo.replace("/", "_")), "utf8").trim();
  } catch { /* none */ }

  // The comparison runs server-side (src/lib/guard.ts) so the warning is
  // RECORDED in the same round trip — one request, same 3 s fail-open budget,
  // smaller payload than the old context fetch. Someone else = another label:
  // your own other windows/hosts share your label and are not teammates.
  //
  // Cursor emulates "ask" with a sticky denial (see emitGuard). When that
  // state says the next attempt will be allowed silently, the person has
  // already seen and answered this warning — tell the server not to record
  // a second row for it.
  const convo = sessionKey(input);
  const record = host !== "cursor" || !cursorAckState(repo, rel, convo).allowSilently;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  const res = await fetch(`${cfg.server}/api/v1/guard`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
    body: JSON.stringify({ repo, rel, session_id: ownSession, host, record }),
    signal: ctrl.signal,
  });
  clearTimeout(timer);
  if (!res.ok) process.exit(0);
  const out = await res.json();
  if (!out || !out.warn) process.exit(0);

  emitGuard(host, { repo, rel, convo, reason: String(out.reason || `DevBrain: ${rel} is being worked on right now by a teammate. Coordinate first, or approve to proceed deliberately.`) });
} catch {
  process.exit(0); // fail-open, always
}
