// ============================================================================
// Host adapters — pure functions that produce the config each agent host
// needs to run DevBrain's hooks and MCP server. No filesystem access here
// (devbrain.mjs reads/writes the files) so every merge is unit-testable.
//
//   Claude Code   the plugin (marketplace install) — handled by updatePlugin
//   Cursor        ~/.cursor/mcp.json   mcpServers.<id>
//                 ~/.cursor/hooks.json {version:1, hooks:{event:[{command,timeout}]}}
//   Codex CLI     ~/.codex/config.toml [mcp_servers.<id>] + [features] hooks = true
//                 ~/.codex/hooks.json  Claude-shaped {hooks:{Event:[{hooks:[…]}]}}
//
// Every entry we write carries the hooks path of THIS install, so a re-run
// replaces only our own entries and leaves everything else in the file alone
// (Cursor users often already have hooks — e.g. the "impeccable" skill).
// ============================================================================

export const HOST_NAMES = ["cursor", "codex"];

/** Quote a path for a shell command string (hooks are run through a shell). */
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/** The hook commands for one host, as shell strings. `node` and `hooksDir`
 *  are absolute; hooksDir is `<home>/src/<pluginDir>/hooks`. */
export function hookCommands({ node, hooksDir, host }) {
  const run = (script, ...args) => [q(node), q(`${hooksDir}/${script}`), ...args, `--host=${host}`].join(" ");
  return {
    sessionStart: run("presence.mjs", "session_start"),
    sessionEnd: run("presence.mjs", "session_end"),
    activity: run("presence.mjs", "activity"),
    touch: run("presence.mjs", "touch"),
    guard: run("check-collision.mjs"),
    prompt: run("live-context.mjs"),
  };
}

/** True when a hook command string is one of ours for this install. */
export function isOurs(command, hooksDir) {
  return typeof command === "string" && command.includes(hooksDir);
}

// ---------------------------------------------------------------- Cursor ----

/** Merge our entries into an existing ~/.cursor/hooks.json object. */
export function mergeCursorHooks(existing, { node, hooksDir }) {
  const c = hookCommands({ node, hooksDir, host: "cursor" });
  const out = existing && typeof existing === "object" ? structuredClone(existing) : {};
  out.version = out.version ?? 1;
  out.hooks = out.hooks && typeof out.hooks === "object" ? out.hooks : {};
  const wanted = {
    sessionStart: [{ command: c.sessionStart, timeout: 12 }],
    sessionEnd: [{ command: c.sessionEnd, timeout: 8 }],
    afterFileEdit: [{ command: c.activity, timeout: 8 }],
    preToolUse: [{ command: c.guard, timeout: 10 }],
    beforeSubmitPrompt: [{ command: c.touch, timeout: 8 }],
    stop: [{ command: c.touch, timeout: 8 }],
  };
  for (const [event, mine] of Object.entries(wanted)) {
    const kept = (Array.isArray(out.hooks[event]) ? out.hooks[event] : []).filter((h) => !isOurs(h?.command, hooksDir));
    out.hooks[event] = [...kept, ...mine];
  }
  return out;
}

/** Remove our entries from ~/.cursor/hooks.json (keeps everything else). */
export function stripCursorHooks(existing, hooksDir) {
  if (!existing || typeof existing !== "object" || !existing.hooks) return existing;
  const out = structuredClone(existing);
  for (const [event, list] of Object.entries(out.hooks)) {
    if (!Array.isArray(list)) continue;
    const kept = list.filter((h) => !isOurs(h?.command, hooksDir));
    if (kept.length) out.hooks[event] = kept; else delete out.hooks[event];
  }
  return out;
}

/** Merge our MCP server into ~/.cursor/mcp.json. No ${workspaceFolder}: Cursor
 *  refuses to start a user-level server whenever it cannot resolve it (the
 *  Cursor Agents window has no workspace). The server learns the repo from
 *  MCP roots/list or from the last workspace a presence hook saw. */
export function mergeCursorMcp(existing, { id, node, serverPath, home }) {
  const out = existing && typeof existing === "object" ? structuredClone(existing) : {};
  out.mcpServers = out.mcpServers && typeof out.mcpServers === "object" ? out.mcpServers : {};
  out.mcpServers[id] = {
    command: node,
    args: [serverPath],
    env: { DEVBRAIN_HOME: home, DEVBRAIN_HOST: "cursor" },
  };
  return out;
}

export function stripMcpJson(existing, id) {
  if (!existing?.mcpServers || !(id in existing.mcpServers)) return existing;
  const out = structuredClone(existing);
  delete out.mcpServers[id];
  return out;
}

// ----------------------------------------------------------------- Codex ----

const tomlStr = (s) => JSON.stringify(String(s)); // TOML basic strings are JSON-compatible

/** The [mcp_servers.<id>] table we want in config.toml. */
export function codexMcpBlock({ id, node, serverPath, home }) {
  return [
    `[mcp_servers.${id}]`,
    `command = ${tomlStr(node)}`,
    `args = [${tomlStr(serverPath)}]`,
    `startup_timeout_sec = 20`,
    ``,
    `[mcp_servers.${id}.env]`,
    `DEVBRAIN_HOME = ${tomlStr(home)}`,
    `DEVBRAIN_HOST = "codex"`,
    `DEVBRAIN_PRESENCE = "lifecycle"`,
  ].join("\n");
}

/** Split a TOML document into top-level tables: [{header, lines}] where the
 *  first item (header null) is the preamble. Minimal on purpose — we only
 *  ever replace whole tables we own or set one key in [features]. */
export function splitToml(text) {
  const parts = [{ header: null, lines: [] }];
  for (const line of String(text ?? "").split("\n")) {
    const m = line.match(/^\s*(\[\[?[^\]]+\]\]?)\s*(#.*)?$/);
    if (m) parts.push({ header: m[1].replace(/^\[+|\]+$/g, "").trim(), lines: [line] });
    else parts[parts.length - 1].lines.push(line);
  }
  return parts;
}
const joinToml = (parts) => parts.map((p) => p.lines.join("\n")).join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s*$/, "\n");

/** Replace (or append) our [mcp_servers.<id>] tables and force
 *  features.hooks = true, leaving every other table byte-for-byte. */
export function mergeCodexConfig(text, { id, node, serverPath, home, hooks = true }) {
  const parts = splitToml(text).filter((p) => !(p.header === `mcp_servers.${id}` || p.header?.startsWith(`mcp_servers.${id}.`)));
  const trimEnd = (p) => { while (p.lines.length > 1 && p.lines[p.lines.length - 1].trim() === "") p.lines.pop(); };
  let features = parts.find((p) => p.header === "features");
  if (hooks) {
    if (!features) { features = { header: "features", lines: ["[features]"] }; parts.push(features); }
    trimEnd(features);
    const i = features.lines.findIndex((l) => /^\s*hooks\s*=/.test(l));
    if (i >= 0) features.lines[i] = "hooks = true";
    else features.lines.push("hooks = true");
  }
  for (const p of parts) trimEnd(p);
  if (parts[0].header === null && parts[0].lines.every((l) => l.trim() === "")) parts.shift(); // empty preamble
  parts.push({ header: `mcp_servers.${id}`, lines: ["", ...codexMcpBlock({ id, node, serverPath, home }).split("\n")] });
  // Blank line between tables.
  const lines = [];
  parts.forEach((p, i) => { if (i > 0 && p.lines[0] !== "" && lines.length && lines[lines.length - 1] !== "") lines.push(""); lines.push(...p.lines); });
  return joinToml([{ lines }]);
}

export function stripCodexConfig(text, id) {
  const parts = splitToml(text).filter((p) => !(p.header === `mcp_servers.${id}` || p.header?.startsWith(`mcp_servers.${id}.`)));
  return joinToml(parts);
}

/** Merge our Claude-shaped hook entries into ~/.codex/hooks.json. */
export function mergeCodexHooks(existing, { node, hooksDir }) {
  const c = hookCommands({ node, hooksDir, host: "codex" });
  const out = existing && typeof existing === "object" ? structuredClone(existing) : {};
  out.hooks = out.hooks && typeof out.hooks === "object" ? out.hooks : {};
  const entry = (command, timeout) => ({ hooks: [{ type: "command", command, timeout }] });
  const wanted = {
    SessionStart: entry(c.sessionStart, 12),
    SessionEnd: entry(c.sessionEnd, 8),
    PostToolUse: entry(c.activity, 8),
    PreToolUse: entry(c.guard, 10),
    UserPromptSubmit: entry(c.prompt, 8),
  };
  for (const [event, mine] of Object.entries(wanted)) {
    const kept = (Array.isArray(out.hooks[event]) ? out.hooks[event] : []).filter((g) => !(g?.hooks ?? []).some((h) => isOurs(h?.command, hooksDir)));
    out.hooks[event] = [...kept, mine];
  }
  return out;
}

export function stripCodexHooks(existing, hooksDir) {
  if (!existing || typeof existing !== "object" || !existing.hooks) return existing;
  const out = structuredClone(existing);
  for (const [event, list] of Object.entries(out.hooks)) {
    if (!Array.isArray(list)) continue;
    const kept = list.filter((g) => !(g?.hooks ?? []).some((h) => isOurs(h?.command, hooksDir)));
    if (kept.length) out.hooks[event] = kept; else delete out.hooks[event];
  }
  return out;
}

/** AGENTS.md block Codex reads at session start (Codex has no injected
 *  session brief the way Claude and Cursor do, so the standing instruction
 *  is to ask DevBrain first). Idempotent via the markers. */
export const AGENTS_BLOCK_START = "<!-- devbrain:start -->";
export const AGENTS_BLOCK_END = "<!-- devbrain:end -->";
export function agentsBlock() {
  return `${AGENTS_BLOCK_START}
## DevBrain (team awareness)
Before editing, call the DevBrain MCP tool \`get_team_context\` once and \`who_is_editing\` for any file you are about to change. Claim an area with \`claim_area\` when you start a task, \`release_claim\` when you stop, and leave a \`leave_handoff\` if you stop mid-way. Record non-obvious decisions with \`log_decision\`.
${AGENTS_BLOCK_END}`;
}
export function mergeAgentsMd(text) {
  const t = String(text ?? "");
  const re = new RegExp(`${AGENTS_BLOCK_START}[\\s\\S]*?${AGENTS_BLOCK_END}`);
  if (re.test(t)) return t.replace(re, agentsBlock());
  return (t.trim() ? t.replace(/\s*$/, "\n\n") : "") + agentsBlock() + "\n";
}
