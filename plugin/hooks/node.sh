#!/bin/sh
# ============================================================================
# Run a DevBrain script with whatever Node this Mac has.
#
# Claude Code runs hooks and MCP servers through /bin/sh with a non-login
# PATH. On a Mac that has never had Node installed — the normal case for a
# customer, and DevBrain's whole promise is that they don't need it — bare
# `node` is not on that PATH and every hook dies with
# "/bin/sh: node: command not found".
#
# So look for the Node the app bundles (linked into <home>/bin by the CLI),
# then the bundle itself, then any Node on PATH. If there is none, exit 0:
# a missing runtime must never break someone's session.
#
#   sh node.sh <script.mjs> [args…]
# ============================================================================
for n in \
  "$DEVBRAIN_NODE" \
  "$HOME/.devbrain-beta/bin/node" \
  "$HOME/.devbrain/bin/node" \
  "/Applications/DevBrain Beta.app/Contents/Resources/node/bin/node" \
  "/Applications/DevBrain.app/Contents/Resources/node/bin/node"
do
  if [ -n "$n" ] && [ -x "$n" ]; then exec "$n" "$@"; fi
done
if command -v node >/dev/null 2>&1; then exec node "$@"; fi
exit 0
