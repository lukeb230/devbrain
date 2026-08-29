// ============================================================================
// First-run setup + the in-app Reminders collector.
//
// The app is the package: open it once, sign in inside the panel, click
// "Set up this Mac". The panel page then calls, in order:
//   setup_state()                          — is this Mac configured? where's node?
//                                            did the last bootstrap succeed?
//   bootstrap(server, token?, list?, repo?)— write ~/.devbrain/config.json
//                                            (token optional once one exists),
//                                            fetch ~/.devbrain/src (tarball,
//                                            no git), run `devbrain bootstrap
//                                            --json` and parse its summary
//   run_collector_now()                    — first Reminders read → macOS
//                                            prompts "DevBrain would like to
//                                            access Reminders"
// Notifications are requested by notify.rs when the page asks.
//
// The collector then runs every 3 minutes from a thread in this process, so
// the Reminders permission stays attached to DevBrain.app (never a launchd
// job or a terminal). Node comes from the bundle (Resources/node/bin/node).
// ============================================================================

use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Manager};

const SOURCE_REPO: &str = "lukeb230/devbrain";
const COLLECT_EVERY_SECS: u64 = 180;
fn log_path() -> &'static str {
    if is_beta() { "/tmp/devbrain-beta-reminders.log" } else { "/tmp/devbrain-reminders.log" }
}

fn home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/tmp".into()))
}
pub const CHANNEL: &str = env!("DEVBRAIN_CHANNEL");
pub fn is_beta() -> bool {
    CHANNEL == "beta"
}
pub fn app_name() -> &'static str {
    if is_beta() { "DevBrain Beta" } else { "DevBrain" }
}
fn devbrain_dir() -> PathBuf {
    home().join(if is_beta() { ".devbrain-beta" } else { ".devbrain" })
}
fn config_path() -> PathBuf {
    devbrain_dir().join("config.json")
}
fn src_dir() -> PathBuf {
    devbrain_dir().join("src")
}
fn cli_path() -> PathBuf {
    src_dir().join("cli").join("bin").join("devbrain.mjs")
}

/// The Node binary to use: bundled in the app, else ~/.devbrain/bin/node,
/// else whatever `node` is on PATH.
pub fn node_path(app: &AppHandle) -> String {
    if let Ok(dir) = app.path().resource_dir() {
        let p = dir.join("node").join("bin").join("node");
        if p.exists() {
            return p.to_string_lossy().into_owned();
        }
    }
    let linked = devbrain_dir().join("bin").join("node");
    if linked.exists() {
        return linked.to_string_lossy().into_owned();
    }
    "node".into()
}

fn read_config() -> Option<serde_json::Value> {
    let text = fs::read_to_string(config_path()).ok()?;
    serde_json::from_str(&text).ok()
}

#[derive(Serialize)]
pub struct SetupState {
    configured: bool,
    node: String,
    node_ok: bool,
    hostname: String,
    app_version: String,
    source_present: bool,
    /// A token is already in config.json — bootstrap can run without minting one.
    has_token: bool,
    /// Outcome of the last `devbrain bootstrap`/`update` (None = never recorded).
    bootstrap_ok: Option<bool>,
    bootstrap_failed: Vec<String>,
    bootstrap_at: Option<String>,
    /// Running from /Applications (or ~/Applications). From a DMG or
    /// ~/Downloads the bundled node path everything links to would vanish.
    in_applications: bool,
    reminders_on: bool,
}

pub fn reminders_on(cfg: &serde_json::Value) -> bool {
    match cfg.get("reminders") {
        Some(serde_json::Value::Bool(b)) => *b,
        Some(serde_json::Value::Array(a)) => !a.is_empty(), // legacy shape, migrated by the CLI
        _ => false,
    }
}

fn in_applications(app: &AppHandle) -> bool {
    if cfg!(debug_assertions) {
        return true; // `tauri dev` runs from target/
    }
    let Ok(dir) = app.path().resource_dir() else { return false };
    let user_apps = home().join("Applications");
    dir.starts_with("/Applications/") || dir.starts_with(&user_apps)
}

#[tauri::command]
pub fn setup_state(app: AppHandle) -> SetupState {
    let cfg = read_config();
    let node = node_path(&app);
    let node_ok = Command::new(&node).arg("-v").output().map(|o| o.status.success()).unwrap_or(false);
    let hostname = Command::new("scutil")
        .args(["--get", "ComputerName"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "this-mac".into());
    let has_token = cfg.as_ref().map(|c| c.get("token").and_then(|t| t.as_str()).map(|t| !t.is_empty()).unwrap_or(false)).unwrap_or(false);
    let bootstrap_ok = cfg.as_ref().and_then(|c| c.get("bootstrap_ok").and_then(|b| b.as_bool()));
    SetupState {
        // "Configured" means the whole stack is present: a token AND the CLI
        // checkout AND the last bootstrap did not record a failure. A Mac
        // onboarded by hand (config only, no ~/.devbrain/src) or one whose
        // plugin install failed gets the setup screen (again) so it can be
        // finished. Configs from before bootstrap_ok existed count as ok.
        configured: has_token && cli_path().exists() && bootstrap_ok != Some(false),
        node,
        node_ok,
        hostname,
        app_version: app.package_info().version.to_string(),
        source_present: cli_path().exists(),
        has_token,
        bootstrap_ok,
        bootstrap_failed: cfg.as_ref().and_then(|c| c.get("bootstrap_failed").and_then(|f| f.as_array()))
            .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect()).unwrap_or_default(),
        bootstrap_at: cfg.as_ref().and_then(|c| c.get("bootstrap_at").and_then(|v| v.as_str()).map(String::from)),
        in_applications: in_applications(&app),
        reminders_on: cfg.as_ref().map(reminders_on).unwrap_or(false),
    }
}

/// Fetch ~/.devbrain/src as a tarball of main (no git needed). Mirrors
/// fetchSourceTarball() in the CLI; only used before the CLI exists locally.
fn fetch_source() -> Result<(), String> {
    let tmp = std::env::temp_dir().join(format!("devbrain-src-{}", std::process::id()));
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    let tgz = tmp.join("src.tgz");
    let url = format!("https://codeload.github.com/{SOURCE_REPO}/tar.gz/main");
    let dl = Command::new("curl").args(["-fsSL", "-o"]).arg(&tgz).arg(&url).output().map_err(|e| e.to_string())?;
    if !dl.status.success() {
        return Err(format!("download failed: {}", String::from_utf8_lossy(&dl.stderr).trim()));
    }
    let ex = Command::new("tar").arg("-xzf").arg(&tgz).arg("-C").arg(&tmp).output().map_err(|e| e.to_string())?;
    if !ex.status.success() {
        return Err(format!("extract failed: {}", String::from_utf8_lossy(&ex.stderr).trim()));
    }
    let extracted = fs::read_dir(&tmp)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .find(|p| p.join("cli").join("bin").join("devbrain.mjs").exists())
        .ok_or("tarball did not contain the CLI")?;
    let dst = src_dir();
    let old = devbrain_dir().join("src.old");
    let _ = fs::remove_dir_all(&old);
    if dst.exists() {
        fs::rename(&dst, &old).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(devbrain_dir()).map_err(|e| e.to_string())?;
    fs::rename(&extracted, &dst).map_err(|e| e.to_string())?;
    let _ = fs::remove_dir_all(&old);
    let _ = fs::remove_dir_all(&tmp);
    // Record the sha so `devbrain update` knows what it has.
    if let Ok(o) = Command::new("curl").args(["-fsSL", "-H", "Accept: application/vnd.github+json"])
        .arg(format!("https://api.github.com/repos/{SOURCE_REPO}/commits/main")).output()
    {
        if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&o.stdout) {
            if let Some(sha) = v.get("sha").and_then(|s| s.as_str()) {
                let _ = fs::write(dst.join(".devbrain-sha"), sha);
            }
        }
    }
    Ok(())
}

#[derive(Serialize, Default)]
pub struct BootstrapResult {
    ok: bool,
    /// Nothing usable was installed (offline, node broken, not in /Applications).
    fatal: bool,
    /// Names of the parts that failed, e.g. ["plugin"]; see `steps` for codes.
    failed: Vec<String>,
    /// Per-part {ok, msg, code?} from the CLI's DEVBRAIN_SUMMARY line.
    steps: serde_json::Value,
    log: String,
    exit_code: Option<i32>,
}

/// First-run install (and re-run from Settings). Runs on a blocking task;
/// returns the CLI's per-part summary so the panel can say exactly what
/// failed. `token` may be None when config.json already has one.
#[tauri::command]
pub async fn bootstrap(
    app: AppHandle,
    server: String,
    token: Option<String>,
    reminders_list: Option<String>,
    reminders_repo: Option<String>,
) -> BootstrapResult {
    let node = node_path(&app);
    if !in_applications(&app) {
        let from = app.path().resource_dir().map(|d| d.display().to_string()).unwrap_or_default();
        return BootstrapResult {
            fatal: true, failed: vec!["location".into()],
            log: format!("✗ Move {} to your Applications folder first (it is running from {from}), then open it again and click Set up.\n", app_name()),
            ..Default::default()
        };
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut log = String::new();
        if !cli_path().exists() {
            log.push_str("→ fetching DevBrain source…\n");
            if let Err(e) = fetch_source() {
                return BootstrapResult { fatal: true, failed: vec!["source".into()], log: log + &format!("✗ {e}\n"), ..Default::default() };
            }
        }
        let mut args: Vec<String> = vec![
            cli_path().to_string_lossy().into_owned(),
            "bootstrap".into(),
            "--json".into(),
            "--server".into(), server,
        ];
        if let Some(t) = token.filter(|t| !t.trim().is_empty()) {
            args.push("--token".into()); args.push(t);
        }
        match (reminders_list.filter(|s| !s.trim().is_empty()), reminders_repo.filter(|s| !s.trim().is_empty())) {
            (Some(l), Some(r)) => { args.push("--reminders".into()); args.push(l); args.push("--repo".into()); args.push(r); }
            (Some(flag), None) if flag == "on" || flag == "off" => { args.push("--reminders".into()); args.push(flag); }
            _ => {}
        }
        log.push_str("→ running devbrain bootstrap…\n");
        match Command::new(&node).args(&args).env("HOME", home()).env("DEVBRAIN_HOME", devbrain_dir()).output() {
            Ok(o) => {
                let stdout = String::from_utf8_lossy(&o.stdout);
                // The summary line is the contract; the exit code is the fallback.
                let summary = stdout.lines().rev().find_map(|l| l.strip_prefix("DEVBRAIN_SUMMARY "))
                    .and_then(|j| serde_json::from_str::<serde_json::Value>(j).ok());
                for l in stdout.lines().filter(|l| !l.starts_with("DEVBRAIN_SUMMARY ")) {
                    log.push_str(l); log.push('\n');
                }
                if !o.status.success() {
                    log.push_str(&String::from_utf8_lossy(&o.stderr));
                }
                let exit_code = o.status.code();
                match summary {
                    Some(sm) => BootstrapResult {
                        ok: sm.get("ok").and_then(|b| b.as_bool()).unwrap_or(false),
                        fatal: false,
                        failed: sm.get("failed").and_then(|f| f.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect()).unwrap_or_default(),
                        steps: sm.get("steps").cloned().unwrap_or(serde_json::Value::Null),
                        log, exit_code,
                    },
                    None => BootstrapResult {
                        ok: o.status.success(), fatal: !o.status.success(),
                        failed: if o.status.success() { vec![] } else { vec!["bootstrap".into()] },
                        log, exit_code, ..Default::default()
                    },
                }
            }
            Err(e) => BootstrapResult { fatal: true, failed: vec!["node".into()], log: log + &format!("✗ could not run node ({node}): {e}\n"), ..Default::default() },
        }
    })
    .await
    .unwrap_or_else(|_| BootstrapResult { fatal: true, failed: vec!["task".into()], log: "task failed".into(), ..Default::default() })
}

/// One collector pass: `collect.mjs --auto` asks the server which lists the
/// team mapped, syncs the ones visible on this Mac, and reports the rest.
/// Runs only when this Mac has Reminders sync switched on (config.reminders).
fn collect_all(node: &str) -> Vec<String> {
    let Some(cfg) = read_config() else { return vec![] };
    let on = reminders_on(&cfg);
    let collect = src_dir().join("tools").join("reminders-sync").join("collect.mjs");
    if !on || !collect.exists() {
        return vec![];
    }
    let res = Command::new(node)
        .arg(&collect)
        .arg("--auto")
        .env("HOME", home())
        .env("DEVBRAIN_HOME", devbrain_dir())
        .output();
    let lines: Vec<String> = match res {
        Ok(o) => {
            let mut v: Vec<String> = String::from_utf8_lossy(&o.stdout).lines().map(String::from).collect();
            if !o.status.success() {
                v.extend(String::from_utf8_lossy(&o.stderr).lines().map(|l| format!("[{}] {l}", chrono_now())));
            }
            v
        }
        Err(e) => vec![format!("[{}] could not run collector: {e}", chrono_now())],
    };
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(log_path()) {
        for l in &lines { let _ = writeln!(f, "{l}"); }
    }
    lines
}

fn chrono_now() -> String {
    // ISO-ish UTC timestamp without pulling in chrono.
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    format!("{secs}")
}

/// Run the collector immediately (first-run: triggers the Reminders prompt).
#[tauri::command]
pub async fn run_collector_now(app: AppHandle) -> Vec<String> {
    let node = node_path(&app);
    tauri::async_runtime::spawn_blocking(move || collect_all(&node)).await.unwrap_or_default()
}

/// Background loop: every 3 minutes, sync every configured list.
pub fn spawn_collector(app: AppHandle) {
    std::thread::spawn(move || {
        // Let the app settle (and the first-run flow finish) before the first pass.
        std::thread::sleep(std::time::Duration::from_secs(20));
        loop {
            let node = node_path(&app);
            let _ = collect_all(&node);
            std::thread::sleep(std::time::Duration::from_secs(COLLECT_EVERY_SECS));
        }
    });
}

/// Open a link in the user's real browser. The panel is a remote page, so
/// only http(s) is allowed through — never file:// or a custom scheme.
/// `target="_blank"` in the webview asks for a new window, which this shell
/// deliberately never creates, so every outward link comes through here.
#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let ok = url.starts_with("https://") || url.starts_with("http://");
    if !ok {
        return Err("only http(s) links can be opened".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Sign-in handoff, step 1: open the site's device-login page in the user's
/// real browser (already logged in to GitHub there). It comes back through
/// the app's URL scheme — see `handle_deep_link`.
#[tauri::command]
pub fn start_browser_login(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let url = format!("{}/auth/device/start?channel={}", crate::SITE, CHANNEL);
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Sign-in handoff, step 2: `devbrain[-beta]://login?token=…` arrives from
/// the browser; load the site's device-login route INSIDE the panel so the
/// session lands in the panel's cookie jar, then show the panel.
pub fn handle_deep_link(app: &AppHandle, urls: &[tauri::Url]) {
    for u in urls {
        if u.host_str() != Some("login") {
            continue;
        }
        let Some(token) = u.query_pairs().find(|(k, _)| k == "token").map(|(_, v)| v.into_owned()) else { continue };
        if let Some(panel) = app.get_webview_window("panel") {
            let target = format!("{}/auth/device?token={}", crate::SITE, token);
            let _ = panel.eval(&format!("window.location.replace({:?})", target));
            let _ = panel.show();
            let _ = panel.set_focus();
        }
    }
}
