# DevBrain edge widget (Mac shell)

The Grammarly-style shell: no Dock icon, a menu-bar icon up top, an
invisible strip on the right edge of the screen — mouse over it, a
"DevBrain" tab fades in, click it, and a panel slides out showing the live
dashboard (opening on the last repo you worked in). Click anywhere else and
it disappears. The panel is the live site, so every deploy updates the
widget automatically — this app never needs rebuilding for features.

## Build it (one time, on your Mac)

Prerequisites (each is one command, skip any you have):

```bash
xcode-select --install                                   # Apple build tools
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   # Rust
```

Then, in this folder:

```bash
npm install
npm run tauri icon app-icon.png     # generates all icon sizes incl. .icns
npm run tauri build
```

The app lands at `src-tauri/target/release/bundle/macos/DevBrain.app`.
Drag it to /Applications. First launch: right-click → Open (it's unsigned).
It will vanish into the menu bar — that's success.

Tip: you can also just open a Claude Code session in this folder and say
"build this Tauri app and tell me where the .app ended up."

## Using it (v2 — corner badge)

- Mouse into the BOTTOM-RIGHT corner of the screen → a round DevBrain badge
  pops in → click it → the panel opens out of that corner.
- Click anywhere outside the panel to dismiss it.
- Menu-bar icon: open panel, Reload panel (after site deploys), pin open,
  Corner: Bottom Left / Bottom Right (remembered across restarts), launch at
  login, open full dashboard, quit.
- Sign in with GitHub inside the panel once; it remembers you.

## Dev mode (instant feedback while tweaking)

```bash
npm run tauri dev
```

## Known rough edges (intentional, fix later)

- Clicking the panel focuses it (a future NSPanel refinement can make it
  non-activating like Grammarly's).
- Unsigned build → right-click → Open once per machine.
- If your Dock covers the chosen corner, switch corners or enable Dock
  auto-hide — the hot zone sits at the true screen corner.
