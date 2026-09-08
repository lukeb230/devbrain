// ============================================================================
// Host layer — one place that knows how each agent host talks to hooks, so
// presence.mjs, check-collision.mjs and live-context.mjs stay host-agnostic.
//
//   Claude Code  hooks.json in the plugin · stdin {session_id, tool_name,
//                tool_input:{file_path}, transcript_path, cwd} · SessionStart
//                stdout is injected · PreToolUse answers hookSpecificOutput
//   Cursor       ~/.cursor/hooks.json · stdin {conversation_id, hook_event_name,
//                workspace_roots, cwd, tool_name, tool_input, file_path,
//                transcript_path} · user hooks run FROM ~/.cursor, so the repo
//                comes from cwd / workspace_roots, never process.cwd() ·
//                sessionStart answers {additional_context} · preToolUse only
//                enforces "deny" ("ask" is documented as not enforced)
//   Codex CLI    ~/.codex/hooks.json (Claude-shaped events, behind
//                features.hooks) · adapters pass --host=codex explicitly
//
// The host is taken from --host=<name> (adapters always pass it), else the
// DEVBRAIN_HOST env var (set on the MCP server by the adapters), else
// inferred from the payload: Cursor payloads carry cursor_version.
// ============================================================================

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { devbrainHome } from "./home.mjs";

export const HOSTS = ["claude-code", "cursor", "codex", "other"];

/** Which host fired this hook. */
export function detectHost(argv = process.argv, env = process.env, input = {}) {
  const flag = argv.find((a) => a.startsWith("--host="));
  if (flag) return normalizeHost(flag.slice(7));
  if (env.DEVBRAIN_HOST) return normalizeHost(env.DEVBRAIN_HOST);
  if (input && typeof input === "object" && ("cursor_version" in input || "workspace_roots" in input)) return "cursor";
  return "claude-code";
}
export function normalizeHost(s) {
  const v = String(s || "").toLowerCase().trim();
  if (v === "claude" || v === "claude-code" || v === "claudecode") return "claude-code";
  if (v === "cursor") return "cursor";
  if (v === "codex" || v === "codex-cli") return "codex";
  return v ? "other" : "claude-code";
}
/** Short label the panel and Console show next to a session. */
export function hostLabel(host) {
  return { "claude-code": "Claude", cursor: "Cursor", codex: "Codex" }[host] ?? "agent";
}

/** Read the hook's stdin JSON (empty object when there is none). */
export function readInput() {
  try {
    const raw = readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** The directory the agent is working in — never process.cwd() for user-level
 *  hooks (Cursor runs those from ~/.cursor). */
export function workdir(input) {
  const c = input?.cwd;
  if (typeof c === "string" && c && existsSync(c)) return c;
  const roots = input?.workspace_roots;
  if (Array.isArray(roots) && typeof roots[0] === "string" && existsSync(roots[0])) return roots[0];
  return process.cwd();
}

/** Run git in the agent's working directory; null on any failure. */
export function git(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

/** owner/name from the origin remote, or null when this isn't a GitHub repo. */
export function repoFromRemote(remote) {
  const m = remote ? String(remote).match(/github\.com[:/](.+?)(\.git)?$/) : null;
  return m ? m[1] : null;
}

/** The file an edit tool is about to touch / just touched, across payload shapes. */
export function editedFile(input) {
  const ti = input?.tool_input;
  const cand = ti?.file_path ?? ti?.path ?? ti?.filePath ?? input?.file_path ?? input?.path ?? null;
  return typeof cand === "string" && cand ? cand : null;
}

/** Is this tool call going to change a file? Claude's hooks.json matcher
 *  already limits PreToolUse to Edit|Write|MultiEdit; Cursor and Codex hooks
 *  have no matcher, so the guard must not fire (and pay a network round
 *  trip) for Read, Grep, Shell… A missing tool_name counts as an edit. */
export function isEditTool(input) {
  const name = input?.tool_name;
  if (typeof name !== "string" || !name) return true;
  return /edit|write|patch|replace|delete|create|apply|notebook/i.test(name);
}

/** Repo-relative path; never leak the machine's layout. */
export function relative(file, root) {
  if (root && file.startsWith(root)) return file.slice(root.length + 1);
  return file;
}

/** The host's own id for this conversation (for per-session caches). */
export function sessionKey(input) {
  return String(input?.session_id || input?.conversation_id || "unknown");
}

/** Print team context so the host injects it at session start. */
export function emitContext(host, text) {
  if (host === "cursor") process.stdout.write(JSON.stringify({ additional_context: text }));
  else process.stdout.write(text + "\n");
}

/** Answer a before-edit guard: Claude/Codex get "ask"; Cursor only enforces
 *  "deny", so the first attempt on a contested file is denied with the reason
 *  and a retry within ten minutes is allowed — the same "deliberate second
 *  step" as Claude's ask, expressed in what Cursor can do. */
export function emitGuard(host, { repo, rel, reason }) {
  if (host !== "cursor") {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: reason },
    }));
    return;
  }
  const dir = join(devbrainHome(), "collision-acks");
  const key = join(dir, `${repo.replace("/", "_")}--${Buffer.from(rel).toString("base64url").slice(0, 80)}`);
  try {
    if (existsSync(key) && Date.now() - Number(readFileSync(key, "utf8")) < 10 * 60_000) return; // deliberate retry → allow silently
    mkdirSync(dir, { recursive: true });
    writeFileSync(key, String(Date.now()));
  } catch { /* fall through to deny */ }
  process.stdout.write(JSON.stringify({
    permission: "deny",
    user_message: reason,
    agent_message: `${reason} If the user confirms, edit the file again — the second attempt within ten minutes goes through.`,
  }));
}
