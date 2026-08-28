// Channel-aware home for the plugin's hooks and MCP server.
//
// Two channels can coexist on one Mac: "stable" (plugin `devbrain`, config in
// ~/.devbrain) and "beta" (plugin `devbrain-beta`, config in ~/.devbrain-beta),
// each talking to its own server. The channel is read from this plugin's own
// manifest, so the same source serves both — plugin-beta/ is a generated copy
// of plugin/ whose plugin.json name ends in "-beta" (tools/sync-beta-plugin.sh).
//
// Override for local testing: DEVBRAIN_HOME=/path/to/dir.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function channel() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // hooks/ or mcp/ → plugin root → .claude-plugin/plugin.json
    const manifest = join(here, "..", ".claude-plugin", "plugin.json");
    if (existsSync(manifest)) {
      const name = String(JSON.parse(readFileSync(manifest, "utf8")).name || "");
      if (name.endsWith("-beta")) return "beta";
    }
  } catch { /* fall through */ }
  return "stable";
}

export function devbrainHome() {
  if (process.env.DEVBRAIN_HOME) return process.env.DEVBRAIN_HOME;
  return join(homedir(), channel() === "beta" ? ".devbrain-beta" : ".devbrain");
}

/** The CLI command and app name for this channel — for user-facing hints. */
export function cmdName() { return channel() === "beta" ? "devbrain-beta" : "devbrain"; }
export function appName() { return channel() === "beta" ? "DevBrain Beta" : "DevBrain"; }

/** Auth: <home>/config.json (written by the app / `devbrain setup`), else
 *  DEVBRAIN_URL + DEVBRAIN_TOKEN for headless environments (Cowork, CI).
 *  null when neither exists — every hook then exits silently. */
export function loadConfig() {
  try {
    const cfg = JSON.parse(readFileSync(join(devbrainHome(), "config.json"), "utf8"));
    if (cfg?.server && cfg?.token) return { ...cfg, server: String(cfg.server).replace(/\/$/, "") };
  } catch { /* try env */ }
  const server = (process.env.DEVBRAIN_URL || "").trim().replace(/\/$/, "");
  const token = (process.env.DEVBRAIN_TOKEN || "").trim();
  return server && token ? { server, token } : null;
}

/** 401 = this Mac's token is dead: the one failure worth one line. Everything
 *  else (404 repo-not-linked, 5xx) stays silent — fail-open, no noise. */
export function httpHint(status) {
  return status === 401
    ? `DevBrain: this Mac's token was rejected — run \`${cmdName()} setup --reconfigure\` (new token from Settings → Tokens).`
    : null;
}
