#!/bin/sh
# Build the widget for a channel: `scripts/build-channel.sh stable|beta`.
# beta → "DevBrain Beta.app", bundle id app.devbrain.desktop.beta, config in
# ~/.devbrain-beta, other screen corner. Same source, one env var + a Tauri
# config overlay. Output: src-tauri/target/release/bundle/macos/<Name>.app
#
# The site the panel loads is baked in from DEVBRAIN_SITE (default: the
# production host in build.rs). Beta may target its own server via
# DEVBRAIN_BETA_SITE. Whatever you set MUST also be listed in
# src-tauri/capabilities/remote.json — build.rs refuses otherwise.
set -eu
CH="${1:-stable}"
cd "$(dirname "$0")/.."
./scripts/fetch-node.sh
[ -x node_modules/.bin/tauri ] || npm ci --no-audit --no-fund
SITE="${DEVBRAIN_SITE:-}"
case "$CH" in
  stable) DEVBRAIN_CHANNEL=stable DEVBRAIN_SITE="$SITE" npm run tauri build -- --bundles app ;;
  beta)   DEVBRAIN_CHANNEL=beta DEVBRAIN_SITE="${DEVBRAIN_BETA_SITE:-$SITE}" npm run tauri build -- --bundles app \
            --config '{"productName":"DevBrain Beta","identifier":"app.devbrain.desktop.beta","plugins":{"deep-link":{"desktop":{"schemes":["devbrain-beta"]}}}}' ;;
  *) echo "unknown channel: $CH" >&2; exit 1 ;;
esac
