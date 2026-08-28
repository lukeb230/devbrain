fn main() {
    // Channel baked in at build time: "stable" (default) or "beta". The beta
    // build uses ~/.devbrain-beta, the other screen corner by default, and a
    // different product name / bundle id (passed via `tauri build --config`
    // by scripts/build-channel.sh) so both can run side by side.
    let channel = std::env::var("DEVBRAIN_CHANNEL").unwrap_or_else(|_| "stable".into());
    println!("cargo:rustc-env=DEVBRAIN_CHANNEL={channel}");
    println!("cargo:rerun-if-env-changed=DEVBRAIN_CHANNEL");

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
            ]),
        ),
    )
    .expect("failed to run tauri-build");
}
