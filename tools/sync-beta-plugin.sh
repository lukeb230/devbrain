#!/bin/sh
# Regenerate plugin-beta/ from plugin/. The beta plugin is a byte-for-byte copy
# except its manifest name ends in "-beta", which is how hooks/home.mjs picks
# ~/.devbrain-beta. Run after any change under plugin/; CI fails if stale.
set -eu
cd "$(dirname "$0")/.."
rm -rf plugin-beta
cp -R plugin plugin-beta
python3 - <<'PY'
import json
p='plugin-beta/.claude-plugin/plugin.json'; j=json.load(open(p))
j['name']='devbrain-beta'; j['description']='[beta] '+j.get('description','')
json.dump(j,open(p,'w'),indent=2); open(p,'a').write('\n')
PY
echo "plugin-beta synced from plugin ($(grep -o '"version": "[^"]*"' plugin/.claude-plugin/plugin.json))"
