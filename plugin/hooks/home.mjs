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
