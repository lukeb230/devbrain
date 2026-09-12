#!/bin/zsh
# ============================================================================
# Drive a Tart VM's screen over VNC — its own pointer and keyboard, so the
# host's mouse stays free for whoever is using the Mac.
#
# Start the VM with the Virtualization.framework VNC server (no window):
#
#   nohup tart run --vnc-experimental devbrain-look > /tmp/tart-vnc.log 2>&1 &
#   tools/vm-vnc.sh connect            # reads the vnc:// URL from that log
#
# Then, in the GUEST's own coordinates:
#
#   tools/vm-vnc.sh shot out.png       capture the guest screen
#   tools/vm-vnc.sh click X Y          move + left click
#   tools/vm-vnc.sh dblclick X Y
#   tools/vm-vnc.sh move X Y
#   tools/vm-vnc.sh drag X1 Y1 X2 Y2
#   tools/vm-vnc.sh type "some text"
#   tools/vm-vnc.sh key return|tab|esc|cmd-s|…
#   tools/vm-vnc.sh raw <vncdotool args…>
#
# The endpoint and its one-time password live in $STATE (0600), never in the
# terminal. `tools/vm-ui.sh` is the alternative for a VM running with a
# window; this one needs no window and no host pointer.
# ============================================================================
set -eu
HERE="${0:a:h}"
STATE="${VM_VNC_STATE:-$HOME/.devbrain-vm-vnc}"
VENV="${VM_VNC_VENV:-$STATE/venv}"
LOG="${VM_VNC_LOG:-/tmp/tart-vnc.log}"
CMD="${1:?see the usage comment at the top of this script}"; shift || true

mkdir -p "$STATE"; chmod 700 "$STATE"
vnc() {
  [ -x "$VENV/bin/vncdotool" ] || { python3 -m venv "$VENV" >/dev/null; "$VENV/bin/pip" install -q --disable-pip-version-check vncdotool >/dev/null; }
  [ -s "$STATE/server" ] || { print -r -- "not connected — run: ${0:t} connect" >&2; exit 1; }
  "$VENV/bin/vncdotool" -s "$(cat "$STATE/server")" -p "$(cat "$STATE/pass")" --timeout 30 "$@" 2>&1 | grep -v CryptographyDeprecationWarning | grep -v "encryptor = Cipher" || true
}

case "$CMD" in
  connect)
    url=$(grep -o "vnc://[^[:space:]]*" "$LOG" | tail -1)
    [ -n "$url" ] || { print -r -- "no vnc:// URL in $LOG — is the VM running with --vnc-experimental?" >&2; exit 1; }
    python3 - "$url" "$STATE" <<'PY'
import os, re, sys
url, state = sys.argv[1], sys.argv[2]
m = re.match(r"vnc://([^:]*):(.*)@([\d.]+):(\d+)", url)
if not m:
    print("could not parse the vnc URL", file=sys.stderr); raise SystemExit(1)
_, pw, host, port = m.groups()
for name, val in (("pass", pw), ("server", f"{host}::{port}")):
    p = os.path.join(state, name)
    open(p, "w").write(val); os.chmod(p, 0o600)
print(f"connected to {host}:{port}")
PY
    ;;
  shot)   out="${1:-/tmp/vm-vnc.png}"; vnc capture "$out" >/dev/null; print -r -- "$out" ;;
  move)   vnc move "$1" "$2" ;;
  click)  vnc move "$1" "$2" pause 0.2 click 1 ;;
  rclick) vnc move "$1" "$2" pause 0.2 click 3 ;;
  dblclick) vnc move "$1" "$2" pause 0.2 click 1 pause 0.08 click 1 ;;
  drag)   vnc move "$1" "$2" pause 0.2 mousedown 1 pause 0.2 drag "$3" "$4" pause 0.2 mouseup 1 ;;
  type)   vnc type "$1" ;;
  key)
    case "$1" in return|enter) k=enter ;; esc|escape) k=esc ;; *) k="$1" ;; esac
    vnc key "$k" ;;
  raw)    vnc "$@" ;;
  *) print -r -- "unknown command: $CMD" >&2; exit 2 ;;
esac
