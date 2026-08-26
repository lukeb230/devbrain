#!/usr/bin/env node
// ============================================================================
// Presence hook — session start / end / file activity, owned by the PLUGIN.
//
// Before 0.5.0 these three hooks were written into ~/.claude/settings.json by
// `devbrain init`, pointing at a CLI file inside a clone of devbrain-test.
// That made the clone a permanent runtime dependency (move it → presence dies
// silently) and froze the hooks at whatever init wrote. Owned by the plugin,
// they travel with every plugin update and need no second repo at all.
//
// Usage (from hooks.json): node presence.mjs <session_start|session_end|activity>
//   session_end also captures a SESSION JOURNAL: a redacted excerpt of the
//   transcript (see journal-extract.mjs for exactly what is kept) is written
//   to a temp file and a DETACHED child (`presence.mjs journal-send <file>`)
//   posts it to /api/v1/journal — so the 8s hook budget is never at risk.
//   The server 204s unless the repo's "journals" policy is on.
//
// Auth: ~/.devbrain/config.json, else DEVBRAIN_URL + DEVBRAIN_TOKEN env vars.
// Fail-open everywhere: any error exits 0 and never blocks the session.
// ============================================================================

import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExcerpt } from "./journal-extract.mjs";

const CONFIG_DIR = join(homedir(), ".devbrain");
const kind = process.argv[2] || "activity";

function config() {
  try {
    return JSON.parse(readFileSync(join(CONFIG_DIR, "config.json"), "utf8"));
  } catch { /* try env */ }
  const server = (process.env.DEVBRAIN_URL || "").trim().replace(/\/$/, "");
  const token = (process.env.DEVBRAIN_TOKEN || "").trim();
  return server && token ? { server, token } : null;
}

function git(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

// One-time migration: drop legacy CLI-installed devbrain hooks from the user's
// settings so presence doesn't double-fire now that the plugin owns it.
// v6: re-run once more — CLI 0.5.1's updater briefly re-installed them.
function pruneLegacyHooks() {
  const marker = join(CONFIG_DIR, "hooks-migrated-v6");
  if (existsSync(marker)) return;
  const settingsPath = join(homedir(), ".claude", "settings.json");
  try {
    if (existsSync(settingsPath)) {
      const raw = readFileSync(settingsPath, "utf8");
      const settings = JSON.parse(raw);
      let changed = false;
      for (const event of Object.keys(settings.hooks ?? {})) {
        const before = settings.hooks[event];
        if (!Array.isArray(before)) continue;
        // Legacy entries reference the CLI path; plugin hooks live under
        // CLAUDE_PLUGIN_ROOT and are never touched here.
        const after = before.filter(
          (h) => !/devbrain\.mjs|devbrain[\\/]+bin/i.test(JSON.stringify(h)),
        );
        if (after.length !== before.length) {
          changed = true;
          if (after.length === 0) delete settings.hooks[event];
          else settings.hooks[event] = after;
        }
      }
      if (changed) writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    }
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(marker, new Date().toISOString());
  } catch {
    /* never block a session over housekeeping */
  }
}

function pluginVersion() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    return JSON.parse(readFileSync(join(here, "..", ".claude-plugin", "plugin.json"), "utf8")).version ?? null;
  } catch { return null; }
}

// Build the journal excerpt locally (fast: file read + string work) and hand
// the slow network call to a detached child so this hook exits immediately.
function queueJournal({ cfg, repo, session_id, hookInput }) {
  try {
    const transcript = hookInput?.transcript_path;
    if (!transcript || !existsSync(transcript)) return;
    const excerpt = buildExcerpt(readFileSync(transcript, "utf8"));
    if (excerpt.length < 200) return; // nothing worth journaling
    const taskFile = join(CONFIG_DIR, "task-" + repo.replace("/", "_"));
    const task_id = existsSync(taskFile) ? readFileSync(taskFile, "utf8").trim() || null : null;
    const dirty = Boolean(git("git status --porcelain"));
    const payload = {
      repo,
      session_id: session_id || null,
      branch: git("git rev-parse --abbrev-ref HEAD"),
      task_id,
      dirty,
      excerpt,
      plugin_version: pluginVersion(),
    };
    const file = join(tmpdir(), `devbrain-journal-${process.pid}-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify({ server: cfg.server, token: cfg.token, payload }));
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "journal-send", file], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch { /* fail-open */ }
}

async function journalSend(file) {
  try {
    const { server, token, payload } = JSON.parse(readFileSync(file, "utf8"));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    await fetch(`${server}/api/v1/journal`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    }).catch(() => {});
    clearTimeout(timer);
  } catch { /* fail-open */ }
  try { unlinkSync(file); } catch { /* already gone */ }
}

async function main() {
  if (kind === "journal-send") {
    await journalSend(process.argv[3]);
    process.exit(0);
  }
  pruneLegacyHooks();

  const cfg = config();
  if (!cfg) process.exit(0); // not set up yet — silent no-op

  const remote = git("git remote get-url origin");
  const m = remote ? remote.match(/github\.com[:/](.+?)(\.git)?$/) : null;
  const repo = m ? m[1] : null;
  if (!repo) process.exit(0); // not a GitHub repo — nothing to report

  let hookInput = {};
  try {
    const stdin = readFileSync(0, "utf8");
    if (stdin.trim()) hookInput = JSON.parse(stdin);
  } catch { /* no stdin */ }

  const sessionFile = join(CONFIG_DIR, "session-" + repo.replace("/", "_"));
  const post = async (body) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      const res = await fetch(`${cfg.server}/api/v1/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      return await res.json().catch(() => ({}));
    } catch {
      return {};
    } finally {
      clearTimeout(timer);
    }
  };

  if (kind === "session_start") {
    const out = await post({
      kind: "session_start",
      repo,
      branch: git("git rev-parse --abbrev-ref HEAD"),
      agent: "claude-code",
    });
    if (out?.session_id) {
      try {
        mkdirSync(CONFIG_DIR, { recursive: true });
        writeFileSync(sessionFile, out.session_id);
      } catch { /* non-fatal */ }
    }
    // Emit team context so the session starts informed (SessionStart hook
    // stdout is injected into the conversation by Claude Code).
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(
        `${cfg.server}/api/v1/context?repo=${encodeURIComponent(repo)}`,
        { headers: { Authorization: `Bearer ${cfg.token}` }, signal: ctrl.signal },
      );
      clearTimeout(timer);
      const ctx = await res.json();
      console.log("## Team context (DevBrain)");
      console.log(JSON.stringify(ctx, null, 2));
    } catch { /* best effort */ }
    process.exit(0);
  }

  const session_id = existsSync(sessionFile)
    ? readFileSync(sessionFile, "utf8").trim()
    : undefined;

  if (kind === "session_end") {
    if (session_id) await post({ kind: "session_end", repo, session_id });
    queueJournal({ cfg, repo, session_id, hookInput });
    process.exit(0);
  }

  // activity — repo-relative path only; never leak the machine's layout.
  let file = hookInput?.tool_input?.file_path;
  if (file) {
    const root = git("git rev-parse --show-toplevel");
    if (root && file.startsWith(root)) file = file.slice(root.length + 1);
    await post({
      kind: "activity",
      repo,
      branch: git("git rev-parse --abbrev-ref HEAD"),
      file,
      tool: String(hookInput?.tool_name || "edit").toLowerCase(),
      session_id,
    });
  }
  process.exit(0);
}

main().catch(() => process.exit(0));
