fn main() {
    // Channel baked in at build time: "stable" (default) or "beta". The beta
    // build uses ~/.devbrain-beta, the other screen corner by default, and a
    // different product name / bundle id (passed via `tauri build --config`
    // by scripts/build-channel.sh) so both can run side by side.
    let channel = std::env::var("DEVBRAIN_CHANNEL").unwrap_or_else(|_| "stable".into());
    println!("cargo:rustc-env=DEVBRAIN_CHANNEL={channel}");
    println!("cargo:rerun-if-env-changed=DEVBRAIN_CHANNEL");

    // The site the panel loads, baked in at build time (DEVBRAIN_SITE; the
    // beta overlay in scripts/build-channel.sh may point it elsewhere).
    // capabilities/remote.json must grant IPC to the SAME origin or every
    // app command silently fails from the panel — assert it here so the two
    // can never drift.
    let site = std::env::var("DEVBRAIN_SITE")
        .ok()
        .map(|s| s.trim().trim_end_matches('/').to_string())
        .filter(|s| !s.is_empty()) // an empty var (CI default, build-channel.sh) means "default"
        .unwrap_or_else(|| "https://devbrain-seven.vercel.app".into());
    let remote = std::fs::read_to_string("capabilities/remote.json").expect("capabilities/remote.json");
    assert!(
        remote.contains(&format!("\"{site}\"")),
        "capabilities/remote.json does not list {site} under remote.urls — add it (DEVBRAIN_SITE and the capability must match)"
    );
    println!("cargo:rustc-env=DEVBRAIN_SITE={site}");
    println!("cargo:rerun-if-env-changed=DEVBRAIN_SITE");
    println!("cargo:rerun-if-changed=capabilities/remote.json");

    // Declare the app's own commands so Tauri generates `allow-<command>`
    // permissions for them. Required: the panel is a REMOTE page, and Tauri
    // only lets remote origins reach app commands that a capability
    // explicitly allows (see capabilities/remote.json). Declaring a manifest
    // also turns the ACL check on for local windows, hence the badge's
    // commands are listed and allowed in capabilities/default.json.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "toggle_panel",
                "get_corner",
                "notify",
                "notification_status",
                "open_notification_settings",
                "setup_state",
                "bootstrap",
                "run_collector_now",
                "start_browser_login",
            ]),
        ),
    )
    .expect("failed to run tauri-build");
}
