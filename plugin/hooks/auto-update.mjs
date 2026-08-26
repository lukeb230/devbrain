#!/usr/bin/env node
// SessionStart hook — keep this Mac on main. Kicks off `devbrain update
// --quiet` DETACHED and exits immediately, so a slow network or a widget
// download never delays the session. Throttled: at most once per 6 hours.
//
// Plugin/CLI changes land for the NEXT session (Claude Code loads plugins at
// start), which is the same cadence a human would get from `/plugin update`.
// The daily launchd job (com.devbrain.update) covers Macs where Claude isn't
// opened for a while. Fail-open: any problem here is silently ignored.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const THROTTLE_MS = 6 * 60 * 60 * 1000;

try {
  const dir = join(homedir(), ".devbrain");
  const cli = join(dir, "src", "cli", "bin", "devbrain.mjs");
  if (!existsSync(cli)) process.exit(0); // installed the old way; nothing to update

  const stamp = join(dir, "last-update");
  if (existsSync(stamp)) {
    const last = Date.parse(readFileSync(stamp, "utf8").trim());
    if (Number.isFinite(last) && Date.now() - last < THROTTLE_MS) process.exit(0);
  }

  const child = spawn(process.execPath, [cli, "update", "--quiet"], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, DEVBRAIN_TRIGGER: "session_start" },
  });
  child.unref();
} catch {
  /* fail-open */
}
process.exit(0);
