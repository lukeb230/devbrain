// ============================================================================
// DevBrain corner widget — shell v2.
//
//   - Accessory app: NO Dock icon, no Cmd-Tab. Menu-bar icon only.
//   - A small invisible hot zone hugs the chosen BOTTOM CORNER (left or
//     right). Mouse into the corner → a round DevBrain badge pops in →
//     click → the panel opens out of that corner.
//   - Corner choice lives in the tray menu and persists across restarts.
//   - "Reload panel" tray item refreshes the webview after site deploys.
//   - The DESK: a normal, resizable window showing the site's /desk — the
//     full app. Hidden on close (never destroyed), remembers its bounds,
//     opened from the tray, from a panel row (open_desk command) or a
//     devbrain://desk/<route> link. "Show in Dock" flips the activation
//     policy at runtime and persists.
// ============================================================================

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use std::time::Instant;

use serde::{Deserialize, Serialize};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::{
    AppHandle, Emitter, Listener, LogicalPosition, LogicalSize, Manager, WebviewUrl,
    WebviewWindowBuilder,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use tauri_plugin_opener::OpenerExt;

mod notify;
mod setup;

// The site comes from the build (build.rs: DEVBRAIN_SITE), never a literal
// here — capabilities/remote.json is asserted to match at compile time.
pub const SITE: &str = env!("DEVBRAIN_SITE");
fn site_host() -> &'static str {
    SITE.trim_start_matches("https://").trim_start_matches("http://").split('/').next().unwrap_or("")
}
fn site_panel() -> String { format!("{SITE}/widget") }
fn site_desk(route: Option<&str>) -> String {
    // A route is a site path under /desk ("/", "/prs", "/board?x=1") — never a
    // full URL, so a deep link can't point the Desk somewhere else.
    let r = route.unwrap_or("/").trim();
    let r = if r.starts_with('/') { r.to_string() } else { format!("/{r}") };
    let r = if r == "/" { String::new() } else { r };
    format!("{SITE}/desk{r}")
}
const DESK_W: f64 = 1180.0;
const DESK_H: f64 = 760.0;
const DESK_MIN_W: f64 = 880.0;
const DESK_MIN_H: f64 = 560.0;

const ZONE_HOT: f64 = 58.0; // expanded to show the badge
const PANEL_W: f64 = 440.0;
const PANEL_H: f64 = 780.0;
const MARGIN: f64 = 6.0; // gap from screen edges for the panel
const BADGE_CLEAR: f64 = 64.0; // panel sits above the badge zone
const BADGE_RETREAT_MS: u64 = 260; // > the badge page's retreat transition

#[derive(Clone, Copy, PartialEq, Serialize, Deserialize)]
enum Corner {
    #[serde(rename = "bl")]
    BottomLeft,
    #[serde(rename = "br")]
    BottomRight,
}

#[derive(Clone, Copy, Serialize, Deserialize)]
struct Bounds { x: f64, y: f64, w: f64, h: f64 }

#[derive(Serialize, Deserialize)]
struct Settings {
    corner: Corner,
    /// Badge size as a fraction of ZONE_HOT (0.5 small · 0.75 medium · 1.0 large).
    #[serde(default = "default_badge_scale")]
    badge_scale: f64,
    /// Show a Dock icon (Regular activation policy). Default off: the
    /// menu-bar brain is home; the Desk is a window you summon.
    #[serde(default)]
    dock: bool,
    /// Last Desk window bounds (logical points), restored on next open.
    #[serde(default)]
    desk: Option<Bounds>,
}
fn default_badge_scale() -> f64 { 0.75 }

struct State {
    corner: Mutex<Corner>,
    badge_scale: Mutex<f64>,
    dock: Mutex<bool>,
    desk: Mutex<Option<Bounds>>,
    /// Something wants the user: the badge stays visible instead of only
    /// appearing on corner-hover. Set from the panel's "badge-state" event.
    attention: Mutex<bool>,
    pinned: Mutex<bool>,
    /// Tray check items the Desk's This Mac page also flips — kept here so
    /// a toggle from either place shows in both.
    tray_dock: Mutex<Option<CheckMenuItem<tauri::Wry>>>,
    tray_autostart: Mutex<Option<CheckMenuItem<tauri::Wry>>>,
    last_panel_hide: Mutex<Instant>,
    screen: Mutex<(f64, f64, f64, f64)>,
}

fn settings_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    let _ = std::fs::create_dir_all(&dir);
    Some(dir.join("settings.json"))
}

fn load_settings(app: &AppHandle) -> Settings {
    settings_path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<Settings>(&s).ok())
        .unwrap_or(Settings {
            // Beta defaults to the other corner so both channels can sit on one screen.
            corner: if setup::is_beta() { Corner::BottomLeft } else { Corner::BottomRight },
            badge_scale: default_badge_scale(),
            dock: false,
            desk: None,
        })
}

fn save_settings(app: &AppHandle) {
    let st = app.state::<State>();
    let settings = Settings {
        corner: *st.corner.lock().unwrap(),
        badge_scale: *st.badge_scale.lock().unwrap(),
        dock: *st.dock.lock().unwrap(),
        desk: *st.desk.lock().unwrap(),
    };
    if let Some(p) = settings_path(app) {
        let _ = std::fs::write(p, serde_json::to_string(&settings).unwrap_or_default());
    }
}

fn screen(app: &AppHandle) -> (f64, f64, f64, f64) {
    if let Ok(Some(m)) = app.primary_monitor() {
        let s = m.scale_factor();
        let size = m.size().to_logical::<f64>(s);
        let pos = m.position().to_logical::<f64>(s);
        (pos.x, pos.y, size.width, size.height)
    } else {
        (0.0, 0.0, 1440.0, 900.0)
    }
}

/// The part of the screen NOT covered by the Dock or the menu bar, in logical
/// points. macOS reports this per monitor and it tracks the user's Dock size,
/// position, and auto-hide state — so the panel can sit above the Dock
/// instead of behind it. Falls back to the full screen if unavailable.
fn work_area(app: &AppHandle) -> (f64, f64, f64, f64) {
    if let Ok(Some(m)) = app.primary_monitor() {
        let s = m.scale_factor();
        let wa = m.work_area();
        let size = wa.size.to_logical::<f64>(s);
        let pos = wa.position.to_logical::<f64>(s);
        (pos.x, pos.y, size.width, size.height)
    } else {
        screen(app)
    }
}

const PANEL_RADIUS: f64 = 14.0;

/// Round the panel's corners at the native layer. The panel shows a remote
/// page, so CSS on that page can't clip the window itself; the NSWindow's
/// content layer can. Needs a transparent, borderless window (set at build).
#[cfg(target_os = "macos")]
fn round_corners(win: &tauri::WebviewWindow, radius: f64) {
    use objc2_app_kit::{NSColor, NSWindow};
    let Ok(ptr) = win.ns_window() else { return };
    if ptr.is_null() {
        return;
    }
    // SAFETY: Tauri hands back the live NSWindow for this window; we only
    // call documented AppKit setters on it from the main thread.
    unsafe {
        let ns: &NSWindow = &*(ptr as *const NSWindow);
        ns.setOpaque(false);
        ns.setBackgroundColor(Some(&NSColor::clearColor()));
        if let Some(view) = ns.contentView() {
            view.setWantsLayer(true);
            if let Some(layer) = view.layer() {
                layer.setCornerRadius(radius);
                layer.setMasksToBounds(true);
            }
        }
        ns.setHasShadow(true);
        ns.invalidateShadow();
    }
}
#[cfg(not(target_os = "macos"))]
fn round_corners(_win: &tauri::WebviewWindow, _radius: f64) {}

fn place_badge(app: &AppHandle) {
    let st = app.state::<State>();
    let corner = *st.corner.lock().unwrap();
    let (sx, sy, sw, sh) = screen(app);
    *st.screen.lock().unwrap() = (sx, sy, sw, sh); // refresh the poller's cache
    let w = (ZONE_HOT * *st.badge_scale.lock().unwrap()).round();
    let x = match corner {
        Corner::BottomLeft => sx,
        Corner::BottomRight => sx + sw - w,
    };
    let y = sy + sh - w;
    if let Some(badge) = app.get_webview_window("strip") {
        let _ = badge.set_size(LogicalSize::new(w, w));
        let _ = badge.set_position(LogicalPosition::new(x, y));
    }
}

fn place_panel(app: &AppHandle) {
    let st = app.state::<State>();
    let corner = *st.corner.lock().unwrap();
    let (_, sy, _, sh) = screen(app);
    let (wx, wy, ww, wh) = work_area(app);
    // Bottom edge: above the Dock (work area) AND clear of the badge zone at
    // the true screen corner — whichever is higher. With the Dock hidden the
    // two coincide and the panel sits where it always did.
    let bottom = (sy + sh - BADGE_CLEAR).min(wy + wh - MARGIN);
    let top_limit = wy + MARGIN; // never under the menu bar
    let h = PANEL_H.min(bottom - top_limit);
    let x = match corner {
        Corner::BottomLeft => wx + MARGIN,
        Corner::BottomRight => wx + ww - PANEL_W - MARGIN,
    };
    let y = bottom - h;
    if let Some(panel) = app.get_webview_window("panel") {
        let _ = panel.set_size(LogicalSize::new(PANEL_W, h));
        let _ = panel.set_position(LogicalPosition::new(x, y));
    }
}

fn set_corner(app: &AppHandle, corner: Corner) {
    {
        let st = app.state::<State>();
        *st.corner.lock().unwrap() = corner;
    }
    save_settings(app);
    place_badge(app);
    place_panel(app);
    let _ = app.emit(
        "corner-changed",
        match corner {
            Corner::BottomLeft => "bl",
            Corner::BottomRight => "br",
        },
    );
}

fn set_badge_scale(app: &AppHandle, scale: f64) {
    {
        let st = app.state::<State>();
        *st.badge_scale.lock().unwrap() = scale;
    }
    save_settings(app);
    place_badge(app);
    // The badge page sizes itself from its window; nudge it after the resize.
    if let Some(b) = app.get_webview_window("strip") {
        let _ = b.emit("badge-scale", scale);
    }
}

// The corner watcher: a background thread polls the global cursor position
// (~12x/sec, no permissions needed) and shows/hides the badge window when
// the cursor enters/leaves the chosen corner. Deterministic — no reliance
// on webview hover events.
fn spawn_corner_watcher(app: AppHandle) {
    std::thread::spawn(move || {
        use mouse_position::mouse_position::Mouse;
        let mut visible = false;
        let mut hide_gen: u64 = 0;
        let hide_gen_shared = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
        loop {
            std::thread::sleep(std::time::Duration::from_millis(80));
            let (mx, my) = match Mouse::get_mouse_position() {
                Mouse::Position { x, y } => (x as f64, y as f64),
                Mouse::Error => continue,
            };
            let (corner, (sx, sy, sw, sh)) = {
                let st = app.state::<State>();
                let c = *st.corner.lock().unwrap();
                let scr = *st.screen.lock().unwrap();
                (c, scr)
            };
            let (cx, cy) = match corner {
                Corner::BottomLeft => (sx, sy + sh),
                Corner::BottomRight => (sx + sw, sy + sh),
            };
            let dx = (mx - cx).abs();
            let dy = (my - cy).abs();
            let attention = *app.state::<State>().attention.lock().unwrap();
            // While the panel is open the badge stays put — it is the panel's
            // close button. With attention on it is permanently visible (that
            // IS the signal). Otherwise it's the hover behaviour.
            let panel_open = app
                .get_webview_window("panel")
                .and_then(|p| p.is_visible().ok())
                .unwrap_or(false);
            let hold = attention || panel_open;
            let near = hold || (dx < 32.0 && dy < 32.0);
            let far = !hold && (dx > 140.0 || dy > 140.0);
            // Show: reveal the (transparent) window, then tell the page to
            // unfurl from the corner. Hide: tell the page to retreat first and
            // only hide the window once that animation has had time to play.
            // `gen` cancels a pending hide if the cursor comes straight back.
            if near && !visible {
                visible = true;
                hide_gen += 1;
                hide_gen_shared.store(hide_gen, std::sync::atomic::Ordering::SeqCst);
                let h = app.clone();
                let _ = app.run_on_main_thread(move || {
                    place_badge(&h);
                    if let Some(b) = h.get_webview_window("strip") {
                        let _ = b.show();
                        let _ = b.emit("badge-show", ());
                    }
                });
            } else if far && visible {
                visible = false;
                hide_gen += 1;
                let my_gen = hide_gen;
                let gen_ref = hide_gen_shared.clone();
                gen_ref.store(my_gen, std::sync::atomic::Ordering::SeqCst);
                let h = app.clone();
                let _ = app.run_on_main_thread(move || {
                    if let Some(b) = h.get_webview_window("strip") {
                        let _ = b.emit("badge-hide", ());
                    }
                });
                let h2 = app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(BADGE_RETREAT_MS));
                    // Still the same hide request? (a re-show bumps the gen)
                    if gen_ref.load(std::sync::atomic::Ordering::SeqCst) != my_gen {
                        return;
                    }
                    let h3 = h2.clone();
                    let _ = h2.run_on_main_thread(move || {
                        if let Some(b) = h3.get_webview_window("strip") {
                            let _ = b.hide();
                        }
                    });
                });
            }
        }
    });
}

#[tauri::command]
fn get_corner(app: AppHandle) -> String {
    let st = app.state::<State>();
    let corner = *st.corner.lock().unwrap();
    match corner {
        Corner::BottomLeft => "bl".to_string(),
        Corner::BottomRight => "br".to_string(),
    }
}

/// Show the Desk window (creating nothing — it exists hidden from launch) and
/// navigate it to the requested route. Called from the tray, from the panel
/// (a Needs-you row), and from devbrain://desk/… links.
pub fn show_desk(app: AppHandle, route: Option<String>) {
    let Some(desk) = app.get_webview_window("desk") else { return };
    let target = site_desk(route.as_deref());
    // The window loads /desk at launch (see setup), so its page is always
    // real and JS navigation works. A specific route replaces the location;
    // a plain "Open Desk" keeps whatever the user was looking at unless the
    // window got parked outside /desk (sign-in), in which case go home.
    // Never ask the webview for its URL — wry aborts on a nil URL.
    if route.is_some() {
        let _ = desk.eval(&format!("window.location.replace({:?})", target));
    } else {
        let _ = desk.eval(&format!(
            "if(!location.pathname.startsWith('/desk')){{window.location.replace({:?})}}",
            target
        ));
    }
    if let Some(b) = *app.state::<State>().desk.lock().unwrap() {
        let _ = desk.set_size(LogicalSize::new(b.w.max(DESK_MIN_W), b.h.max(DESK_MIN_H)));
        let _ = desk.set_position(LogicalPosition::new(b.x, b.y));
    }
    // While the Desk is open the app is a regular app: Dock icon, Cmd-Tab,
    // menu bar (Cmd-W, copy/paste). Closing the Desk returns to menu-bar-only
    // unless "Show in Dock" is on. The classic menu-bar-app pattern — and the
    // only one AppKit cooperates with: an Accessory app cannot reliably bring
    // a decorated window to the front.
    set_policy(&app, true);
    let _ = desk.show();
    let _ = desk.unminimize();
    let _ = desk.set_focus();
    // Hide the panel: the Desk is the bigger version of it.
    if let Some(p) = app.get_webview_window("panel") {
        if p.is_visible().unwrap_or(false) { let _ = p.hide(); }
    }
}

/// Regular (Dock icon) or Accessory (menu bar only), applied now.
fn set_policy(app: &AppHandle, regular: bool) {
    #[cfg(target_os = "macos")]
    {
        let policy = if regular { tauri::ActivationPolicy::Regular } else { tauri::ActivationPolicy::Accessory };
        let _ = app.set_activation_policy(policy);
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = (app, regular); }
}

/// The policy the app should have when the Desk is NOT showing: the user's
/// "Show in Dock" choice.
fn desk_hidden_policy(app: &AppHandle) {
    let show = app.try_state::<State>().map(|s| *s.dock.lock().unwrap()).unwrap_or(false);
    set_policy(app, show);
}

fn remember_desk_bounds(app: &AppHandle) {
    let Some(desk) = app.get_webview_window("desk") else { return };
    let (Ok(pos), Ok(size), Ok(scale)) = (desk.outer_position(), desk.inner_size(), desk.scale_factor()) else { return };
    let p = pos.to_logical::<f64>(scale);
    let s = size.to_logical::<f64>(scale);
    if s.width < 100.0 || s.height < 100.0 { return; } // minimised / hidden report nonsense
    *app.state::<State>().desk.lock().unwrap() = Some(Bounds { x: p.x, y: p.y, w: s.width, h: s.height });
    save_settings(app);
}

/// Regular = Dock icon + Cmd-Tab; Accessory = menu bar only. Applied at
/// launch from settings and flipped live from the tray. Note for notify.rs:
/// installing the notification delegate before the Accessory policy applies
/// would force a Dock icon — that ordering is preserved in setup().
fn apply_dock(app: &AppHandle, show: bool) {
    *app.state::<State>().dock.lock().unwrap() = show;
    save_settings(app);
    reassert_policy(app);
}

#[tauri::command]
fn open_desk(app: AppHandle, route: Option<String>) {
    show_desk(app, route);
}

/// The Mac-side preferences the Desk's This Mac page shows and flips.
#[derive(Serialize)]
struct MacPrefs { dock: bool, autostart: bool, reminders: bool, app_version: String, channel: &'static str }

fn mac_prefs_now(app: &AppHandle) -> MacPrefs {
    MacPrefs {
        dock: *app.state::<State>().dock.lock().unwrap(),
        autostart: app.autolaunch().is_enabled().unwrap_or(false),
        reminders: setup::reminders_flag(),
        app_version: app.package_info().version.to_string(),
        channel: if setup::is_beta() { "beta" } else { "stable" },
    }
}

#[tauri::command]
fn mac_prefs(app: AppHandle) -> MacPrefs {
    mac_prefs_now(&app)
}

/// Flip one preference from the Desk. Same effects as the tray items, and
/// the tray check marks follow.
#[tauri::command]
fn set_mac_pref(app: AppHandle, key: String, on: bool) -> Result<MacPrefs, String> {
    match key.as_str() {
        "dock" => {
            apply_dock(&app, on);
            if let Some(i) = app.state::<State>().tray_dock.lock().unwrap().as_ref() { let _ = i.set_checked(on); }
        }
        "autostart" => {
            let al = app.autolaunch();
            (if on { al.enable() } else { al.disable() }).map_err(|e| e.to_string())?;
            if let Some(i) = app.state::<State>().tray_autostart.lock().unwrap().as_ref() { let _ = i.set_checked(on); }
        }
        "reminders" => setup::set_reminders(on)?,
        other => return Err(format!("unknown preference {other}")),
    }
    Ok(mac_prefs_now(&app))
}

/// "Check for updates" from the Desk — the tray item's action.
#[tauri::command]
fn run_update(app: AppHandle) {
    setup::spawn_update(app);
}

/// Re-apply the policy the app should currently have (notify.rs calls this
/// after every delivery, because Notification Center registration can flip
/// it): Regular while the Desk is showing or "Show in Dock" is on, else
/// Accessory.
pub fn reassert_policy(app: &AppHandle) {
    let desk_open = app.get_webview_window("desk").and_then(|d| d.is_visible().ok()).unwrap_or(false);
    if desk_open { set_policy(app, true); } else { desk_hidden_policy(app); }
}

#[tauri::command]
fn toggle_panel(app: AppHandle) {
    let st = app.state::<State>();
    if st.last_panel_hide.lock().unwrap().elapsed().as_millis() < 350 {
        return; // this click is what auto-hid the panel — treat as "close"
    }
    if let Some(panel) = app.get_webview_window("panel") {
        if panel.is_visible().unwrap_or(false) {
            let _ = panel.hide();
        } else {
            place_panel(&app);
            let _ = panel.show();
            let _ = panel.set_focus();
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![toggle_panel, get_corner, open_desk, mac_prefs, set_mac_pref, run_update, notify::notify, notify::notification_status, notify::open_notification_settings, setup::setup_state, setup::bootstrap, setup::run_collector_now, setup::start_browser_login, setup::open_external])
        .setup(|app| {
            let settings = load_settings(app.handle());
            #[cfg(target_os = "macos")]
            app.set_activation_policy(if settings.dock { tauri::ActivationPolicy::Regular } else { tauri::ActivationPolicy::Accessory });

            let corner = settings.corner;
            let dock = settings.dock;
            app.manage(State {
                corner: Mutex::new(corner),
                badge_scale: Mutex::new(settings.badge_scale),
                dock: Mutex::new(settings.dock),
                desk: Mutex::new(settings.desk),
                attention: Mutex::new(false),
                pinned: Mutex::new(false),
                tray_dock: Mutex::new(None),
                tray_autostart: Mutex::new(None),
                last_panel_hide: Mutex::new(Instant::now() - std::time::Duration::from_secs(10)),
                screen: Mutex::new((0.0, 0.0, 1440.0, 900.0)),
            });

            // --- corner badge (hot zone) ----------------------------------
            let badge = WebviewWindowBuilder::new(
                app,
                "strip",
                WebviewUrl::App("strip.html".into()),
            )
            .title(setup::app_name())
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .shadow(false)
            .accept_first_mouse(true)
            // Never becomes the key window: showing the badge must not blur
            // the panel (which auto-hides on focus loss). Clicks still land.
            .focusable(false)
            .visible(false)
            .inner_size(ZONE_HOT * settings.badge_scale, ZONE_HOT * settings.badge_scale)
            .build()?;
            let _ = badge.set_visible_on_all_workspaces(true);

            // --- panel -----------------------------------------------------
            // Navigation lock: the panel may only display the widget view,
            // its auth flow, and the create-team / join-with-invite pages a
            // brand-new user needs. Anything else (PR links, the full
            // dashboard) opens in the user's real browser instead of
            // hijacking the panel. Keep in sync with src/lib/panel-routes.ts.
            let nav_handle = app.handle().clone();
            let panel = WebviewWindowBuilder::new(
                app,
                "panel",
                WebviewUrl::External(site_panel().parse().unwrap()),
            )
            .on_navigation(move |url| {
                let host = url.host_str().unwrap_or("");
                let path = url.path();
                let allowed = (host == site_host()
                    && (path.starts_with("/widget")
                        || path.starts_with("/auth")
                        || path.starts_with("/welcome")
                        || path.starts_with("/join/")
                        || path.starts_with("/_next")
                        || path == "/"))
                    || host == "github.com"
                    || host.ends_with(".github.com")
                    || host.ends_with(".supabase.co")
                    // Identity providers GitHub itself may hand off to during
                    // its own login (the panel has its own cookie jar).
                    || host == "accounts.google.com"
                    || host.ends_with(".google.com")
                    || host == "appleid.apple.com"
                    || host.ends_with(".apple.com")
                    || url.scheme() == "about"
                    || url.scheme() == "tauri";
                if !allowed {
                    eprintln!("devbrain: panel refused navigation, handing to the browser: {url}");
                    let _ = nav_handle.opener().open_url(url.as_str(), None::<&str>);
                }
                allowed
            })
            .title(setup::app_name())
            .decorations(false)
            .transparent(true)
            .shadow(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .visible(false)
            .inner_size(PANEL_W, PANEL_H)
            .build()?;
            let _ = panel.set_visible_on_all_workspaces(true);
            round_corners(&panel, PANEL_RADIUS);

            let handle = app.handle().clone();
            panel.on_window_event(move |ev| {
                if let tauri::WindowEvent::Focused(false) = ev {
                    let st = handle.state::<State>();
                    if !*st.pinned.lock().unwrap() {
                        if let Some(p) = handle.get_webview_window("panel") {
                            if p.is_visible().unwrap_or(false) {
                                let _ = p.hide();
                                *st.last_panel_hide.lock().unwrap() = Instant::now();
                            }
                        }
                    }
                }
            });

            // --- the Desk ------------------------------------------------------
            // A normal window: title bar, resizable, Cmd-W hides it (never
            // destroyed, so its state survives). Same navigation lock idea as
            // the panel, scoped to /desk. Loads /desk at launch (hidden) so
            // the first open is instant and in-page navigation always works.
            let desk_nav = app.handle().clone();
            let desk_bounds = settings.desk;
            let desk = WebviewWindowBuilder::new(app, "desk", WebviewUrl::External(site_desk(None).parse().unwrap()))
                .on_navigation(move |url| {
                    let host = url.host_str().unwrap_or("");
                    let path = url.path();
                    let allowed = (host == site_host()
                        && (path.starts_with("/desk")
                            || path.starts_with("/open")
                            || path.starts_with("/auth")
                            || path.starts_with("/welcome")
                            || path.starts_with("/join/")
                            || path.starts_with("/_next")
                            || path.starts_with("/api/")
                            || path == "/"))
                        || host == "github.com"
                        || host.ends_with(".github.com")
                        || host.ends_with(".supabase.co")
                        || host == "accounts.google.com"
                        || host.ends_with(".google.com")
                        || host == "appleid.apple.com"
                        || host.ends_with(".apple.com")
                        || url.scheme() == "about"
                        || url.scheme() == "tauri";
                    if !allowed {
                        eprintln!("devbrain: desk refused navigation, handing to the browser: {url}");
                        let _ = desk_nav.opener().open_url(url.as_str(), None::<&str>);
                    }
                    allowed
                })
                .title(format!("{} Desk", setup::app_name()))
                .decorations(true)
                // Flush: macOS keeps the traffic lights, the bar itself is ours
                // (the Desk's 48px header is the drag region; see desk/layout.tsx).
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .hidden_title(true)
                .traffic_light_position(LogicalPosition::new(20.0, 11.0))
                // Paper behind the first paint so a load never flashes a foreign colour.
                .background_color(tauri::window::Color(0xf4, 0xf1, 0xea, 0xff))
                .resizable(true)
                .visible(false)
                .inner_size(desk_bounds.map(|b| b.w.max(DESK_MIN_W)).unwrap_or(DESK_W), desk_bounds.map(|b| b.h.max(DESK_MIN_H)).unwrap_or(DESK_H))
                .min_inner_size(DESK_MIN_W, DESK_MIN_H)
                .build()?;
            if let Some(b) = desk_bounds {
                let _ = desk.set_position(LogicalPosition::new(b.x, b.y));
            } else {
                let _ = desk.center();
            }
            {
                let h = app.handle().clone();
                desk.on_window_event(move |ev| match ev {
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        remember_desk_bounds(&h);
                        if let Some(d) = h.get_webview_window("desk") { let _ = d.hide(); }
                        desk_hidden_policy(&h); // back to the menu bar unless "Show in Dock"
                    }
                    tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
                        if h.get_webview_window("desk").and_then(|d| d.is_visible().ok()).unwrap_or(false) {
                            remember_desk_bounds(&h);
                        }
                    }
                    _ => {}
                });
            }

            place_badge(app.handle());
            place_panel(app.handle());
            setup::spawn_collector(app.handle().clone());

            // devbrain[-beta]://login?token=… from the browser sign-in handoff.
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let h = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    setup::handle_deep_link(&h, &event.urls());
                });
                // Launched by the URL (app wasn't running yet)?
                if let Ok(Some(urls)) = app.deep_link().get_current() {
                    setup::handle_deep_link(app.handle(), &urls);
                }
            }
            // --- attention state from the panel ---------------------------
            // The panel is authenticated and knows what needs the user; it
            // emits {level, reason}. The badge window listens for the same
            // event to colour itself; we listen to decide visibility.
            {
                let h = app.handle().clone();
                app.listen_any("badge-state", move |ev| {
                    let payload = ev.payload();
                    let level = serde_json::from_str::<serde_json::Value>(payload)
                        .ok()
                        .and_then(|v| v.get("level").and_then(|l| l.as_str().map(String::from)))
                        .unwrap_or_else(|| "idle".to_string());
                    let wants = level != "idle";
                    if let Some(st) = h.try_state::<State>() {
                        *st.attention.lock().unwrap() = wants;
                    }
                });
            }

            // --- global hotkey: Alt+Space toggles the panel ----------------
            {
                use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};
                let hotkey = Shortcut::new(Some(Modifiers::ALT), Code::Space);
                let h = app.handle().clone();
                if let Err(e) = app.global_shortcut().on_shortcut(hotkey, move |_app, _sc, event| {
                    if event.state() == ShortcutState::Pressed {
                        let h2 = h.clone();
                        let _ = h.run_on_main_thread(move || toggle_panel(h2));
                    }
                }) {
                    eprintln!("devbrain: could not register Alt+Space ({e})");
                }
            }

            spawn_corner_watcher(app.handle().clone());

            // --- menu-bar (tray) icon -------------------------------------
            let open_i = MenuItem::with_id(app, "open", &format!("Open {} panel", setup::app_name()), true, None::<&str>)?;
            let desk_i = MenuItem::with_id(app, "desk", "Open Desk", true, None::<&str>)?;
            let dock_i = CheckMenuItem::with_id(app, "dock", "Show in Dock", true, dock, None::<&str>)?;
            let sep_i = PredefinedMenuItem::separator(app)?;
            let reload_i = MenuItem::with_id(app, "reload", "Reload panel", true, None::<&str>)?;
            let pin_i = CheckMenuItem::with_id(app, "pin", "Pin panel open", true, false, None::<&str>)?;
            let bl_i = CheckMenuItem::with_id(app, "corner_bl", "Corner: Bottom Left", true, corner == Corner::BottomLeft, None::<&str>)?;
            let br_i = CheckMenuItem::with_id(app, "corner_br", "Corner: Bottom Right", true, corner == Corner::BottomRight, None::<&str>)?;
            let auto_i = CheckMenuItem::with_id(
                app, "autostart", "Launch at login", true,
                app.autolaunch().is_enabled().unwrap_or(false), None::<&str>,
            )?;
            let scale = settings.badge_scale;
            let size_s = CheckMenuItem::with_id(app, "size_s", "Small", true, (scale - 0.5).abs() < 0.01, None::<&str>)?;
            let size_m = CheckMenuItem::with_id(app, "size_m", "Medium", true, (scale - 0.75).abs() < 0.01, None::<&str>)?;
            let size_l = CheckMenuItem::with_id(app, "size_l", "Large", true, (scale - 1.0).abs() < 0.01, None::<&str>)?;
            let size_menu = Submenu::with_items(app, "Badge size", true, &[&size_s, &size_m, &size_l])?;
            let update_i = MenuItem::with_id(app, "update", "Check for updates…", true, None::<&str>)?;
            let quit_i = PredefinedMenuItem::quit(app, Some(&format!("Quit {}", setup::app_name())))?;
            let menu = Menu::with_items(app, &[&open_i, &desk_i, &sep_i, &dock_i, &pin_i, &bl_i, &br_i, &size_menu, &auto_i, &reload_i, &update_i, &quit_i])?;

            *app.state::<State>().tray_dock.lock().unwrap() = Some(dock_i.clone());
            *app.state::<State>().tray_autostart.lock().unwrap() = Some(auto_i.clone());
            let bl_h = bl_i.clone();
            let br_h = br_i.clone();
            let (ss_h, sm_h, sl_h) = (size_s.clone(), size_m.clone(), size_l.clone());
            TrayIconBuilder::with_id("devbrain-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .icon_as_template(false)
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "open" => toggle_panel(app.clone()),
                    "desk" => show_desk(app.clone(), None),
                    "dock" => {
                        let now = !*app.state::<State>().dock.lock().unwrap();
                        apply_dock(app, now);
                    }
                    "update" => {
                        // The same reconciler the daily job runs. It swaps the app
                        // bundle if a newer release exists; the new build is used on
                        // the next launch. Output goes to a log the user can read.
                        setup::spawn_update(app.clone());
                    }
                    "reload" => {
                        // Always go back to the panel's home, not "reload wherever
                        // the webview currently is" (which could be a stuck
                        // sign-in hop).
                        if let Some(p) = app.get_webview_window("panel") {
                            let _ = p.eval(&format!("window.location.replace({:?})", site_panel()));
                        }
                    }
                    "pin" => {
                        let st = app.state::<State>();
                        let mut p = st.pinned.lock().unwrap();
                        *p = !*p;
                    }
                    "corner_bl" => {
                        set_corner(app, Corner::BottomLeft);
                        let _ = bl_h.set_checked(true);
                        let _ = br_h.set_checked(false);
                    }
                    "corner_br" => {
                        set_corner(app, Corner::BottomRight);
                        let _ = bl_h.set_checked(false);
                        let _ = br_h.set_checked(true);
                    }
                    "size_s" | "size_m" | "size_l" => {
                        let scale = match event.id.as_ref() { "size_s" => 0.5, "size_l" => 1.0, _ => 0.75 };
                        set_badge_scale(app, scale);
                        let _ = ss_h.set_checked(scale == 0.5);
                        let _ = sm_h.set_checked(scale == 0.75);
                        let _ = sl_h.set_checked(scale == 1.0);
                    }
                    "autostart" => {
                        let al = app.autolaunch();
                        if al.is_enabled().unwrap_or(false) {
                            let _ = al.disable();
                        } else {
                            let _ = al.enable();
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running DevBrain widget");
}
