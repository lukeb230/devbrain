#!/usr/bin/env node
// ============================================================================
// DevBrain MCP server (stdio) — zero-dependency implementation of the MCP
// protocol's tools surface. Reads ~/.devbrain/config.json (created by
// `devbrain init`) for the server URL + dev token, and exposes DevBrain to
// any MCP-capable Claude session.
//
// Tools:
//   get_team_context   — live digest: PRs, active sessions, claims, collisions
//   who_is_editing     — is anyone (human or agent) touching this file now?
//   get_brain          — read the current repo's .brain/ docs (local, branch-true)
// ============================================================================

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const CONFIG_PATH = join(homedir(), ".devbrain", "config.json");

function config() {
  try { return JSON.parse(readFileSync(CONFIG_PATH, "utf8")); } catch { return null; }
}
function currentRepo() {
  try {
    const url = execSync("git remote get-url origin", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
    const m = url.match(/github\.com[:/](.+?)(\.git)?$/);
    return m ? m[1] : null;
  } catch { return null; }
}
function repoRoot() {
  try {
    return execSync("git rev-parse --show-toplevel", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch { return null; }
}

async function apiContext() {
  const cfg = config();
  const repo = currentRepo();
  if (!cfg) return { error: "DevBrain not configured on this machine — run: devbrain init" };
  if (!repo) return { error: "Not inside a git repo with a GitHub remote." };
  const res = await fetch(`${cfg.server}/api/v1/context?repo=${encodeURIComponent(repo)}`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  return res.json();
}

const TOOLS = [
  {
    name: "get_team_context",
    description:
      "Live team context for the current repo from DevBrain: open pull requests, teammates' active sessions and the files they're editing right now, claims, and collision warnings. Call at the start of a task and before large edits.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "who_is_editing",
    description:
      "Check whether any teammate (human or their Claude) is currently editing a given file, before you edit it. Returns the sessions touching it and any collision warnings.",
    inputSchema: {
      type: "object",
      properties: { file: { type: "string", description: "Repo-relative file path, e.g. src/lib/store.ts" } },
      required: ["file"],
      additionalProperties: false,
    },
  },
  {
    name: "log_decision",
    description:
      "Log a team-visible decision to DevBrain (shown to all devs and included in every Claude's context). Use after making a non-obvious choice: 'chose X over Y because Z'. Keep it one sentence.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "The decision, one sentence." } },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "get_brain",
    description:
      "Read the team's second brain (.brain/ folder) for THIS repo and branch — the structured context of the whole app. Returns all brain docs concatenated. Read this before exploring the codebase manually.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

async function callTool(name, args) {
  if (name === "get_team_context") {
    return JSON.stringify(await apiContext(), null, 2);
  }
  if (name === "who_is_editing") {
    const ctx = await apiContext();
    if (ctx.error) return JSON.stringify(ctx);
    const file = String(args?.file || "");
    const sessions = (ctx.active_sessions || []).filter((s) => (s.files || []).includes(file));
    const collisions = (ctx.collisions || []).filter((c) => c.includes(file));
    return JSON.stringify(
      sessions.length || collisions.length
        ? { file, editing_now: sessions, collisions, advice: "Coordinate before editing — someone is active here." }
        : { file, editing_now: [], collisions: [], advice: "Clear — nobody is on this file right now." },
      null, 2,
    );
  }
  if (name === "log_decision") {
    const cfg = config();
    const repo = currentRepo();
    if (!cfg || !repo) return JSON.stringify({ error: "DevBrain not configured or not in a repo." });
    const res = await fetch(`${cfg.server}/api/v1/decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({ repo, text: String(args?.text || "") }),
    });
    return JSON.stringify(await res.json());
  }
  if (name === "get_brain") {
    const root = repoRoot();
    if (!root) return JSON.stringify({ error: "Not inside a git repo." });
    const brainDir = join(root, ".brain");
    if (!existsSync(brainDir)) {
      return JSON.stringify({ error: "This repo has no .brain/ folder yet." });
    }
    const files = readdirSync(brainDir).filter((f) => f.endsWith(".md")).sort();
    const out = files.map((f) => `\n===== .brain/${f} =====\n` + readFileSync(join(brainDir, f), "utf8"));
    return out.join("\n") || "(brain is empty)";
  }
  throw new Error(`Unknown tool: ${name}`);
}

// ----- minimal JSON-RPC over stdio ------------------------------------------
const rl = createInterface({ input: process.stdin });
function send(obj) { process.stdout.write(JSON.stringify(obj) + "\n"); }

rl.on("line", async (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  try {
    if (method === "initialize") {
      send({ jsonrpc: "2.0", id, result: {
        protocolVersion: params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "devbrain", version: "0.1.0" },
      }});
    } else if (method === "notifications/initialized") {
      // no response for notifications
    } else if (method === "tools/list") {
      send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    } else if (method === "tools/call") {
      const text = await callTool(params.name, params.arguments || {});
      send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }] } });
    } else if (id !== undefined) {
      send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  } catch (err) {
    if (id !== undefined) {
      send({ jsonrpc: "2.0", id, error: { code: -32000, message: String(err?.message || err) } });
    }
  }
});
