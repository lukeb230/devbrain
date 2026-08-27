#!/bin/sh
# Download the Node runtime that ships inside DevBrain.app so teammates need
# no prerequisites. Only the `node` binary is kept (~110 MB). Pinned LTS;
# bump NODE_VERSION deliberately. Output: widget/src-tauri/node/bin/node
# (gitignored; Tauri bundles it via bundle.resources in tauri.conf.json).
set -eu
NODE_VERSION="${NODE_VERSION:-22.18.0}"
ARCH="${NODE_ARCH:-$(uname -m | sed 's/x86_64/x64/')}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HERE/src-tauri/node/bin"
if [ -x "$DEST/node" ] && "$DEST/node" -v 2>/dev/null | grep -q "v$NODE_VERSION"; then
  echo "node v$NODE_VERSION already present"; exit 0
fi
TMP="$(mktemp -d)"
URL="https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-darwin-$ARCH.tar.gz"
echo "fetching $URL"
curl -fsSL "$URL" -o "$TMP/node.tgz"
tar -xzf "$TMP/node.tgz" -C "$TMP"
mkdir -p "$DEST"
cp "$TMP/node-v$NODE_VERSION-darwin-$ARCH/bin/node" "$DEST/node"
chmod +x "$DEST/node"
rm -rf "$TMP"
echo "bundled $("$DEST/node" -v) ($ARCH) at $DEST/node"
