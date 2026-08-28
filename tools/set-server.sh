#!/bin/sh
# Stamp the deployment URL into every place the clients need it. Run once
# after the Vercel project exists (and again if the domain changes):
#   tools/set-server.sh https://your-devbrain.vercel.app [owner/repo]
# The optional second argument rewrites the source repo the installer,
# updater and app fetch from (default lukeb230/devbrain).
set -eu
URL="${1:?usage: tools/set-server.sh https://host [owner/repo]}"
REPO="${2:-}"
HOST="${URL#https://}"; HOST="${HOST#http://}"; HOST="${HOST%/}"
URL="https://$HOST"
cd "$(dirname "$0")/.."
# portable in-place sed (BSD needs -i '' ; GNU needs -i)
sedi() { if sed --version >/dev/null 2>&1; then sed -i -E "$@"; else sed -i '' -E "$@"; fi; }

sedi "s#const DEFAULT_SERVER = \"[^\"]+\"#const DEFAULT_SERVER = \"$URL\"#" cli/bin/devbrain.mjs
# The app reads DEVBRAIN_SITE at build time; this is its default.
sedi "s#unwrap_or_else\(\|\| \"https://[^\"]+\"\.into\(\)\)#unwrap_or_else(|| \"$URL\".into())#" widget/src-tauri/build.rs
python3 - "$URL" <<'PY'
import json,sys
p='widget/src-tauri/capabilities/remote.json'; c=json.load(open(p)); c['remote']['urls']=[sys.argv[1]]
json.dump(c,open(p,'w'),indent=2); open(p,'a').write('\n')
PY
sedi "s#https://[a-z0-9.-]+\.vercel\.app#$URL#g" ONBOARDING.md README.md
sedi "s#https://__DEPLOYMENT_HOST__#$URL#g; s#https://[a-z0-9.-]+\.vercel\.app#$URL#g" supabase/cron/agent-tick.sql
if [ -n "$REPO" ]; then
  for f in cli/bin/devbrain.mjs widget/src-tauri/src/setup.rs install.sh README.md ONBOARDING.md docs/PRIVATE-REPO.md src/app/settings/setup/page.tsx .github/workflows/widget-release.yml; do
    sedi "s#lukeb230/devbrain#$REPO#g" "$f"
  done
  echo "source repo set to $REPO"
fi
echo "server set to $URL"
