#!/bin/sh
# ============================================================================
# DevBrain installer for a Mac — the one line a new teammate runs:
#
#   curl -fsSL https://raw.githubusercontent.com/lukeb230/devbrain/main/install.sh | sh
#
# Default: downloads the latest DevBrain app from GitHub Releases, verifies
# its checksum, clears the quarantine flag (the app is ad-hoc signed — a
# browser download would be refused as "damaged"), copies it to
# /Applications and opens it. The app does the rest on first run (sign in,
# "Set up this Mac"): CLI, Claude Code plugin, updater — Node is bundled.
# No git, no Node, no Xcode tools needed. Re-running is safe.
#
#   install.sh beta          → DevBrain Beta.app (side by side with stable)
#   install.sh --cli         → terminal-only path: git clone + `devbrain setup`
#                               (needs git + Node 18+; for machines without
#                               the app, e.g. a headless Mac or CI runner)
#   DEVBRAIN_WIDGET_VERSION=0.3.8 install.sh   → pin a release
#
# When the repo goes private the raw URL and the release download need
# auth: see docs/PRIVATE-REPO.md.
# ============================================================================
set -eu

REPO="lukeb230/devbrain"
CHANNEL="${DEVBRAIN_CHANNEL:-stable}"
MODE="app"
for a in "$@"; do
  case "$a" in
    stable|beta) CHANNEL="$a" ;;
    --cli) MODE="cli" ;;
    *) echo "unknown argument: $a" >&2; exit 1 ;;
  esac
done
case "$CHANNEL" in
  stable) HOMEDIR="$HOME/.devbrain";      APP="DevBrain.app";      ASSET="DevBrain.app.zip";      BUNDLE_ID="app.devbrain.desktop" ;;
  beta)   HOMEDIR="$HOME/.devbrain-beta"; APP="DevBrain Beta.app"; ASSET="DevBrain-Beta.app.zip"; BUNDLE_ID="app.devbrain.desktop.beta" ;;
  *) echo "unknown channel: $CHANNEL" >&2; exit 1 ;;
esac

say()  { printf '\033[1m→ %s\033[0m\n' "$*"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(uname)" = "Darwin" ] || fail "DevBrain's installer is macOS-only (menu-bar app, Reminders, launchd)."

# ---------------------------------------------------------------------------
# Default path: the app.
# ---------------------------------------------------------------------------
if [ "$MODE" = "app" ]; then
  if [ -n "${DEVBRAIN_WIDGET_VERSION:-}" ]; then
    BASE="https://github.com/$REPO/releases/download/widget-v$DEVBRAIN_WIDGET_VERSION"
  else
    BASE="https://github.com/$REPO/releases/latest/download"
  fi
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  say "Downloading ${APP} (${CHANNEL})…"
  curl -fsSL -o "$TMP/$ASSET" "$BASE/$ASSET" || fail "download failed ($BASE/$ASSET). Is there a release yet? Are you online?"
  if curl -fsSL -o "$TMP/$ASSET.sha256" "$BASE/$ASSET.sha256" 2>/dev/null; then
    (cd "$TMP" && shasum -a 256 -c "$ASSET.sha256" >/dev/null) || fail "checksum mismatch: the download is corrupt or tampered with. Nothing was installed."
  else
    say "(no checksum published for this release — skipping verification)"
  fi
  ditto -x -k "$TMP/$ASSET" "$TMP" || fail "could not unzip $ASSET"
  [ -d "$TMP/$APP" ] || fail "$ASSET did not contain $APP"
  xattr -dr com.apple.quarantine "$TMP/$APP" 2>/dev/null || true

  DEST="/Applications"
  if [ ! -w "$DEST" ]; then
    DEST="$HOME/Applications"; mkdir -p "$DEST"
    say "/Applications isn't writable — installing to ${DEST} (auto-update expects /Applications; move it later if you can)"
  fi
  if pgrep -f "/$APP/Contents/MacOS/" >/dev/null 2>&1; then
    say "Quitting the running ${APP}…"
    osascript -e "tell application id \"$BUNDLE_ID\" to quit" >/dev/null 2>&1 || true
    sleep 2
    pkill -9 -f "/$APP/Contents/MacOS/" 2>/dev/null || true
  fi
  rm -rf "$DEST/$APP.new"
  ditto "$TMP/$APP" "$DEST/$APP.new" || fail "could not copy into $DEST"
  rm -rf "$DEST/$APP.old"
  [ -d "$DEST/$APP" ] && mv "$DEST/$APP" "$DEST/$APP.old"
  mv "$DEST/$APP.new" "$DEST/$APP"
  rm -rf "$DEST/$APP.old"
  xattr -dr com.apple.quarantine "$DEST/$APP" 2>/dev/null || true
  say "Installed ${DEST}/${APP} — opening it."
  open -a "$DEST/$APP"
  printf '\n\033[1mNext:\033[0m click the brain in the bottom corner of your screen (or press Alt+Space),\n'
  printf 'click \033[1mSign in\033[0m (your browser opens for GitHub), then \033[1mSet up this Mac\033[0m.\n'
  exit 0
fi

# ---------------------------------------------------------------------------
# --cli: terminal-only install (no app). Needs git + Node 18+.
# ---------------------------------------------------------------------------
DIR="$HOMEDIR/src"
if ! command -v git >/dev/null 2>&1; then
  say "git is missing — requesting Xcode Command Line Tools (a dialog will appear)…"
  xcode-select --install 2>/dev/null || true
  fail "Finish the Command Line Tools install, then re-run this command."
fi
NODE="$(command -v node 2>/dev/null || true)"
if [ -z "$NODE" ]; then
  for c in "$HOME"/.nvm/versions/node/*/bin/node /opt/homebrew/bin/node /usr/local/bin/node; do
    [ -x "$c" ] && NODE="$c"
  done
fi
[ -n "$NODE" ] || fail "Node.js 18+ is required for --cli. Install from https://nodejs.org (or: brew install node) — or drop --cli and let the app bring its own."
MAJOR="$("$NODE" -p 'process.versions.node.split(".")[0]')"
[ "$MAJOR" -ge 18 ] || fail "Node $("$NODE" -v) found at $NODE — DevBrain needs 18+."

if [ -d "$DIR/.git" ]; then
  say "Updating $DIR"
  git -C "$DIR" pull --ff-only --quiet || fail "git pull failed in $DIR — fix and re-run."
else
  say "Cloning $REPO into $DIR"
  mkdir -p "$HOMEDIR"
  git clone --depth 1 --quiet "https://github.com/$REPO.git" "$DIR" || fail "git clone failed."
fi
# setup is interactive (token from Settings → Tokens), so give it the terminal
# even when this script arrived via a pipe.
say "Running devbrain setup"
exec "$NODE" "$DIR/cli/bin/devbrain.mjs" setup < /dev/tty
