// ============================================================================
// First-run setup + the in-app Reminders collector.
//
// The app is the package: open it once, sign in inside the panel, click
// "Set up this Mac". The panel page then calls, in order:
//   setup_state()                          — is this Mac configured? where's node?
//   bootstrap(server, token, list?, repo?) — write ~/.devbrain/config.json,
//                                            fetch ~/.devbrain/src (tarball,
//                                            no git), run `devbrain update`
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

const SOURCE_REPO: &str = "lukeb230/devbrain-test";
const COLLECT_EVERY_SECS: u64 = 180;
const LOG_PATH: &str = "/tmp/devbrain-reminders.log";

fn home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/tmp".into()))
}
fn devbrain_dir() -> PathBuf {
    home().join(".devbrain")
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
    reminders: Vec<serde_json::Value>,
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
    SetupState {
        // "Configured" means the whole stack is present: a token AND the CLI
        // checkout. A Mac onboarded by hand (config only, no ~/.devbrain/src)
        // still gets the setup screen so the updater layer gets installed.
        configured: cfg.as_ref().map(|c| c.get("token").and_then(|t| t.as_str()).map(|t| !t.is_empty()).unwrap_or(false)).unwrap_or(false)
            && cli_path().exists(),
        node,
        node_ok,
        hostname,
        app_version: app.package_info().version.to_string(),
        source_present: cli_path().exists(),
        reminders: cfg.and_then(|c| c.get("reminders").and_then(|r| r.as_array().cloned())).unwrap_or_default(),
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

#[derive(Serialize)]
pub struct BootstrapResult {
    ok: bool,
    log: String,
}

/// First-run install. Runs on a blocking task; returns the CLI's summary.
#[tauri::command]
pub async fn bootstrap(
    app: AppHandle,
    server: String,
    token: String,
    reminders_list: Option<String>,
    reminders_repo: Option<String>,
) -> BootstrapResult {
    let node = node_path(&app);
    tauri::async_runtime::spawn_blocking(move || {
        let mut log = String::new();
        if !cli_path().exists() {
            log.push_str("→ fetching DevBrain source…\n");
            if let Err(e) = fetch_source() {
                return BootstrapResult { ok: false, log: log + &format!("✗ {e}\n") };
            }
        }
        let mut args: Vec<String> = vec![
            cli_path().to_string_lossy().into_owned(),
            "bootstrap".into(),
            "--server".into(), server,
            "--token".into(), token,
        ];
        if let (Some(l), Some(r)) = (reminders_list.filter(|s| !s.trim().is_empty()), reminders_repo.filter(|s| !s.trim().is_empty())) {
            args.push("--reminders".into()); args.push(l);
            args.push("--repo".into()); args.push(r);
        }
        log.push_str("→ running devbrain bootstrap…\n");
        match Command::new(&node).args(&args).env("HOME", home()).output() {
            Ok(o) => {
                log.push_str(&String::from_utf8_lossy(&o.stdout));
                if !o.status.success() {
                    log.push_str(&String::from_utf8_lossy(&o.stderr));
                    return BootstrapResult { ok: false, log };
                }
                BootstrapResult { ok: true, log }
            }
            Err(e) => BootstrapResult { ok: false, log: log + &format!("✗ could not run node ({node}): {e}\n") },
        }
    })
    .await
    .unwrap_or_else(|_| BootstrapResult { ok: false, log: "task failed".into() })
}

/// One collector pass for every configured list. Output appended to the
/// same log the old launchd job used.
fn collect_all(node: &str) -> Vec<String> {
    let Some(cfg) = read_config() else { return vec![] };
    let lists = cfg.get("reminders").and_then(|r| r.as_array()).cloned().unwrap_or_default();
    let collect = src_dir().join("tools").join("reminders-sync").join("collect.mjs");
    if lists.is_empty() || !collect.exists() {
        return vec![];
    }
    let mut out = Vec::new();
    for l in lists {
        let (Some(list), Some(repo)) = (l.get("list").and_then(|v| v.as_str()), l.get("repo").and_then(|v| v.as_str())) else { continue };
        let res = Command::new(node).arg(&collect).arg(list).arg(repo).env("HOME", home()).output();
        let line = match res {
            Ok(o) => {
                let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
                let e = String::from_utf8_lossy(&o.stderr).trim().to_string();
                if o.status.success() { s } else { format!("[{}] {list} → {repo}: FAILED {e}", chrono_now()) }
            }
            Err(e) => format!("[{}] {list} → {repo}: could not run collector: {e}", chrono_now()),
        };
        if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(LOG_PATH) {
            let _ = writeln!(f, "{line}");
        }
        out.push(line);
    }
    out
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
