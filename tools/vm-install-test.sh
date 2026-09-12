#!/bin/zsh
# ============================================================================
# Cold-start install test in a clean macOS VM (Tart).
#
#   tools/vm-install-test.sh <dev-token> [beta|stable] [vm-name]
#
# Reproduces, on a machine that has never seen DevBrain, exactly what a new
# customer's Mac does — and what the app itself does on first run
# (widget/src-tauri/src/setup.rs): fetch the source tarball (no git, no Xcode
# tools), then `devbrain bootstrap --json --server … --token …`. Then doctor,
# host wiring, and one real presence hook.
#
# Always run it against a throwaway clone so every run starts clean:
#
#   tart clone devbrain-test devbrain-run
#   tools/vm-install-test.sh dbk_… beta devbrain-run
#   tart stop devbrain-run; tart delete devbrain-run
#
# The token comes from Console → Tokens & sessions on a subscribed team.
# Nothing here touches the host's own DevBrain install.
# ============================================================================
set -eu

TOKEN="${1:?usage: vm-install-test.sh <dev-token> [beta|stable] [vm]}"
CH="${2:-beta}"
VM="${3:-devbrain-run}"
SERVER="${DEVBRAIN_SERVER:-https://devbrain-seven.vercel.app}"
REPO="lukeb230/devbrain"
if [ "$CH" = "beta" ]; then APP="DevBrain Beta"; CMD="devbrain-beta"; DIR=".devbrain-beta"; ASSET="DevBrain-Beta.dmg"; PLUGIN="plugin-beta"
else APP="DevBrain"; CMD="devbrain"; DIR=".devbrain"; ASSET="DevBrain.dmg"; PLUGIN="plugin"; fi

step() { print -r -- "\n── $* ──────────────────────────────────────"; }
fail() { print -r -- "✗ $*" >&2; exit 1; }

command -v sshpass >/dev/null || fail "brew install sshpass"
tart list | awk '{print $2}' | grep -qx "$VM" || fail "no VM named $VM (tart clone devbrain-test $VM)"

step "boot $VM"
pgrep -f "tart run .*$VM" >/dev/null || { nohup tart run --no-graphics "$VM" >"/tmp/tart-$VM.log" 2>&1 & sleep 3; }
IP=""
for i in $(seq 1 90); do IP=$(tart ip "$VM" 2>/dev/null || true); [ -n "$IP" ] && break; sleep 2; done
[ -n "$IP" ] || fail "VM never got an IP (see /tmp/tart-$VM.log)"
print -r -- "ip $IP"

export SSHPASS=admin   # cirruslabs images ship admin/admin
ssh_opts=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ConnectTimeout=5)
run() { sshpass -e ssh $ssh_opts "admin@$IP" "$@"; }
for i in $(seq 1 60); do run true 2>/dev/null && break; sleep 2; done
run true || fail "cannot ssh into the VM"
print -r -- "macOS $(run 'sw_vers -productVersion') · $(run 'uname -m')"

step "clean slate"
state=$(run "ls -d ~/$DIR '/Applications/$APP.app' ~/.cursor 2>/dev/null" || true)
[ -z "$state" ] || fail "VM already has DevBrain state:\n$state\nUse a fresh clone."
print -r -- "no config, no app, no ~/.cursor"
run "which git node claude 2>/dev/null || print -r -- '(no git, no node, no claude on PATH — as on a new Mac)'"

step "download the release the way the site links it"
URL=$(run "curl -sL https://api.github.com/repos/$REPO/releases/latest | python3 -c \"import sys,json;print([a['browser_download_url'] for a in json.load(sys.stdin)['assets'] if a['name']=='$ASSET'][0])\"")
print -r -- "$URL"
run "curl -sL -o ~/$ASSET '$URL' && du -h ~/$ASSET | cut -f1"

step "install it (Gatekeeper included)"
run "hdiutil attach -nobrowse -quiet ~/$ASSET -mountpoint /tmp/dbm && ditto '/tmp/dbm/$APP.app' '/Applications/$APP.app' && hdiutil detach -quiet /tmp/dbm && print -r -- 'copied to /Applications'"
print -r -- "spctl says: $(run "spctl -a -vv '/Applications/$APP.app' 2>&1 | head -2" || true)"
run "xattr -dr com.apple.quarantine '/Applications/$APP.app' 2>/dev/null; print -r -- 'quarantine cleared'"

step "first run: fetch the source tarball (what setup.rs does — no git needed)"
run "set -e; NODE='/Applications/$APP.app/Contents/Resources/node/bin/node'; \$NODE --version; \
  T=\$(mktemp -d); curl -fsSL -o \$T/src.tgz https://codeload.github.com/$REPO/tar.gz/main; \
  tar -xzf \$T/src.tgz -C \$T; SRC=\$(find \$T -maxdepth 1 -type d -name 'devbrain-*' | head -1); \
  test -f \$SRC/cli/bin/devbrain.mjs || { print -r -- 'tarball has no CLI'; exit 1; }; \
  mkdir -p ~/$DIR; rm -rf ~/$DIR/src; mv \$SRC ~/$DIR/src; du -sh ~/$DIR/src | cut -f1"

step "bootstrap"
run "'/Applications/$APP.app/Contents/Resources/node/bin/node' ~/$DIR/src/cli/bin/devbrain.mjs bootstrap --server '$SERVER' --token '$TOKEN' --reminders off --json 2>&1 | tail -14"

step "doctor"
run "~/$DIR/bin/$CMD doctor 2>&1 | tail -22" || print -r -- "(doctor exited non-zero — read the ✗ lines above)"

step "hosts (Cursor appears once ~/.cursor exists)"
run "mkdir -p ~/.cursor && ~/$DIR/bin/$CMD hosts 2>&1 | tail -6"
run "~/$DIR/bin/$CMD update 2>&1 | grep -E 'hosts|plugin|cli' || true"
run "python3 -c \"import json;d=json.load(open('$HOME/.cursor/hooks.json'));print('cursor hook events:', sorted(d['hooks']))\" 2>/dev/null || print -r -- '(no cursor hooks yet)'"

step "the CLI is on a real terminal's PATH"
run "grep -q devbrain ~/.zshrc && zsh -i -c 'which $CMD' 2>/dev/null || print -r -- '✗ $CMD is not on PATH for a new Terminal window'"

step "one real session against a linked repo"
run "mkdir -p ~/work && cd ~/work && (test -d pg || git clone -q https://github.com/lukeb230/devbrain-playground.git pg) && print -r -- 'cloned' || print -r -- '(clone failed — is the repo public?)'"
run "cd ~/work/pg && printf '{}' | '/Applications/$APP.app/Contents/Resources/node/bin/node' ~/$DIR/src/$PLUGIN/hooks/presence.mjs session_start 2>&1 | head -5"
run "ls ~/$DIR/session-* >/dev/null 2>&1 && print -r -- '✓ presence recorded a session' || print -r -- '✗ no session file — presence did not post'"

print -r -- "\n✔ finished. Expect: bundled node runs, bootstrap all-ok, doctor clean, cursor wired, a session posted."
print -r -- "  spctl 'rejected' is expected until the app is notarized (docs/NOTARIZE.md)."
