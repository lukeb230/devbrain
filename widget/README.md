# DevBrain Mac app (Tauri shell)

An accessory app: no Dock icon, a menu-bar icon, and a hot zone in a bottom
corner of the screen (right by default; beta defaults to left). Mouse into
the corner → a round badge appears → click it (or press **Alt+Space**) and
the panel opens showing the live site. Every deploy of the site updates the
panel; the app itself only needs rebuilding for shell changes.

The app is also the installer: on first run it signs you in through your
browser, mints a device token and runs `devbrain bootstrap`, which installs
the CLI, the Claude Code plugin and the daily updater. Node is bundled in
`Contents/Resources/node`.

## Build

Prerequisites: `xcode-select --install` and Rust (`rustup`).

```bash
npm install
./scripts/build-channel.sh stable    # → src-tauri/target/release/bundle/macos/DevBrain.app
./scripts/build-channel.sh beta      # → …/DevBrain Beta.app
```

`build-channel.sh` fetches the bundled Node first. The site the panel loads
is baked in from `DEVBRAIN_SITE` (`DEVBRAIN_BETA_SITE` for beta); whatever
you set must also be listed in `src-tauri/capabilities/remote.json` —
`build.rs` refuses to build otherwise, because a mismatch silently breaks
every app command from the panel.

Local builds are unsigned and not quarantined, so they open normally. CI
builds are ad-hoc signed; a browser download of one is quarantined and
macOS calls it "damaged" — `install.sh` and `devbrain update` clear the flag,
or run `xattr -dr com.apple.quarantine "/Applications/DevBrain.app"`.
See `../docs/NOTARIZE.md` for proper signing.

## Release

Bump `version` in `src-tauri/tauri.conf.json` and push. CI publishes
`DevBrain.dmg`, `DevBrain-Beta.dmg`, `DevBrain.app.zip`, `DevBrain-Beta.app.zip`
(+ `.sha256`) to release `widget-v<version>`; every Mac picks it up on its
next `devbrain update`.

## Using it

- Tray menu: open panel · Reload panel · Pin panel open · Corner ·
  Badge size · Launch at login · Open full dashboard · Quit.
- Sign in: the panel opens your default browser for GitHub OAuth and returns
  through the `devbrain://` (`devbrain-beta://`) URL scheme — Google/SSO-backed
  GitHub accounts can't log in inside a webview. It remembers you.
- Settings tab: notifications, team rules (admins), Reminders sync,
  "Setup on this Mac" with Re-run.

## Dev mode

```bash
npm run tauri dev
```

## Known rough edges

- Clicking the panel focuses it (an NSPanel refinement could make it
  non-activating).
- If the Dock covers the chosen corner, switch corners or auto-hide the
  Dock — the hot zone sits at the true screen corner.
