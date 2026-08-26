// ============================================================================
// DevBrain corner widget — shell v2.
//
//   - Accessory app: NO Dock icon, no Cmd-Tab. Menu-bar icon only.
//   - A small invisible hot zone hugs the chosen BOTTOM CORNER (left or
//     right). Mouse into the corner → a round DevBrain badge pops in →
//     click → the panel opens out of that corner.
//   - Corner choice lives in the tray menu and persists across restarts.
//   - "Reload panel" tray item refreshes the webview after site deploys.
// ============================================================================

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use std::time::Instant;

use serde::{Deserialize, Serialize};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{
    AppHandle, Emitter, Listener, LogicalPosition, LogicalSize, Manager, WebviewUrl,
    WebviewWindowBuilder,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use tauri_plugin_opener::OpenerExt;

const SITE_PANEL: &str = "https://devbrain-ebon.vercel.app/widget";
const SITE_FULL: &str = "https://devbrain-ebon.vercel.app/dashboard";

const ZONE_HOT: f64 = 58.0; // expanded to show the badge
const PANEL_W: f64 = 440.0;
const PANEL_H: f64 = 780.0;
const MARGIN: f64 = 6.0; // gap from screen edges for the panel
const BADGE_CLEAR: f64 = 64.0; // panel sits above the badge zone

#[derive(Clone, Copy, PartialEq, Serialize, Deserialize)]
enum Corner {
    #[serde(rename = "bl")]
    BottomLeft,
    #[serde(rename = "br")]
    BottomRight,
}

#[derive(Serialize, Deserialize)]
struct Settings {
    corner: Corner,
}

struct State {
    corner: Mutex<Corner>,
    /// Something wants the user: the badge stays visible instead of only
    /// appearing on corner-hover. Set from the panel's "badge-state" event.
    attention: Mutex<bool>,
    pinned: Mutex<bool>,
    last_panel_hide: Mutex<Instant>,
    screen: Mutex<(f64, f64, f64, f64)>,
}

fn settings_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    let _ = std::fs::create_dir_all(&dir);
    Some(dir.join("settings.json"))
}

fn load_corner(app: &AppHandle) -> Corner {
    settings_path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<Settings>(&s).ok())
        .map(|s| s.corner)
        .unwrap_or(Corner::BottomRight)
}

fn save_corner(app: &AppHandle, corner: Corner) {
    if let Some(p) = settings_path(app) {
        let _ = std::fs::write(p, serde_json::to_string(&Settings { corner }).unwrap_or_default());
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

fn place_badge(app: &AppHandle) {
    let st = app.state::<State>();
    let corner = *st.corner.lock().unwrap();
    let (sx, sy, sw, sh) = screen(app);
    *st.screen.lock().unwrap() = (sx, sy, sw, sh); // refresh the poller's cache
    let w = ZONE_HOT;
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
    let (sx, sy, sw, sh) = screen(app);
    let h = PANEL_H.min(sh - BADGE_CLEAR - 30.0);
    let x = match corner {
        Corner::BottomLeft => sx + MARGIN,
        Corner::BottomRight => sx + sw - PANEL_W - MARGIN,
    };
    let y = sy + sh - h - BADGE_CLEAR;
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
    save_corner(app, corner);
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

// The corner watcher: a background thread polls the global cursor position
// (~12x/sec, no permissions needed) and shows/hides the badge window when
// the cursor enters/leaves the chosen corner. Deterministic — no reliance
// on webview hover events.
fn spawn_corner_watcher(app: AppHandle) {
    std::thread::spawn(move || {
        use mouse_position::mouse_position::Mouse;
        let mut visible = false;
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
            // With attention on, the badge is permanently visible — that IS
            // the signal. Otherwise it's the original hover behaviour.
            let near = attention || (dx < 32.0 && dy < 32.0);
            let far = !attention && (dx > 140.0 || dy > 140.0);
            if near && !visible {
                visible = true;
                let h = app.clone();
                let _ = app.run_on_main_thread(move || {
                    place_badge(&h);
                    if let Some(b) = h.get_webview_window("strip") {
                        let _ = b.show();
                    }
                });
            } else if far && visible {
                visible = false;
                let h = app.clone();
                let _ = app.run_on_main_thread(move || {
                    if let Some(b) = h.get_webview_window("strip") {
                        let _ = b.hide();
                    }
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
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![toggle_panel, get_corner])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let corner = load_corner(app.handle());
            app.manage(State {
                corner: Mutex::new(corner),
                attention: Mutex::new(false),
                pinned: Mutex::new(false),
                last_panel_hide: Mutex::new(Instant::now() - std::time::Duration::from_secs(10)),
                screen: Mutex::new((0.0, 0.0, 1440.0, 900.0)),
            });

            // --- corner badge (hot zone) ----------------------------------
            let badge = WebviewWindowBuilder::new(
                app,
                "strip",
                WebviewUrl::App("strip.html".into()),
            )
            .title("DevBrain")
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .shadow(false)
            .accept_first_mouse(true)
            .visible(false)
            .inner_size(ZONE_HOT, ZONE_HOT)
            .build()?;
            let _ = badge.set_visible_on_all_workspaces(true);

            // --- panel -----------------------------------------------------
            // Navigation lock: the panel may only display the widget view and
            // its auth flow. Anything else (PR links, the full dashboard)
            // opens in the user's real browser instead of hijacking the panel.
            let nav_handle = app.handle().clone();
            let panel = WebviewWindowBuilder::new(
                app,
                "panel",
                WebviewUrl::External(SITE_PANEL.parse().unwrap()),
            )
            .on_navigation(move |url| {
                let host = url.host_str().unwrap_or("");
                let path = url.path();
                let allowed = (host == "devbrain-ebon.vercel.app"
                    && (path.starts_with("/widget")
                        || path.starts_with("/auth")
                        || path.starts_with("/_next")
                        || path == "/"))
                    || host.ends_with("github.com")
                    || host.ends_with(".supabase.co")
                    || url.scheme() == "about"
                    || url.scheme() == "tauri";
                if !allowed {
                    let _ = nav_handle.opener().open_url(url.as_str(), None::<&str>);
                }
                allowed
            })
            .title("DevBrain")
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .visible(false)
            .inner_size(PANEL_W, PANEL_H)
            .build()?;
            let _ = panel.set_visible_on_all_workspaces(true);

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

            place_badge(app.handle());
            place_panel(app.handle());
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
            let open_i = MenuItem::with_id(app, "open", "Open DevBrain panel", true, None::<&str>)?;
            let reload_i = MenuItem::with_id(app, "reload", "Reload panel", true, None::<&str>)?;
            let pin_i = CheckMenuItem::with_id(app, "pin", "Pin panel open", true, false, None::<&str>)?;
            let bl_i = CheckMenuItem::with_id(app, "corner_bl", "Corner: Bottom Left", true, corner == Corner::BottomLeft, None::<&str>)?;
            let br_i = CheckMenuItem::with_id(app, "corner_br", "Corner: Bottom Right", true, corner == Corner::BottomRight, None::<&str>)?;
            let auto_i = CheckMenuItem::with_id(
                app, "autostart", "Launch at login", true,
                app.autolaunch().is_enabled().unwrap_or(false), None::<&str>,
            )?;
            let dash_i = MenuItem::with_id(app, "dash", "Open full dashboard…", true, None::<&str>)?;
            let quit_i = PredefinedMenuItem::quit(app, Some("Quit DevBrain"))?;
            let menu = Menu::with_items(app, &[&open_i, &reload_i, &pin_i, &bl_i, &br_i, &auto_i, &dash_i, &quit_i])?;

            let bl_h = bl_i.clone();
            let br_h = br_i.clone();
            TrayIconBuilder::with_id("devbrain-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .icon_as_template(false)
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "open" => toggle_panel(app.clone()),
                    "reload" => {
                        if let Some(p) = app.get_webview_window("panel") {
                            let _ = p.eval("window.location.reload()");
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
                    "autostart" => {
                        let al = app.autolaunch();
                        if al.is_enabled().unwrap_or(false) {
                            let _ = al.disable();
                        } else {
                            let _ = al.enable();
                        }
                    }
                    "dash" => {
                        let _ = app.opener().open_url(SITE_FULL, None::<&str>);
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running DevBrain widget");
}
