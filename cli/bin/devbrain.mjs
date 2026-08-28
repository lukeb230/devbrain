#!/usr/bin/env node
// ============================================================================
// devbrain CLI — installer, updater, and hook helper for a teammate's Mac.
//
//   devbrain setup       — first run: token, plugin, jobs, widget
//   devbrain update      — bring everything on this Mac up to main
//   devbrain bootstrap   — non-interactive first run (the DevBrain app)
//   devbrain reminders   — on/off here; team-wide list → repo mappings
//   devbrain doctor      — verify the whole chain
//   devbrain ctx         — print the context digest for the current repo
//   devbrain send        — internal: post one event (used by hooks)
//
// Exit codes: `update` and `setup` exit 1 when any part is NOT in the desired
// state (0 with --quiet, so hooks/launchd can call it blindly). `bootstrap`
// exits 0 (all ok), 2 (config written, some part failed — safe to re-run) or
// 1 (fatal: no token / unhandled). With --json the LAST stdout line is
//   DEVBRAIN_SUMMARY {"ok":bool,"failed":[…],"steps":{name:{ok,msg,code?}}}
// which the app parses; the exit code is only a fallback.
//
// Layout on a teammate's Mac (created by install.sh / `devbrain setup`):
//   ~/.devbrain/config.json      server, token, reminders lists
//   ~/.devbrain/src/             shallow clone of this repo — the source of
//                                truth for the CLI, tools, and plugin
//   ~/.devbrain/bin/devbrain     wrapper so `devbrain` works from any shell
//   ~/Library/LaunchAgents/com.devbrain.*.plist   scheduled jobs
//
// `update` is idempotent and safe to run constantly: it pulls ~/.devbrain/src,
// re-execs itself if the CLI changed, then reconciles each part against what
// is installed. It is run daily by launchd and on every Claude Code session
// start (throttled) by the plugin — so pushing to main updates every Mac.
//
// Design: zero dependencies, single file, Node 18+.
// ============================================================================

import { execSync, spawnSync, spawn } from "node:child_process";
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync,
  rmSync, chmodSync, renameSync, symlinkSync, readlinkSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { compareVersions, httpHint, normalizeStep, stepFromError, summarizeResults } from "./lib.mjs";

// The repo everything is installed from. When the repo goes private this is
// the one place the updater needs credentials — see docs/PRIVATE-REPO.md.
const SOURCE_REPO = "lukeb230/devbrain";
const DEFAULT_SERVER = "https://devbrain-seven.vercel.app";
const MARKETPLACE = "devbrain";

const HOME = homedir();
const SELF = fileURLToPath(import.meta.url);
// The checkout this CLI is running from (~/.devbrain*/src, or a dev clone).
const REPO_ROOT = resolve(dirname(SELF), "..", "..");

// ----------------------------------------------------------------------------
// Channels. Two installs can coexist on one Mac — "stable" in ~/.devbrain and
// "beta" in ~/.devbrain-beta — each with its own app, command, plugin, launchd
// jobs and server. The channel is inferred from where this CLI lives; dev
// clones can force it with DEVBRAIN_HOME=/path or DEVBRAIN_CHANNEL=beta.
// ----------------------------------------------------------------------------
function inferHome() {
  if (process.env.DEVBRAIN_HOME) return process.env.DEVBRAIN_HOME.replace(/\/$/, "");
  const m = SELF.match(/^(.*\/\.devbrain(?:-[a-z0-9]+)?)\/src\//);
  if (m) return m[1];
  return join(HOME, process.env.DEVBRAIN_CHANNEL === "beta" ? ".devbrain-beta" : ".devbrain");
}
const CONFIG_DIR = inferHome();
const CHANNEL = CONFIG_DIR.endsWith("-beta") ? "beta" : "stable";
const CH = CHANNEL === "beta"
  ? { appName: "DevBrain Beta", app: "/Applications/DevBrain Beta.app", cmd: "devbrain-beta", plugin: "devbrain-beta", pluginDir: "plugin-beta", bundleId: "app.devbrain.desktop.beta", label: "com.devbrain.beta", asset: "DevBrain-Beta.app.zip", rcMark: "# devbrain-beta" }
  : { appName: "DevBrain", app: "/Applications/DevBrain.app", cmd: "devbrain", plugin: "devbrain", pluginDir: "plugin", bundleId: "app.devbrain.desktop", label: "com.devbrain", asset: "DevBrain.app.zip", rcMark: "# devbrain" };

const CONFIG_PATH = join(CONFIG_DIR, "config.json");
const SRC_DIR = join(CONFIG_DIR, "src");
const BIN_DIR = join(CONFIG_DIR, "bin");
const AGENTS_DIR = join(HOME, "Library", "LaunchAgents");
const CLAUDE_SETTINGS = join(HOME, ".claude", "settings.json");
const WIDGET_APP = CH.app;
// Node shipped inside the widget bundle (widget/scripts/fetch-node.sh). When
// present it is the ONLY runtime a teammate needs; <home>/bin/node links to it
// so hooks, the MCP server and launchd jobs all find "node".
const BUNDLED_NODE = join(WIDGET_APP, "Contents", "Resources", "node", "bin", "node");
const SRC_SHA_FILE = join(SRC_DIR, ".devbrain-sha");

const cmd = process.argv[2];
const flags = new Set(process.argv.slice(3).filter((a) => a.startsWith("--")));
const QUIET = flags.has("--quiet");
const FORCE = flags.has("--force"); // widget: reinstall even if same/newer/unreadable
const JSON_OUT = flags.has("--json");
// DEVBRAIN_SKIP=widget,updater — leave those parts alone (QA in a scratch
// DEVBRAIN_HOME must never touch /Applications or ~/Library/LaunchAgents).
const SKIP = new Set((process.env.DEVBRAIN_SKIP || "").split(",").map((x) => x.trim()).filter(Boolean));
const log = (m) => { if (!QUIET) console.log(m); };
// Step-result helpers (contract in ./lib.mjs).
const fail = (code, msg) => ({ ok: false, code, msg: `FAILED: ${msg}` });
const skip = (msg) => ({ ok: true, skipped: true, msg });

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    console.error(`Not configured. Run: ${CH.cmd} setup`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
}
function saveConfig(cfg) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
}

function sh(command, opts = {}) {
  return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
}
function run(file, args, opts = {}) {
  return spawnSync(file, args, { encoding: "utf8", ...opts });
}
function currentRepo() {
  try {
    const url = sh("git remote get-url origin");
    const m = url.match(/github\.com[:/](.+?)(\.git)?$/);
    return m ? m[1] : null;
  } catch { return null; }
}
function currentBranch() {
  try { return sh("git rev-parse --abbrev-ref HEAD"); } catch { return null; }
}
async function post(config, path, body) {
  const res = await fetch(`${config.server}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({}));
}
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ----------------------------------------------------------------------------
// Claude Code hooks. Presence is owned by the PLUGIN (plugin/hooks/presence.mjs)
// since 0.5.0. Before that, `devbrain init` wrote `devbrain.mjs send …` hooks
// into ~/.claude/settings.json; if both exist every session is ingested twice.
// This removes any such legacy entries and never adds any. Idempotent.
// ----------------------------------------------------------------------------
function removeLegacyHooks() {
  if (!existsSync(CLAUDE_SETTINGS)) return false;
  let settings;
  try { settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, "utf8")); }
  catch { log("! Could not parse ~/.claude/settings.json — leaving it alone."); return false; }
  if (!settings.hooks) return false;
  let changed = false;
  for (const event of Object.keys(settings.hooks)) {
    const before = settings.hooks[event];
    if (!Array.isArray(before)) continue;
    const after = before.filter((h) => !/devbrain\.mjs send|devbrain[\\/]+bin/i.test(JSON.stringify(h)));
    if (after.length !== before.length) {
      changed = true;
      if (after.length === 0) delete settings.hooks[event];
      else settings.hooks[event] = after;
    }
  }
  if (changed) writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2) + "\n");
  return changed;
}

// ----------------------------------------------------------------------------
// launchd helpers. A job is (re)loaded only when its plist content changed.
// ----------------------------------------------------------------------------
function plistXml(label, args, extra) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${esc(label)}</string>
  <key>ProgramArguments</key>
  <array>
${args.map((a) => `    <string>${esc(a)}</string>`).join("\n")}
  </array>
${extra}
</dict>
</plist>
`;
}
function ensureJob(label, xml) {
  mkdirSync(AGENTS_DIR, { recursive: true });
  const path = join(AGENTS_DIR, `${label}.plist`);
  const before = existsSync(path) ? readFileSync(path, "utf8") : null;
  const loaded = run("launchctl", ["list", label]).status === 0;
  if (before === xml && loaded) return "unchanged";
  writeFileSync(path, xml);
  if (loaded) run("launchctl", ["unload", path]);
  const r = run("launchctl", ["load", path]);
  if (r.status !== 0) throw new Error(`launchctl load ${label}: ${r.stderr.trim()}`);
  return before === null ? "installed" : "updated";
}
function removeJob(label) {
  const path = join(AGENTS_DIR, `${label}.plist`);
  if (!existsSync(path)) return false;
  run("launchctl", ["unload", path]);
  rmSync(path, { force: true });
  return true;
}

// ----------------------------------------------------------------------------
// Parts. Each returns a short status string for the update summary.
// ----------------------------------------------------------------------------

// 1. Source checkout: ~/.devbrain/src tracks main.
//    Two modes: a git clone (terminal installs, dev machines) is pulled;
//    otherwise — no git required — the tarball of main is downloaded and
//    swapped in atomically, tracked by commit sha in .devbrain-sha. The app's
//    first-run flow uses the tarball mode so Xcode tools are never needed.
function headSha() {
  const r = run("curl", ["-fsSL", "-H", "Accept: application/vnd.github+json",
    `https://api.github.com/repos/${SOURCE_REPO}/commits/main`], { timeout: 20000 });
  if (r.status !== 0) return null;
  try { return JSON.parse(r.stdout).sha || null; } catch { return null; }
}
export function fetchSourceTarball(sha) {
  const tmp = join(tmpdir(), `devbrain-src-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const tgz = join(tmp, "src.tgz");
  const dl = run("curl", ["-fsSL", "-o", tgz, `https://codeload.github.com/${SOURCE_REPO}/tar.gz/${sha || "main"}`], { timeout: 120000 });
  if (dl.status !== 0) throw new Error(`download failed: ${dl.stderr.trim().split("\n").pop()}`);
  const ex = run("tar", ["-xzf", tgz, "-C", tmp]);
  if (ex.status !== 0) throw new Error(`extract failed: ${ex.stderr.trim()}`);
  const dir = readdirSync(tmp).map((n) => join(tmp, n)).find((d) => existsSync(join(d, "cli", "bin", "devbrain.mjs")));
  if (!dir) throw new Error("tarball did not contain the CLI");
  // Swap atomically; keep the old tree one step for rollback.
  const old = SRC_DIR + ".old";
  rmSync(old, { recursive: true, force: true });
  if (existsSync(SRC_DIR)) renameSync(SRC_DIR, old);
  renameSync(dir, SRC_DIR);
  rmSync(old, { recursive: true, force: true });
  rmSync(tmp, { recursive: true, force: true });
  if (sha) writeFileSync(SRC_SHA_FILE, sha);
}
function updateSource() {
  if (existsSync(join(SRC_DIR, ".git"))) {
    const before = sh("git rev-parse HEAD", { cwd: SRC_DIR });
    const r = run("git", ["pull", "--ff-only", "--quiet"], { cwd: SRC_DIR });
    if (r.status !== 0) return fail("source_pull", `pull failed (${r.stderr.trim().split("\n").pop()})`);
    const after = sh("git rev-parse HEAD", { cwd: SRC_DIR });
    return before === after ? "up to date" : `updated ${before.slice(0, 7)} → ${after.slice(0, 7)}`;
  }
  const sha = headSha();
  if (!sha) return existsSync(SRC_DIR) ? skip("offline — kept current source") : fail("source_offline", "offline — cannot fetch source");
  const have = existsSync(SRC_SHA_FILE) ? readFileSync(SRC_SHA_FILE, "utf8").trim() : null;
  if (have === sha && existsSync(join(SRC_DIR, "cli", "bin", "devbrain.mjs"))) return "up to date";
  fetchSourceTarball(sha);
  return have ? `updated ${have.slice(0, 7)} → ${sha.slice(0, 7)}` : `installed ${sha.slice(0, 7)}`;
}

// 2. `devbrain` (and `node`) on PATH. Prefers the Node bundled in the widget;
//    ~/.devbrain/bin/node is a symlink to it so everything that says "node"
//    (plugin hooks, MCP server, launchd jobs) works on a Mac with no Node.
function bundledNode() {
  return existsSync(BUNDLED_NODE) ? BUNDLED_NODE : null;
}
function installWrapper() {
  mkdirSync(BIN_DIR, { recursive: true });
  let changed = false;
  const nodeLink = join(BIN_DIR, "node");
  const bundled = bundledNode();
  if (bundled) {
    let current = null;
    try { current = readlinkSync(nodeLink); } catch { /* absent or not a link */ }
    if (current !== bundled) {
      rmSync(nodeLink, { force: true });
      symlinkSync(bundled, nodeLink);
      changed = true;
    }
  }
  const wrapper = join(BIN_DIR, CH.cmd);
  const content = `#!/bin/sh
# ${CH.appName} CLI wrapper — installed by ${CH.cmd} setup. Order: the Node bundled
# with the ${CH.appName} app, then the node on PATH, then the one that ran setup.
NODE="${join(BIN_DIR, "node")}"
[ -x "$NODE" ] || NODE="$(command -v node 2>/dev/null || true)"
[ -x "$NODE" ] || NODE="${process.execPath}"
exec "$NODE" "${join(SRC_DIR, "cli", "bin", "devbrain.mjs")}" "$@"
`;
  const same = existsSync(wrapper) && readFileSync(wrapper, "utf8") === content;
  if (!same) { writeFileSync(wrapper, content); chmodSync(wrapper, 0o755); changed = true; }
  const rc = join(HOME, process.env.SHELL?.endsWith("zsh") ? ".zshrc" : ".bash_profile");
  const line = `export PATH="${BIN_DIR.replace(HOME, "$HOME")}:$PATH"  ${CH.rcMark}`;
  const rcText = existsSync(rc) ? readFileSync(rc, "utf8") : "";
  if (!rcText.split("\n").some((l) => l.trim().endsWith(CH.rcMark))) writeFileSync(rc, rcText + (rcText.endsWith("\n") || !rcText ? "" : "\n") + line + "\n");
  return changed ? `installed${bundled ? " (node → bundled)" : ""}` : "ok";
}

// 3. Claude Code plugin via the marketplace in this repo.
//    The `claude` CLI is not always on PATH for background processes (launchd,
//    the desktop app's hooks), so look in the usual install spots too.
function findClaude() {
  // DEVBRAIN_CLAUDE=/path pins the lookup (QA: /nonexistent simulates "not installed").
  if (process.env.DEVBRAIN_CLAUDE) {
    const c = process.env.DEVBRAIN_CLAUDE;
    return existsSync(c) && run(c, ["--version"]).status === 0 ? c : null;
  }
  const candidates = [
    "claude",
    join(HOME, ".local", "bin", "claude"),
    join(HOME, ".claude", "local", "bin", "claude"),
    join(HOME, ".claude", "local", "claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ];
  // Newest version installed by the native installer, if the symlink is gone.
  const versions = join(HOME, ".local", "share", "claude", "versions");
  if (existsSync(versions)) {
    for (const v of readdirSync(versions).sort().reverse()) candidates.push(join(versions, v));
  }
  // CLI embedded in a desktop app bundle.
  for (const app of ["/Applications/Claude Code.app", "/Applications/Claude.app"]) {
    for (const rel of ["Contents/Resources/bin/claude", "Contents/Resources/claude", "Contents/MacOS/claude"]) {
      candidates.push(join(app, rel));
    }
  }
  for (const c of candidates) {
    if (c !== "claude" && !existsSync(c)) continue;
    if (run(c, ["--version"]).status === 0) return c;
  }
  return null;
}
let CLAUDE = null;
function claude(args) { return run(CLAUDE, args); }
function wantedPluginVersion() {
  return JSON.parse(readFileSync(join(REPO_ROOT, CH.pluginDir, ".claude-plugin", "plugin.json"), "utf8")).version;
}
function updatePlugin() {
  CLAUDE = findClaude();
  if (!CLAUDE) return fail("claude_missing", "Claude Code CLI not found (PATH, ~/.local/bin, ~/.claude/local, app bundle) — install Claude Code, then re-run");
  const mp = claude(["plugin", "marketplace", "list"]);
  // Exact-name match: "devbrain" must not be satisfied by "devbrain-marketplace".
  const haveMarketplace = new RegExp(`^\\s*(?:❯\\s*)?${MARKETPLACE}\\s*$`, "m").test(mp.stdout + mp.stderr);
  if (!haveMarketplace) {
    const a = claude(["plugin", "marketplace", "add", SOURCE_REPO]);
    if (a.status !== 0) return fail("marketplace_add", `marketplace add failed: ${(a.stderr || a.stdout).trim().split("\n").pop()}`);
  } else {
    claude(["plugin", "marketplace", "update", MARKETPLACE]);
  }
  const installed = claude(["plugin", "list"]).stdout;
  const wantVer = wantedPluginVersion();
  const m = installed.match(new RegExp(`${CH.plugin}@${MARKETPLACE}\\s+Version:\\s*(\\S+)`));
  const haveVer = m ? m[1] : null;
  if (!haveVer) {
    const r = claude(["plugin", "install", `${CH.plugin}@${MARKETPLACE}`]);
    return r.status === 0 ? `installed ${wantVer}` : fail("plugin_install", `install failed: ${(r.stderr || r.stdout).trim().split("\n").pop()}`);
  }
  if (haveVer === wantVer) return `${haveVer} up to date`;
  const r = claude(["plugin", "update", `${CH.plugin}@${MARKETPLACE}`, "-y"]);
  return r.status === 0
    ? `${haveVer} → ${wantVer} (applies to new Claude sessions)`
    : fail("plugin_update", `update failed: ${(r.stderr || r.stdout).trim().split("\n").pop()}`);
}

// 4. Reminders sync is run by the DevBrain app (every 3 min while it runs)
//    for every list the TEAM mapped on Settings → Reminders — the mapping
//    lives on the server, never on a Mac. Locally there is only an on/off
//    flag (config.reminders = true). Old per-Mac mappings are migrated up
//    once, then the app takes over. Legacy launchd jobs are retired.
async function updateReminderJobs(cfg) {
  let retired = 0;
  for (const f of existsSync(AGENTS_DIR) ? readdirSync(AGENTS_DIR) : []) {
    const label = f.replace(/\.plist$/, "");
    if (label === `${CH.label}.reminders` || label.startsWith(`${CH.label}.reminders.`)) { removeJob(label); retired++; }
  }
  let migrated = 0;
  if (Array.isArray(cfg.reminders)) {
    for (const l of cfg.reminders) {
      if (!l?.list || !l?.repo) continue;
      const r = await api(cfg, "POST", "/api/v1/reminders/sources", { list: l.list, repo: l.repo });
      if (r.ok) migrated++;
    }
    cfg.reminders = true;
    saveConfig(cfg);
  }
  const on = cfg.reminders === true;
  const appOk = existsSync(WIDGET_APP);
  const base = on
    ? `on — lists mapped on Settings → Reminders, synced by the ${CH.appName} app${appOk ? "" : " (app not installed!)"}`
    : `off (${CH.cmd} reminders on)`;
  const extras = [migrated ? `migrated ${migrated} mapping(s) to the server` : "", retired ? `retired ${retired} launchd job(s)` : ""].filter(Boolean);
  return extras.length ? `${base}; ${extras.join("; ")}` : base;
}

async function api(cfg, method, path, body) {
  try {
    const res = await fetch(`${cfg.server.replace(/\/$/, "")}${path}`, {
      method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const out = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, out };
  } catch (e) { return { ok: false, status: 0, out: { error: String(e.message || e) } }; }
}

// 5. Daily self-update job (also fires on wake if a run was missed).
function updateUpdaterJob() {
  const xml = plistXml(`${CH.label}.update`,
    [bundledNode() ?? process.execPath, join(SRC_DIR, "cli", "bin", "devbrain.mjs"), "update", "--quiet"],
    `  <key>StartInterval</key><integer>86400</integer>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>/tmp/${CH.cmd}-update.log</string>
  <key>StandardErrorPath</key><string>/tmp/${CH.cmd}-update.log</string>`);
  return ensureJob(`${CH.label}.update`, xml);
}

// 6. Widget: install/replace /Applications/DevBrain.app when the checkout's
//    widget version is newer than what is installed. The build comes from the
//    widget-v<version> GitHub Release produced by .github/workflows.
function installedWidgetVersion() {
  if (!existsSync(WIDGET_APP)) return null;
  const plist = join(WIDGET_APP, "Contents", "Info.plist");
  const r = run("defaults", ["read", plist, "CFBundleShortVersionString"]);
  if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  // cfprefsd can lag on a freshly copied bundle; plutil reads the file itself.
  const p = run("plutil", ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", plist]);
  return p.status === 0 && p.stdout.trim() ? p.stdout.trim() : "unknown";
}
// Any running copy of THIS channel's app, wherever it lives (DMG, ~/Downloads,
// /Applications). Match the bundle folder with a leading slash so
// "/DevBrain.app/" never matches "/DevBrain Beta.app/".
function runningApp() {
  const r = run("pgrep", ["-fl", `/${CH.appName}.app/Contents/MacOS/`]);
  if (r.status !== 0) return null;
  const line = r.stdout.trim().split("\n")[0] || "";
  const pid = line.split(" ")[0];
  const exe = run("ps", ["-o", "comm=", "-p", pid]).stdout.trim();
  const bundle = exe.replace(/\/Contents\/MacOS\/.*$/, "") || WIDGET_APP;
  return { pid: Number(pid), bundle, inApplications: bundle === WIDGET_APP };
}
function quitApp(running) {
  run("osascript", ["-e", `tell application id "${CH.bundleId}" to quit`]);
  const until = Date.now() + 4000;
  while (Date.now() < until) {
    try { process.kill(running.pid, 0); } catch { return; }
    spawnSync("sleep", ["0.2"]);
  }
  run("pkill", ["-9", "-f", `/${CH.appName}.app/Contents/MacOS/`]);
}
async function updateWidget() {
  const confPath = join(SRC_DIR, "widget", "src-tauri", "tauri.conf.json");
  if (!existsSync(confPath)) return skip("no widget in checkout");
  const want = JSON.parse(readFileSync(confPath, "utf8")).version;
  const have = installedWidgetVersion();
  const cmp = compareVersions(have, want);
  if (have && !FORCE) {
    if (cmp === null) return skip(`installed version "${have}" unreadable — not touching it (--force reinstalls ${want})`);
    if (cmp === 0) return `${have} up to date`;
    if (cmp === 1) return `${have} installed is newer than ${want} on main — kept (--force to downgrade)`;
  }

  const url = `https://github.com/${SOURCE_REPO}/releases/download/widget-v${want}/${CH.asset}`;
  const res = await fetch(url, { redirect: "follow" }).catch((e) => ({ ok: false, status: e.message }));
  if (!res.ok) {
    return res.status === 404
      ? skip(`${want} not released yet (installed: ${have ?? "none"}) — CI builds it on the next widget push`)
      : fail("widget_download", `download failed (${res.status})`);
  }
  const tmp = join(tmpdir(), `${CH.cmd}-widget-${want}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const zip = join(tmp, CH.asset);
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  // ditto preserves bundle metadata; xattr clears Gatekeeper quarantine so
  // the ad-hoc-signed download is never refused as "damaged" (see
  // docs/NOTARIZE.md for the day this build gets a Developer ID).
  if (run("ditto", ["-x", "-k", zip, tmp]).status !== 0) return fail("widget_unzip", "unzip failed");
  const app = join(tmp, `${CH.appName}.app`);
  if (!existsSync(app)) return fail("widget_unzip", `zip did not contain ${CH.appName}.app`);
  run("xattr", ["-dr", "com.apple.quarantine", app]);

  // Stage next to the target, verify the runtime everything else depends on
  // (~/.devbrain/bin/node → this bundle), THEN swap by rename. The old app is
  // never removed before the new one is proven to work.
  const staged = WIDGET_APP + ".new";
  const old = WIDGET_APP + ".old";
  rmSync(staged, { recursive: true, force: true });
  if (run("ditto", [app, staged]).status !== 0) {
    rmSync(staged, { recursive: true, force: true }); rmSync(tmp, { recursive: true, force: true });
    return fail("widget_copy", `could not stage new app next to ${WIDGET_APP} (permissions? disk full?) — the installed app is untouched`);
  }
  const stagedNode = join(staged, "Contents", "Resources", "node", "bin", "node");
  if (!existsSync(stagedNode) || run(stagedNode, ["-v"]).status !== 0) {
    rmSync(staged, { recursive: true, force: true }); rmSync(tmp, { recursive: true, force: true });
    return fail("widget_verify", "new app's bundled node does not run — kept the installed app");
  }
  const running = runningApp();
  if (running) quitApp(running);
  rmSync(old, { recursive: true, force: true });
  try {
    if (existsSync(WIDGET_APP)) renameSync(WIDGET_APP, old);
    renameSync(staged, WIDGET_APP);
  } catch (e) {
    if (!existsSync(WIDGET_APP) && existsSync(old)) renameSync(old, WIDGET_APP);
    rmSync(staged, { recursive: true, force: true }); rmSync(tmp, { recursive: true, force: true });
    return fail("widget_swap", `swap failed, restored ${have ?? "nothing"}: ${e.message}`);
  }
  rmSync(old, { recursive: true, force: true });
  rmSync(tmp, { recursive: true, force: true });
  run("xattr", ["-dr", "com.apple.quarantine", WIDGET_APP]);
  if (running || !have) run("open", ["-a", WIDGET_APP]);
  const where = running && !running.inApplications ? ` (was running from ${running.bundle} — now /Applications)` : "";
  return `${have ?? "none"} → ${want} installed${running ? " and relaunched" : ""}${where}`;
}

// ----------------------------------------------------------------------------
// update — reconcile every part. Never prompts; with --quiet never exits
// non-zero, so hooks and launchd can call it blindly.
// ----------------------------------------------------------------------------
async function updateAll({ skipSource = false } = {}) {
  const cfg = loadConfig();
  // One updater at a time (launchd daily vs. session-start hook).
  const lock = join(CONFIG_DIR, "update.lock");
  try {
    const st = existsSync(lock) ? JSON.parse(readFileSync(lock, "utf8")) : null;
    if (st && Date.now() - st.at < 10 * 60_000) {
      let alive = false; try { process.kill(st.pid, 0); alive = true; } catch { /* gone */ }
      if (alive && st.pid !== process.pid) return { results: { update: skip(`another update is running (pid ${st.pid})`) }, failed: [], ok: true };
    }
  } catch { /* unreadable lock — take it */ }
  writeFileSync(lock, JSON.stringify({ pid: process.pid, at: Date.now() }));

  const results = {};
  const step = async (name, fn) => {
    if (SKIP.has(name)) { results[name] = skip("skipped (DEVBRAIN_SKIP)"); return; }
    try { results[name] = normalizeStep(await fn()); }
    catch (e) { results[name] = stepFromError(e); }
  };

  if (!skipSource) {
    await step("source", updateSource);
    // If the CLI itself changed, hand off to the new one so the rest of this
    // run uses current code. Guarded against loops. The child prints the
    // summary (and DEVBRAIN_SUMMARY line) on our inherited stdout.
    const runningFromSrc = SELF.startsWith(SRC_DIR + "/");
    if (runningFromSrc && results.source.ok && /updated|cloned|installed/.test(results.source.msg) && !process.env.DEVBRAIN_REEXEC) {
      const passthru = [...flags].filter((f) => f !== "--no-source");
      const r = spawnSync(process.execPath, [SELF, "update", "--no-source", ...passthru], {
        stdio: "inherit", env: { ...process.env, DEVBRAIN_REEXEC: "1" },
      });
      log(`  source    ${results.source.msg}`);
      rmSync(lock, { force: true });
      process.exit(QUIET ? 0 : r.status ?? 0);
    }
  }
  await step("cli", installWrapper);
  await step("hooks", () => (removeLegacyHooks() ? "legacy CLI hooks removed (plugin owns presence)" : "ok"));
  await step("plugin", updatePlugin);
  await step("reminders", () => updateReminderJobs(cfg));
  await step("updater", updateUpdaterJob);
  await step("widget", updateWidget); // keep LAST: it replaces the bundle our node came from

  const summary = summarizeResults(results);
  writeFileSync(join(CONFIG_DIR, "last-update"), new Date().toISOString());
  // Record the outcome so the app (and a later good run) know where we stand.
  try {
    const fresh = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    fresh.bootstrap_ok = summary.ok;
    fresh.bootstrap_failed = summary.failed;
    fresh.bootstrap_at = new Date().toISOString();
    saveConfig(fresh);
  } catch { /* config vanished mid-run; nothing to record */ }
  for (const l of summary.lines) log(l);
  if (JSON_OUT) {
    const steps = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { ok: v.ok, msg: v.msg.replace(/^FAILED: /, ""), ...(v.code ? { code: v.code } : {}), ...(v.skipped ? { skipped: true } : {}) }]));
    console.log("DEVBRAIN_SUMMARY " + JSON.stringify({ ok: summary.ok, failed: summary.failed, steps }));
  }
  rmSync(lock, { force: true });
  return { results, failed: summary.failed, ok: summary.ok };
}

// ============================================================================
// Commands
// ============================================================================

if (cmd === "setup" || cmd === "init") {
  if (cmd === "init") console.log(`(\`${CH.cmd} init\` is now \`${CH.cmd} setup\`)`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let cfg = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, "utf8")) : {};
  if (!cfg.server || !cfg.token || flags.has("--reconfigure")) {
    const server = (await rl.question(`DevBrain server URL [${cfg.server || DEFAULT_SERVER}]: `)).trim();
    const token = (await rl.question("Your dev token (Settings → Tokens on the dashboard, shown once): ")).trim();
    cfg.server = server || cfg.server || DEFAULT_SERVER;
    if (token) cfg.token = token;
    if (!cfg.token) { console.error("A dev token is required."); process.exit(1); }
    saveConfig(cfg);
    console.log(`✓ Saved ${CONFIG_PATH}`);
  }
  if (cfg.reminders === undefined) {
    const yn = (await rl.question("Sync the team's shared Apple Reminders lists from this Mac? [Y/n] ")).trim().toLowerCase();
    cfg.reminders = yn !== "n"; saveConfig(cfg);
  }
  rl.close();

  console.log("\n→ Installing / updating everything on this Mac…");
  const { ok } = await updateAll();
  console.log(ok ? `
✓ Done. Open a NEW terminal (or run: source ~/.zshrc) so \`${CH.cmd}\` is on your PATH.
  Everything updates itself from main daily and whenever a Claude Code session starts.
  Check any time with:  ${CH.cmd} doctor` : `
! Some parts failed (marked ✗ above). Fix the cause and re-run: ${CH.cmd} update`);
  process.exit(ok ? 0 : 1);
}

// Non-interactive first-run used by the DevBrain app: writes config, then
// reconciles everything. Prints the per-part summary like `update`.
//   devbrain bootstrap --server URL --token TOKEN [--reminders "List" --repo owner/name]
if (cmd === "bootstrap") {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  const cfg = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, "utf8")) : {};
  cfg.server = (arg("--server") || cfg.server || DEFAULT_SERVER).replace(/\/$/, "");
  if (arg("--token")) cfg.token = arg("--token");
  if (!cfg.token) { console.error("bootstrap: --token required (none in config yet)"); process.exit(1); }
  const rem = arg("--reminders");
  if (rem === "on" || rem === "off") cfg.reminders = rem === "on";
  else if (rem && arg("--repo")) cfg.reminders = [{ list: rem, repo: arg("--repo") }]; // legacy shape → migrated by updateReminderJobs
  if (cfg.reminders === undefined) cfg.reminders = true;
  saveConfig(cfg);
  let out;
  try { out = await updateAll(); }
  catch (e) {
    if (JSON_OUT) console.log("DEVBRAIN_SUMMARY " + JSON.stringify({ ok: false, failed: ["bootstrap"], steps: { bootstrap: { ok: false, code: "exception", msg: String(e.message || e) } } }));
    console.error(`bootstrap: ${e.message || e}`);
    process.exit(1);
  }
  process.exit(out.ok ? 0 : 2);
}

if (cmd === "update") {
  const out = await updateAll({ skipSource: flags.has("--no-source") });
  process.exit(out.ok || QUIET ? 0 : 1);
}

if (cmd === "reminders") {
  const sub = process.argv[3];
  const cfg = loadConfig();
  if (sub === "on" || sub === "off") {
    cfg.reminders = sub === "on"; saveConfig(cfg);
    console.log(`  reminders sync ${sub} on this Mac${sub === "on" ? ` — the ${CH.appName} app syncs the mapped lists every 3 min` : ""}`);
    process.exit(0);
  }
  if (sub === "add") {
    const [list, repo] = process.argv.slice(4);
    if (!list || !repo) { console.error(`usage: ${CH.cmd} reminders add "<List Name>" "<owner/repo>"`); process.exit(1); }
    const r = await api(cfg, "POST", "/api/v1/reminders/sources", { list, repo });
    if (!r.ok) { console.error(`  ✗ ${r.out.error || r.status}`); process.exit(1); }
    if (cfg.reminders !== true) { cfg.reminders = true; saveConfig(cfg); }
    console.log(`  ✓ "${list}" → ${repo} (team-wide mapping; synced by any Mac running ${CH.appName})`);
    process.exit(0);
  }
  if (sub === "remove") {
    const list = process.argv[4];
    if (!list) { console.error(`usage: ${CH.cmd} reminders remove "<List Name>"`); process.exit(1); }
    const r = await api(cfg, "DELETE", "/api/v1/reminders/sources", { list });
    console.log(r.ok ? `  ✓ removed ${r.out.removed} mapping(s) for "${list}"` : `  ✗ ${r.out.error || r.status}`);
    process.exit(r.ok ? 0 : 1);
  }
  const r = await api(cfg, "GET", "/api/v1/reminders/sources");
  const list = r.ok ? r.out.sources : [];
  console.log(`Reminders sync on this Mac: ${cfg.reminders === true ? "on" : "off"}   (${CH.cmd} reminders on|off)`);
  if (list.length === 0) console.log(`No lists mapped. Map one: ${CH.cmd} reminders add "<List>" "<owner/repo>"  (or Settings → Reminders)`);
  for (const s of list) console.log(`  "${s.list}" → ${s.repo}${s.by ? `  (by ${s.by})` : ""}`);
  process.exit(0);
}

if (cmd === "send") {
  const kind = process.argv[3] || "activity";
  const config = loadConfig();
  const repo = currentRepo();
  if (!repo) process.exit(0);

  let hookInput = {};
  try { const stdin = readFileSync(0, "utf8"); if (stdin.trim()) hookInput = JSON.parse(stdin); } catch { /* none */ }

  let file = hookInput?.tool_input?.file_path;
  if (file) {
    try {
      const root = sh("git rev-parse --show-toplevel");
      if (root && file.startsWith(root)) file = file.slice(root.length + 1);
    } catch { /* keep as-is */ }
  }
  const sessionFile = join(CONFIG_DIR, "session-" + repo.replace("/", "_"));

  if (kind === "session_start") {
    const out = await post(config, "/api/v1/ingest", { kind, repo, branch: currentBranch(), agent: "claude-code" });
    if (out?.session_id) writeFileSync(sessionFile, out.session_id);
    try {
      const res = await fetch(`${config.server}/api/v1/context?repo=${encodeURIComponent(repo)}`, {
        headers: { Authorization: `Bearer ${config.token}` },
      });
      if (res.ok) {
        const ctx = await res.json();
        console.log("## Team context (DevBrain)");
        console.log(JSON.stringify(ctx, null, 2));
      } else {
        const hint = httpHint(res.status, CH.cmd);
        if (hint) console.log(hint);
      }
    } catch { /* best-effort */ }
    process.exit(0);
  }

  const session_id = existsSync(sessionFile) ? readFileSync(sessionFile, "utf8").trim() : undefined;
  if (kind === "session_end") {
    if (session_id) await post(config, "/api/v1/ingest", { kind, repo, session_id });
    process.exit(0);
  }
  if (file) {
    await post(config, "/api/v1/ingest", {
      kind: "activity", repo, branch: currentBranch(), file,
      tool: (hookInput?.tool_name || "edit").toLowerCase(), session_id,
    });
  }
  process.exit(0);
}

if (cmd === "doctor") {
  const results = [];
  const ok = (n, d = "") => results.push(`  ✓ ${n}${d ? " — " + d : ""}`);
  const bad = (n, d = "") => results.push(`  ✗ ${n}${d ? " — " + d : ""}`);

  let cfg = null;
  if (existsSync(CONFIG_PATH)) {
    try { cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8")); ok("config", CONFIG_PATH); }
    catch { bad("config", `exists but is not valid JSON — re-run: ${CH.cmd} setup`); }
  } else bad("config", `missing — run: ${CH.cmd} setup`);

  if (cfg?.server && cfg?.token) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${cfg.server}/api/v1/context`, { headers: { Authorization: `Bearer ${cfg.token}` }, signal: ctrl.signal });
      clearTimeout(t);
      if (res.status === 401) bad("auth", `token rejected — create a new one on Settings → Tokens, then run: ${CH.cmd} setup --reconfigure`);
      else if (res.status === 400) ok("server + auth", cfg.server);
      else ok("server reachable", `status ${res.status}`);
    } catch (e) { bad("server", `unreachable (${e.name === "AbortError" ? "timeout" : e.message})`); }
  }

  if (cfg?.server && cfg?.token) {
    try {
      const res = await fetch(`${cfg.server}/api/v1/health`, { headers: { Authorization: `Bearer ${cfg.token}` } });
      if (res.status === 404) results.push("  · server predates /api/v1/health (tick check skipped)");
      else {
        const h = await res.json();
        if (h.ok) ok("agent tick alive", `last run ${h.tick.age_s}s ago${h.agent_configured ? "" : " (no ANTHROPIC_API_KEY — AI units idle)"}`);
        else bad("agent tick", h.tick.last_at ? `last heartbeat ${h.tick.age_s}s ago — check the pg_cron job (supabase/cron/agent-tick.sql)` : "never ran — schedule it with supabase/cron/agent-tick.sql");
        if (h.alerts) {
          const a = h.alerts;
          const where = [a.ops_channel ? "ops webhook" : null, a.team_channels ? `${a.team_channels} team webhook${a.team_channels === 1 ? "" : "s"}` : null, a.watchdog ? "watchdog" : null].filter(Boolean).join(", ") || "in-app only";
          if (a.team_open > 0) bad("alerts", `${a.team_open} open for your team — see the dashboard banner (delivery: ${where})`);
          else ok("alerts", `none open for your team (delivery: ${where})`);
        }
      }
    } catch { bad("agent tick", "health check failed"); }
  }

  if (existsSync(join(SRC_DIR, ".git"))) {
    let head = "?"; try { head = sh("git rev-parse --short HEAD", { cwd: SRC_DIR }); } catch { /* */ }
    ok("source checkout", `${SRC_DIR} @ ${head} (git)`);
  } else if (existsSync(join(SRC_DIR, "cli", "bin", "devbrain.mjs"))) {
    const sha = existsSync(SRC_SHA_FILE) ? readFileSync(SRC_SHA_FILE, "utf8").trim().slice(0, 7) : "?";
    ok("source checkout", `${SRC_DIR} @ ${sha}`);
  } else bad("source checkout", `${SRC_DIR} missing — run: ${CH.cmd} setup`);
  const last = existsSync(join(CONFIG_DIR, "last-update")) ? readFileSync(join(CONFIG_DIR, "last-update"), "utf8").trim() : null;
  if (last) ok("last update", last); else bad("last update", `never — run: ${CH.cmd} update`);
  if (cfg?.bootstrap_ok === false) bad("last setup", `parts failed: ${(cfg.bootstrap_failed || []).join(", ") || "?"} — run: ${CH.cmd} update`);
  if (run("launchctl", ["list", `${CH.label}.update`]).status === 0) ok("daily updater job loaded");
  else bad("daily updater job", `not loaded — run: ${CH.cmd} update`);

  const repo = currentRepo();
  if (repo) {
    ok("repo detected", repo);
    if (cfg?.server && cfg?.token) {
      try {
        const res = await fetch(`${cfg.server}/api/v1/context?repo=${encodeURIComponent(repo)}`, { headers: { Authorization: `Bearer ${cfg.token}` } });
        if (res.ok) ok("repo linked in DevBrain");
        else if (res.status === 401) bad("auth", "token rejected");
        else bad("repo not linked", "an admin installs the GitHub App on it from the dashboard (Link repo)");
      } catch { /* covered above */ }
    }
  } else results.push("  · not inside a git repo (repo checks skipped)");

  if (existsSync(CLAUDE_SETTINGS)) {
    try {
      const s = JSON.parse(readFileSync(CLAUDE_SETTINGS, "utf8"));
      const legacy = Object.values(s.hooks || {}).flat().some((h) => /devbrain\.mjs send/.test(JSON.stringify(h)));
      if (legacy) bad("legacy CLI presence hooks", `still in ~/.claude/settings.json (double ingest) — run: ${CH.cmd} update`);
      else ok("presence hooks", "owned by the plugin");
    } catch { bad("~/.claude/settings.json", "unreadable"); }
  }

  CLAUDE = CLAUDE || findClaude();
  const pl = CLAUDE ? claude(["plugin", "list"]) : { status: 1, stdout: "" };
  if (pl.status !== 0) bad("claude CLI", "not found (PATH, ~/.local/bin, ~/.claude/local, app bundle)");
  else {
    const m = pl.stdout.match(new RegExp(`${CH.plugin}@${MARKETPLACE}\\s+Version:\\s*(\\S+)`));
    let want = "?"; try { want = wantedPluginVersion(); } catch { /* */ }
    if (!m) bad("plugin", `not installed — run: ${CH.cmd} update`);
    else if (m[1] === want) ok("plugin", `${m[1]}`);
    else bad("plugin", `${m[1]} installed, ${want} on main — run: ${CH.cmd} update, then restart Claude`);
  }

  const running = runningApp();
  if (cfg?.reminders === true) {
    if (running) ok("reminders sync", `on — mapped lists synced by ${CH.appName} every 3 min`);
    else bad("reminders sync", `on, but ${CH.appName} isn't running — open it`);
  }
  if (bundledNode()) ok("node", `bundled with the ${CH.appName} app`); else results.push(`  · node — using ${process.execPath}`);
  const wv = installedWidgetVersion();
  let wantW = null; try { wantW = JSON.parse(readFileSync(join(REPO_ROOT, "widget", "src-tauri", "tauri.conf.json"), "utf8")).version; } catch { /* */ }
  const wcmp = compareVersions(wv, wantW);
  if (!wv) bad("widget", `not installed — run: ${CH.cmd} update (needs a published widget release)`);
  else if (wcmp === 0) ok("widget", `${wv}${running ? (running.inApplications ? " (running)" : ` (running from ${running.bundle} — move it to /Applications)`) : " (not running)"}`);
  else if (wcmp === 1) ok("widget", `${wv} (newer than ${wantW} on main)`);
  else if (wcmp === null) bad("widget", `installed version unreadable ("${wv}") — run: ${CH.cmd} update --force`);
  else bad("widget", `${wv} installed, ${wantW} on main — run: ${CH.cmd} update`);

  console.log(`${CH.cmd} doctor\n` + results.join("\n"));
  process.exit(results.some((r) => r.includes("✗")) ? 1 : 0);
}

if (cmd === "ctx") {
  const config = loadConfig();
  const repo = currentRepo();
  if (!repo) { console.error("Not inside a git repo with a GitHub remote."); process.exit(1); }
  const res = await fetch(`${config.server}/api/v1/context?repo=${encodeURIComponent(repo)}`, {
    headers: { Authorization: `Bearer ${config.token}` },
  });
  const body = await res.json().catch(() => ({ error: `server returned ${res.status}` }));
  console.log(JSON.stringify(res.ok ? body : { status: res.status, ...body }, null, 2));
  process.exit(res.ok ? 0 : 1);
}

const c = CH.cmd;
console.log(`${c} — ${CH.appName} CLI (channel: ${CHANNEL}, home: ${CONFIG_DIR})

Usage:
  ${c} setup [--reconfigure]        First-time setup on this Mac (token, plugin, jobs, app)
  ${c} update [--force]             Bring everything on this Mac up to main (runs automatically too)
  ${c} bootstrap --server URL [--token TOKEN] [--reminders on|off] [--json]
                                    Non-interactive first run (used by the ${CH.appName} app)
  ${c} reminders                    Show the team's list → repo mappings + this Mac's on/off
  ${c} reminders on|off             Sync (or don't) from this Mac
  ${c} reminders add "<List>" "<owner/repo>"   Map a list for the whole team (admins)
  ${c} reminders remove "<List>"
  ${c} doctor                       Verify the whole chain
  ${c} ctx                          Print the live context digest for the current repo
  ${c} send                         (internal — invoked by hooks)
`);
