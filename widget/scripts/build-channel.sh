#!/bin/sh
# Build the widget for a channel: `scripts/build-channel.sh stable|beta`.
# beta → "DevBrain Beta.app", bundle id app.devbrain.desktop.beta, config in
# ~/.devbrain-beta, other screen corner. Same source, one env var + a Tauri
# config overlay. Output: src-tauri/target/release/bundle/macos/<Name>.app
set -eu
CH="${1:-stable}"
cd "$(dirname "$0")/.."
./scripts/fetch-node.sh
[ -x node_modules/.bin/tauri ] || npm ci --no-audit --no-fund
case "$CH" in
  stable) DEVBRAIN_CHANNEL=stable npm run tauri build -- --bundles app ;;
  beta)   DEVBRAIN_CHANNEL=beta npm run tauri build -- --bundles app \
            --config '{"productName":"DevBrain Beta","identifier":"app.devbrain.desktop.beta"}' ;;
  *) echo "unknown channel: $CH" >&2; exit 1 ;;
esac
