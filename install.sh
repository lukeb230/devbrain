#!/bin/sh
# ============================================================================
# DevBrain one-line installer for a teammate's Mac.
#
#   curl -fsSL https://raw.githubusercontent.com/lukeb230/devbrain/main/install.sh | sh
#
# It clones this repo into ~/.devbrain/src and hands off to `devbrain setup`,
# which asks for your dev token, then installs the Claude Code hooks, the
# plugin, the Reminders sync job, the daily self-updater, and the menu-bar
# widget. Re-running is safe; it becomes an update.
#
# Everything after this line lives in cli/bin/devbrain.mjs — this script only
# needs to get git + node + a checkout in place. When the repo goes private,
# the raw URL above and the clone below need auth: see docs/PRIVATE-REPO.md.
# ============================================================================
set -eu

REPO="lukeb230/devbrain"
# Channel: `install.sh beta` (or DEVBRAIN_CHANNEL=beta) installs alongside a
# stable install — separate app, command (devbrain-beta), config and jobs.
CHANNEL="${1:-${DEVBRAIN_CHANNEL:-stable}}"
case "$CHANNEL" in stable) HOMEDIR="$HOME/.devbrain" ;; beta) HOMEDIR="$HOME/.devbrain-beta" ;; *) echo "unknown channel: $CHANNEL" >&2; exit 1 ;; esac
DIR="$HOMEDIR/src"

say()  { printf '\033[1m→ %s\033[0m\n' "$*"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(uname)" = "Darwin" ] || fail "DevBrain's installer is macOS-only (launchd + Reminders)."

# Xcode command line tools provide git; prompt to install if missing.
if ! command -v git >/dev/null 2>&1; then
  say "git is missing — requesting Xcode Command Line Tools (a dialog will appear)…"
  xcode-select --install 2>/dev/null || true
  fail "Finish the Command Line Tools install, then re-run this command."
fi

# Node 18+. nvm installs are not on PATH for non-interactive shells, so also
# look in the usual places before giving up.
NODE="$(command -v node 2>/dev/null || true)"
if [ -z "$NODE" ]; then
  for c in "$HOME"/.nvm/versions/node/*/bin/node /opt/homebrew/bin/node /usr/local/bin/node; do
    [ -x "$c" ] && NODE="$c"
  done
fi
[ -n "$NODE" ] || fail "Node.js 18+ is required. Install from https://nodejs.org (or: brew install node) and re-run."
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

# setup is interactive (token + Reminders list), so give it the terminal even
# when this script arrived via a pipe.
say "Running devbrain setup"
exec "$NODE" "$DIR/cli/bin/devbrain.mjs" setup < /dev/tty
