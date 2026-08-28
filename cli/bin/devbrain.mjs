#!/usr/bin/env node
// ============================================================================
// devbrain CLI — installer, updater, and hook helper for a teammate's Mac.
//
//   devbrain setup       — first run: token, plugin, jobs, widget
//   devbrain update      — bring everything on this Mac up to main
//   devbrain reminders   — add / list / remove synced Reminders lists
//   devbrain doctor      — verify the whole chain
//   devbrain ctx         — print the context digest for the current repo
//   devbrain send        — internal: post one event (used by hooks)
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

// The repo everything is installed from. When the repo goes private this is
// the one place the updater needs credentials — see docs/PRIVATE-REPO.md.
const SOURCE_REPO = "lukeb230/devbrain";
const DEFAULT_SERVER = "https://devbrain.vercel.app";
const MARKETPLACE = "devbrain-marketplace";
const PLUGIN = "devbrain";

const HOME = homedir();
const CONFIG_DIR = join(HOME, ".devbrain");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
const SRC_DIR = join(CONFIG_DIR, "src");
const BIN_DIR = join(CONFIG_DIR, "bin");
const AGENTS_DIR = join(HOME, "Library", "LaunchAgents");
const CLAUDE_SETTINGS = join(HOME, ".claude", "settings.json");
const WIDGET_APP = "/Applications/DevBrain.app";
// Node shipped inside the widget bundle (widget/scripts/fetch-node.sh). When
// present it is the ONLY runtime a teammate needs; ~/.devbrain/bin/node links
// to it so hooks, the MCP server and launchd jobs all find "node".
const BUNDLED_NODE = join(WIDGET_APP, "Contents", "Resources", "node", "bin", "node");
const SRC_SHA_FILE = join(SRC_DIR, ".devbrain-sha");
const SELF = fileURLToPath(import.meta.url);
// The checkout this CLI is running from (~/.devbrain/src, or a dev clone).
const REPO_ROOT = resolve(dirname(SELF), "..", "..");

const cmd = process.argv[2];
const flags = new Set(process.argv.slice(3).filter((a) => a.startsWith("--")));
const QUIET = flags.has("--quiet");
const log = (m) => { if (!QUIET) console.log(m); };

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    console.error("Not configured. Run: devbrain setup");
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
    if (r.status !== 0) return `pull failed (${r.stderr.trim().split("\n").pop()})`;
    const after = sh("git rev-parse HEAD", { cwd: SRC_DIR });
    return before === after ? "up to date" : `updated ${before.slice(0, 7)} → ${after.slice(0, 7)}`;
  }
  const sha = headSha();
  if (!sha) return existsSync(SRC_DIR) ? "offline — kept current source" : "offline — cannot fetch source";
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
  const wrapper = join(BIN_DIR, "devbrain");
  const content = `#!/bin/sh
# DevBrain CLI wrapper — installed by devbrain setup. Order: the Node bundled
# with the DevBrain app, then the node on PATH, then the one that ran setup.
NODE="$HOME/.devbrain/bin/node"
[ -x "$NODE" ] || NODE="$(command -v node 2>/dev/null || true)"
[ -x "$NODE" ] || NODE="${process.execPath}"
exec "$NODE" "${join(SRC_DIR, "cli", "bin", "devbrain.mjs")}" "$@"
`;
  const same = existsSync(wrapper) && readFileSync(wrapper, "utf8") === content;
  if (!same) { writeFileSync(wrapper, content); chmodSync(wrapper, 0o755); changed = true; }
  const rc = join(HOME, process.env.SHELL?.endsWith("zsh") ? ".zshrc" : ".bash_profile");
  const line = 'export PATH="$HOME/.devbrain/bin:$PATH"  # devbrain';
  const rcText = existsSync(rc) ? readFileSync(rc, "utf8") : "";
  if (!rcText.includes("# devbrain")) writeFileSync(rc, rcText + (rcText.endsWith("\n") || !rcText ? "" : "\n") + line + "\n");
  return changed ? `installed${bundled ? " (node → bundled)" : ""}` : "ok";
}

// 3. Claude Code plugin via the marketplace in this repo.
//    The `claude` CLI is not always on PATH for background processes (launchd,
//    the desktop app's hooks), so look in the usual install spots too.
function findClaude() {
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
function updatePlugin() {
  CLAUDE = findClaude();
  if (!CLAUDE) return "claude CLI not found (PATH, ~/.local/bin, ~/.claude/local, app bundle) — skipped";
  const mp = claude(["plugin", "marketplace", "list"]);
  if (!(mp.stdout + mp.stderr).includes(MARKETPLACE)) {
    const a = claude(["plugin", "marketplace", "add", SOURCE_REPO]);
    if (a.status !== 0) return `marketplace add failed: ${(a.stderr || a.stdout).trim().split("\n").pop()}`;
  } else {
    claude(["plugin", "marketplace", "update", MARKETPLACE]);
  }
  const installed = claude(["plugin", "list"]).stdout;
  const wantVer = JSON.parse(readFileSync(join(REPO_ROOT, "plugin", ".claude-plugin", "plugin.json"), "utf8")).version;
  const m = installed.match(new RegExp(`${PLUGIN}@${MARKETPLACE}\\s+Version:\\s*(\\S+)`));
  const haveVer = m ? m[1] : null;
  if (!haveVer) {
    const r = claude(["plugin", "install", `${PLUGIN}@${MARKETPLACE}`]);
    return r.status === 0 ? `installed ${wantVer}` : `install failed: ${(r.stderr || r.stdout).trim().split("\n").pop()}`;
  }
  if (haveVer === wantVer) return `${haveVer} up to date`;
  const r = claude(["plugin", "update", `${PLUGIN}@${MARKETPLACE}`, "-y"]);
  return r.status === 0
    ? `${haveVer} → ${wantVer} (applies to new Claude sessions)`
    : `update failed: ${(r.stderr || r.stdout).trim().split("\n").pop()}`;
}

// 4. Reminders sync is run by the DevBrain app itself (every 3 min while it
//    runs) — that keeps the macOS Reminders permission attached to the app,
//    so the first-run prompt is the only one anyone ever sees. The CLI just
//    manages the list in config.json and retires the old launchd jobs.
function updateReminderJobs(cfg) {
  const lists = Array.isArray(cfg.reminders) ? cfg.reminders : [];
  let retired = 0;
  for (const f of existsSync(AGENTS_DIR) ? readdirSync(AGENTS_DIR) : []) {
    const label = f.replace(/\.plist$/, "");
    if (label === "com.devbrain.reminders" || label.startsWith("com.devbrain.reminders.")) { removeJob(label); retired++; }
  }
  const appOk = existsSync(WIDGET_APP);
  const base = lists.length
    ? `${lists.map((l) => `${l.list} → ${l.repo}`).join("; ")} (run by the DevBrain app${appOk ? "" : " — app not installed!"})`
    : "none configured";
  return retired ? `${base}; retired ${retired} launchd job(s)` : base;
}

// 5. Daily self-update job (also fires on wake if a run was missed).
function updateUpdaterJob() {
  const xml = plistXml("com.devbrain.update",
    [bundledNode() ?? process.execPath, join(SRC_DIR, "cli", "bin", "devbrain.mjs"), "update", "--quiet"],
    `  <key>StartInterval</key><integer>86400</integer>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>/tmp/devbrain-update.log</string>
  <key>StandardErrorPath</key><string>/tmp/devbrain-update.log</string>`);
  return ensureJob("com.devbrain.update", xml);
}

// 6. Widget: install/replace /Applications/DevBrain.app when the checkout's
//    widget version is newer than what is installed. The build comes from the
//    widget-v<version> GitHub Release produced by .github/workflows.
function installedWidgetVersion() {
  if (!existsSync(WIDGET_APP)) return null;
  const r = run("defaults", ["read", join(WIDGET_APP, "Contents", "Info.plist"), "CFBundleShortVersionString"]);
  return r.status === 0 ? r.stdout.trim() : "unknown";
}
async function updateWidget() {
  const confPath = join(SRC_DIR, "widget", "src-tauri", "tauri.conf.json");
  if (!existsSync(confPath)) return "no widget in checkout";
  const want = JSON.parse(readFileSync(confPath, "utf8")).version;
  const have = installedWidgetVersion();
  if (have === want) return `${have} up to date`;

  const url = `https://github.com/${SOURCE_REPO}/releases/download/widget-v${want}/DevBrain.app.zip`;
  const res = await fetch(url, { redirect: "follow" }).catch((e) => ({ ok: false, status: e.message }));
  if (!res.ok) {
    return res.status === 404
      ? `${want} not released yet (installed: ${have ?? "none"}) — CI builds it on the next widget push`
      : `download failed (${res.status})`;
  }
  const tmp = join(tmpdir(), `devbrain-widget-${want}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const zip = join(tmp, "DevBrain.app.zip");
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  // ditto preserves bundle metadata; xattr clears Gatekeeper quarantine on
  // the unsigned build so no "unidentified developer" dialog appears.
  if (run("ditto", ["-x", "-k", zip, tmp]).status !== 0) return "unzip failed";
  const app = join(tmp, "DevBrain.app");
  if (!existsSync(app)) return "zip did not contain DevBrain.app";
  run("xattr", ["-dr", "com.apple.quarantine", app]);

  // The bundle's binary is devbrain-widget, not DevBrain — match on the
  // bundle path so the check survives renames.
  const wasRunning = run("pgrep", ["-f", `${WIDGET_APP}/Contents/MacOS/`]).status === 0;
  if (wasRunning) {
    run("osascript", ["-e", 'tell application "DevBrain" to quit']);
    run("pkill", ["-f", `${WIDGET_APP}/Contents/MacOS/`]);
  }
  rmSync(WIDGET_APP, { recursive: true, force: true });
  if (run("ditto", [app, WIDGET_APP]).status !== 0) return "could not copy into /Applications";
  rmSync(tmp, { recursive: true, force: true });
  if (wasRunning || !have) run("open", ["-a", WIDGET_APP]);
  return `${have ?? "none"} → ${want} installed${wasRunning ? " and relaunched" : ""}`;
}

// ----------------------------------------------------------------------------
// update — reconcile every part. Never prompts; with --quiet never exits
// non-zero, so hooks and launchd can call it blindly.
// ----------------------------------------------------------------------------
async function updateAll({ skipSource = false } = {}) {
  const cfg = loadConfig();
  const results = {};
  const step = async (name, fn) => {
    try { results[name] = await fn(); }
    catch (e) { results[name] = `FAILED: ${e.message.split("\n")[0]}`; }
  };

  if (!skipSource) {
    await step("source", updateSource);
    // If the CLI itself changed, hand off to the new one so the rest of this
    // run uses current code. Guarded against loops.
    const runningFromSrc = SELF.startsWith(SRC_DIR + "/");
    if (runningFromSrc && /updated|cloned|installed/.test(results.source) && !process.env.DEVBRAIN_REEXEC) {
      const r = spawnSync(process.execPath, [SELF, "update", "--no-source", ...(QUIET ? ["--quiet"] : [])], {
        stdio: "inherit", env: { ...process.env, DEVBRAIN_REEXEC: "1" },
      });
      log(`  source    ${results.source}`);
      process.exit(QUIET ? 0 : r.status ?? 0);
    }
  }
  await step("cli", installWrapper);
  await step("hooks", () => (removeLegacyHooks() ? "legacy CLI hooks removed (plugin owns presence)" : "ok"));
  await step("plugin", updatePlugin);
  await step("reminders", () => updateReminderJobs(cfg));
  await step("updater", updateUpdaterJob);
  await step("widget", updateWidget);

  writeFileSync(join(CONFIG_DIR, "last-update"), new Date().toISOString());
  const pad = (s) => (s + "         ").slice(0, 10);
  for (const [k, v] of Object.entries(results)) log(`  ${pad(k)}${v}`);
  const failed = Object.values(results).some((v) => String(v).startsWith("FAILED"));
  if (failed && !QUIET) process.exit(1);
}

// One-off collector run in the foreground (terminal installs). The app owns
// the sync and asks for Reminders access itself on first run; this just
// checks the list name resolves and the server accepts the post.
function primeRemindersPermission(list, repo) {
  const collect = join(existsSync(SRC_DIR) ? SRC_DIR : REPO_ROOT, "tools", "reminders-sync", "collect.mjs");
  console.log(`\n→ Reading "${list}" once. If macOS asks to allow access to Reminders, click Allow.`);
  const r = spawnSync(process.execPath, [collect, list, repo], { stdio: "inherit" });
  if (r.status !== 0) {
    console.log(`! The collector failed. Fix the error above, then run:  devbrain reminders add "${list}" "${repo}"`);
    return false;
  }
  return true;
}

// ============================================================================
// Commands
// ============================================================================

if (cmd === "setup" || cmd === "init") {
  if (cmd === "init") console.log("(`devbrain init` is now `devbrain setup`)");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let cfg = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, "utf8")) : {};
  if (!cfg.server || !cfg.token || flags.has("--reconfigure")) {
    const server = (await rl.question(`DevBrain server URL [${cfg.server || DEFAULT_SERVER}]: `)).trim();
    const token = (await rl.question("Your dev token (dashboard → Tokens, shown once): ")).trim();
    cfg.server = server || cfg.server || DEFAULT_SERVER;
    if (token) cfg.token = token;
    if (!cfg.token) { console.error("A dev token is required."); process.exit(1); }
    saveConfig(cfg);
    console.log(`✓ Saved ${CONFIG_PATH}`);
  }
  cfg.reminders = cfg.reminders || [];
  if (cfg.reminders.length === 0) {
    const list = (await rl.question('Shared Reminders list to sync (blank to skip): ')).trim();
    if (list) {
      const repo = (await rl.question(`GitHub repo that list feeds (owner/name): `)).trim();
      rl.close();
      cfg.reminders.push({ list, repo }); saveConfig(cfg);
      primeRemindersPermission(list, repo);
    } else rl.close();
  } else rl.close();

  console.log("\n→ Installing / updating everything on this Mac…");
  await updateAll();
  console.log(`
✓ Done. Open a NEW terminal (or run: source ~/.zshrc) so \`devbrain\` is on your PATH.
  Everything updates itself from main daily and whenever a Claude Code session starts.
  Check any time with:  devbrain doctor`);
  process.exit(0);
}

// Non-interactive first-run used by the DevBrain app: writes config, then
// reconciles everything. Prints the per-part summary like `update`.
//   devbrain bootstrap --server URL --token TOKEN [--reminders "List" --repo owner/name]
if (cmd === "bootstrap") {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  const cfg = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, "utf8")) : {};
  cfg.server = (arg("--server") || cfg.server || DEFAULT_SERVER).replace(/\/$/, "");
  if (arg("--token")) cfg.token = arg("--token");
  if (!cfg.token) { console.error("bootstrap: --token required"); process.exit(1); }
  cfg.reminders = Array.isArray(cfg.reminders) ? cfg.reminders : [];
  const list = arg("--reminders"), repo = arg("--repo");
  if (list && repo && !cfg.reminders.some((l) => l.list === list)) cfg.reminders.push({ list, repo });
  saveConfig(cfg);
  await updateAll();
  process.exit(0);
}

if (cmd === "update") {
  await updateAll({ skipSource: flags.has("--no-source") });
  process.exit(0);
}

if (cmd === "reminders") {
  const sub = process.argv[3];
  const cfg = loadConfig();
  cfg.reminders = cfg.reminders || [];
  if (sub === "add") {
    const [list, repo] = process.argv.slice(4);
    if (!list || !repo) { console.error('usage: devbrain reminders add "<List Name>" "<owner/repo>"'); process.exit(1); }
    cfg.reminders = cfg.reminders.filter((l) => l.list !== list);
    cfg.reminders.push({ list, repo });
    saveConfig(cfg);
    console.log(`  reminders ${updateReminderJobs(cfg)}`);
    process.exit(0);
  }
  if (sub === "remove") {
    const list = process.argv[4];
    cfg.reminders = cfg.reminders.filter((l) => l.list !== list);
    saveConfig(cfg);
    console.log(`  reminders ${updateReminderJobs(cfg)}`);
    process.exit(0);
  }
  if (cfg.reminders.length === 0) console.log("No Reminders lists configured. Add one: devbrain reminders add \"<List>\" \"<owner/repo>\"");
  for (const l of cfg.reminders) {
    const appRunning = run("pgrep", ["-f", `${WIDGET_APP}/Contents/MacOS/`]).status === 0;
    console.log(`  ${appRunning ? "✓" : "✗"} "${l.list}" → ${l.repo}  (every 3 min while the DevBrain app runs; log: /tmp/devbrain-reminders.log)`);
  }
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
      const ctx = await res.json();
      console.log("## Team context (DevBrain)");
      console.log(JSON.stringify(ctx, null, 2));
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
    catch { bad("config", "exists but is not valid JSON — re-run: devbrain setup"); }
  } else bad("config", "missing — run: devbrain setup");

  if (cfg?.server && cfg?.token) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${cfg.server}/api/v1/context`, { headers: { Authorization: `Bearer ${cfg.token}` }, signal: ctrl.signal });
      clearTimeout(t);
      if (res.status === 401) bad("auth", "token rejected — create a new one on the Tokens page, run: devbrain setup --reconfigure");
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
      }
    } catch { bad("agent tick", "health check failed"); }
  }

  if (existsSync(join(SRC_DIR, ".git"))) {
    let head = "?"; try { head = sh("git rev-parse --short HEAD", { cwd: SRC_DIR }); } catch { /* */ }
    ok("source checkout", `${SRC_DIR} @ ${head} (git)`);
  } else if (existsSync(join(SRC_DIR, "cli", "bin", "devbrain.mjs"))) {
    const sha = existsSync(SRC_SHA_FILE) ? readFileSync(SRC_SHA_FILE, "utf8").trim().slice(0, 7) : "?";
    ok("source checkout", `${SRC_DIR} @ ${sha}`);
  } else bad("source checkout", `${SRC_DIR} missing — run: devbrain setup`);
  const last = existsSync(join(CONFIG_DIR, "last-update")) ? readFileSync(join(CONFIG_DIR, "last-update"), "utf8").trim() : null;
  if (last) ok("last update", last); else bad("last update", "never — run: devbrain update");
  if (run("launchctl", ["list", "com.devbrain.update"]).status === 0) ok("daily updater job loaded");
  else bad("daily updater job", "not loaded — run: devbrain update");

  const repo = currentRepo();
  if (repo) {
    ok("repo detected", repo);
    if (cfg?.server && cfg?.token) {
      try {
        const res = await fetch(`${cfg.server}/api/v1/context?repo=${encodeURIComponent(repo)}`, { headers: { Authorization: `Bearer ${cfg.token}` } });
        if (res.ok) ok("repo linked in DevBrain");
        else bad("repo not linked", "install the GitHub App on it from the dashboard");
      } catch { /* covered above */ }
    }
  } else results.push("  · not inside a git repo (repo checks skipped)");

  if (existsSync(CLAUDE_SETTINGS)) {
    try {
      const s = JSON.parse(readFileSync(CLAUDE_SETTINGS, "utf8"));
      const legacy = Object.values(s.hooks || {}).flat().some((h) => /devbrain\.mjs send/.test(JSON.stringify(h)));
      if (legacy) bad("legacy CLI presence hooks", "still in ~/.claude/settings.json (double ingest) — run: devbrain update");
      else ok("presence hooks", "owned by the plugin");
    } catch { bad("~/.claude/settings.json", "unreadable"); }
  }

  CLAUDE = CLAUDE || findClaude();
  const pl = CLAUDE ? claude(["plugin", "list"]) : { status: 1, stdout: "" };
  if (pl.status !== 0) bad("claude CLI", "not found (PATH, ~/.local/bin, ~/.claude/local, app bundle)");
  else {
    const m = pl.stdout.match(new RegExp(`${PLUGIN}@${MARKETPLACE}\\s+Version:\\s*(\\S+)`));
    let want = "?"; try { want = JSON.parse(readFileSync(join(REPO_ROOT, "plugin", ".claude-plugin", "plugin.json"), "utf8")).version; } catch { /* */ }
    if (!m) bad("plugin", "not installed — run: devbrain update");
    else if (m[1] === want) ok("plugin", `${m[1]}`);
    else bad("plugin", `${m[1]} installed, ${want} on main — run: devbrain update, then restart Claude`);
  }

  for (const l of cfg?.reminders || []) {
    const appRunning = run("pgrep", ["-f", `${WIDGET_APP}/Contents/MacOS/`]).status === 0;
    if (appRunning) ok(`reminders sync "${l.list}"`, `→ ${l.repo} (run by the DevBrain app)`);
    else bad(`reminders sync "${l.list}"`, "the DevBrain app isn't running — open it (it syncs every 3 min while running)");
  }
  if (bundledNode()) ok("node", "bundled with the DevBrain app"); else results.push(`  · node — using ${process.execPath}`);
  const wv = installedWidgetVersion();
  let wantW = null; try { wantW = JSON.parse(readFileSync(join(REPO_ROOT, "widget", "src-tauri", "tauri.conf.json"), "utf8")).version; } catch { /* */ }
  if (!wv) bad("widget", "not installed — run: devbrain update (needs a published widget release)");
  else if (wv === wantW) ok("widget", `${wv}${run("pgrep", ["-f", `${WIDGET_APP}/Contents/MacOS/`]).status === 0 ? " (running)" : " (not running)"}`);
  else bad("widget", `${wv} installed, ${wantW} on main — run: devbrain update`);

  console.log("devbrain doctor\n" + results.join("\n"));
  process.exit(results.some((r) => r.includes("✗")) ? 1 : 0);
}

if (cmd === "ctx") {
  const config = loadConfig();
  const repo = currentRepo();
  if (!repo) { console.error("Not inside a git repo with a GitHub remote."); process.exit(1); }
  const res = await fetch(`${config.server}/api/v1/context?repo=${encodeURIComponent(repo)}`, {
    headers: { Authorization: `Bearer ${config.token}` },
  });
  console.log(JSON.stringify(await res.json(), null, 2));
  process.exit(0);
}

console.log(`devbrain — team second brain CLI

Usage:
  devbrain setup              First-time setup on this Mac (token, hooks, plugin, jobs, widget)
  devbrain update             Bring everything on this Mac up to main (runs automatically too)
  devbrain bootstrap          Non-interactive first run (used by the DevBrain app)
  devbrain reminders          Show synced Reminders lists
  devbrain reminders add "<List>" "<owner/repo>"
  devbrain reminders remove "<List>"
  devbrain doctor             Verify the whole chain
  devbrain ctx                Print the live context digest for the current repo
  devbrain send               (internal — invoked by hooks)
`);
