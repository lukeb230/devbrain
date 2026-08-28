#!/bin/sh
# Stamp the deployment URL into every place the clients need it. Run once
# after the Vercel project exists (and again if the domain changes):
#   tools/set-server.sh https://your-devbrain.vercel.app
set -eu
URL="${1:?usage: tools/set-server.sh https://host}"
HOST="${URL#https://}"; HOST="${HOST#http://}"; HOST="${HOST%/}"
cd "$(dirname "$0")/.."
sed -i '' -E "s#const DEFAULT_SERVER = \"[^\"]+\"#const DEFAULT_SERVER = \"$URL\"#" cli/bin/devbrain.mjs
sed -i '' -E "s#const SITE: &str = \"[^\"]+\"#const SITE: \&str = \"$URL\"#; s#const SITE_HOST: &str = \"[^\"]+\"#const SITE_HOST: \&str = \"$HOST\"#; s#const SITE_PANEL: &str = \"[^\"]+\"#const SITE_PANEL: \&str = \"$URL/widget\"#; s#const SITE_FULL: &str = \"[^\"]+\"#const SITE_FULL: \&str = \"$URL/dashboard\"#" widget/src-tauri/src/main.rs
python3 - "$URL" <<'PY'
import json,sys
p='widget/src-tauri/capabilities/remote.json'; c=json.load(open(p)); c['remote']['urls']=[sys.argv[1]]
json.dump(c,open(p,'w'),indent=2); open(p,'a').write('\n')
PY
sed -i '' -E "s#https://[a-z0-9.-]+\.vercel\.app#$URL#g" ONBOARDING.md
echo "server set to $URL"
