fn main() {
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
            ]),
        ),
    )
    .expect("failed to run tauri-build");
}
