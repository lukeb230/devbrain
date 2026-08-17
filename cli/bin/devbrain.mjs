#!/usr/bin/env node
// ============================================================================
// devbrain CLI — Phase 0 stub (fully wired in Phase 2)
//
//   devbrain init   — store server URL + dev token, install Claude Code hooks
//   devbrain send   — internal: post one event (used by the installed hooks)
//   devbrain ctx    — print the context digest for the current repo
//
// Design: zero dependencies, single file, Node 18+.
// ============================================================================

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

const CONFIG_DIR = join(homedir(), ".devbrain");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
const CLAUDE_SETTINGS = join(homedir(), ".claude", "settings.json");

const cmd = process.argv[2];

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    console.error("Not configured. Run: devbrain init");
    process.exit(1);
  }
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
}

function currentRepo() {
  try {
    const url = execSync("git remote get-url origin", {
      encoding: "utf8",
    }).trim();
    const m = url.match(/github\.com[:/](.+?)(\.git)?$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function currentBranch() {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

async function post(config, path, body) {
  const res = await fetch(`${config.server}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({}));
}

// ----------------------------------------------------------------------------

if (cmd === "init") {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const server =
    (await rl.question("DevBrain server URL (e.g. https://devbrain.vercel.app): ")).trim();
  const token = (await rl.question("Your dev token (from Settings → Tokens): ")).trim();
  rl.close();

  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify({ server, token }, null, 2));
  console.log(`✓ Saved ${CONFIG_PATH}`);

  // Install Claude Code hooks (merge into existing settings).
  const hookCmd = (kind) =>
    `node ${process.argv[1]} send ${kind}`;
  let settings = {};
  if (existsSync(CLAUDE_SETTINGS)) {
    try {
      settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, "utf8"));
    } catch {
      console.warn("! Could not parse ~/.claude/settings.json — skipping hook install.");
      process.exit(0);
    }
  }
  settings.hooks = settings.hooks || {};
  const ensure = (event, matcher, command) => {
    settings.hooks[event] = settings.hooks[event] || [];
    const exists = settings.hooks[event].some((h) =>
      JSON.stringify(h).includes("devbrain"),
    );
    if (!exists) {
      settings.hooks[event].push({
        ...(matcher ? { matcher } : {}),
        hooks: [{ type: "command", command }],
      });
    }
  };
  ensure("PostToolUse", "Edit|Write|MultiEdit", hookCmd("activity"));
  ensure("SessionStart", undefined, hookCmd("session_start"));
  // SessionEnd fires when the session actually closes. (NOT "Stop", which
  // fires after every response — that bug marked sessions dead mid-work.)
  ensure("SessionEnd", undefined, hookCmd("session_end"));
  // Migrate any old devbrain hook off the Stop event.
  if (Array.isArray(settings.hooks.Stop)) {
    settings.hooks.Stop = settings.hooks.Stop.filter(
      (h) => !JSON.stringify(h).includes("devbrain"),
    );
    if (settings.hooks.Stop.length === 0) delete settings.hooks.Stop;
  }

  mkdirSync(join(homedir(), ".claude"), { recursive: true });
  writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2));
  console.log("✓ Claude Code hooks installed (PostToolUse / SessionStart / Stop).");
  console.log("  Presence starts flowing on your next Claude Code session in a linked repo.");
  process.exit(0);
}

if (cmd === "send") {
  const kind = process.argv[3] || "activity";
  const config = loadConfig();
  const repo = currentRepo();
  if (!repo) process.exit(0); // not a git repo with a GitHub remote — silently no-op

  // Claude Code passes hook context via stdin JSON; file path lives at
  // .tool_input.file_path for Edit/Write/MultiEdit.
  let hookInput = {};
  try {
    const stdin = readFileSync(0, "utf8");
    if (stdin.trim()) hookInput = JSON.parse(stdin);
  } catch {
    /* no stdin — fine */
  }

  // Repo-relative path: never leak the machine's folder layout.
  let file = hookInput?.tool_input?.file_path;
  if (file) {
    try {
      const root = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
      if (root && file.startsWith(root)) file = file.slice(root.length + 1);
    } catch { /* keep as-is */ }
  }
  const sessionFile = join(CONFIG_DIR, "session-" + repo.replace("/", "_"));

  if (kind === "session_start") {
    const out = await post(config, "/api/v1/ingest", {
      kind,
      repo,
      branch: currentBranch(),
      agent: "claude-code",
    });
    if (out?.session_id) writeFileSync(sessionFile, out.session_id);
    // Fetch + emit context so Claude starts informed (printed to stdout —
    // Claude Code injects SessionStart hook stdout into the session).
    try {
      const res = await fetch(
        `${config.server}/api/v1/context?repo=${encodeURIComponent(repo)}`,
        { headers: { Authorization: `Bearer ${config.token}` } },
      );
      const ctx = await res.json();
      console.log("## Team context (DevBrain)");
      console.log(JSON.stringify(ctx, null, 2));
    } catch {
      /* context is best-effort */
    }
    process.exit(0);
  }

  const session_id = existsSync(sessionFile)
    ? readFileSync(sessionFile, "utf8").trim()
    : undefined;

  if (kind === "session_end") {
    if (session_id)
      await post(config, "/api/v1/ingest", { kind, repo, session_id });
    process.exit(0);
  }

  if (file) {
    await post(config, "/api/v1/ingest", {
      kind: "activity",
      repo,
      branch: currentBranch(),
      file,
      tool: (hookInput?.tool_name || "edit").toLowerCase(),
      session_id,
    });
  }
  process.exit(0);
}

if (cmd === "ctx") {
  const config = loadConfig();
  const repo = currentRepo();
  if (!repo) {
    console.error("Not inside a git repo with a GitHub remote.");
    process.exit(1);
  }
  const res = await fetch(
    `${config.server}/api/v1/context?repo=${encodeURIComponent(repo)}`,
    { headers: { Authorization: `Bearer ${config.token}` } },
  );
  console.log(JSON.stringify(await res.json(), null, 2));
  process.exit(0);
}

console.log(`devbrain — team second brain CLI

Usage:
  devbrain init    Configure server + token, install Claude Code hooks
  devbrain ctx     Print the live context digest for the current repo
  devbrain send    (internal — invoked by hooks)
`);
