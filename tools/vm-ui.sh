#!/bin/zsh
# ============================================================================
# Drive a Tart VM's screen from the host — click, type, drag, screenshot — in
# the GUEST's own coordinates.
#
#   tools/vm-ui.sh [-v VM] shot [out.png]        capture the guest screen
#   tools/vm-ui.sh [-v VM] click X Y [n]         click at guest X,Y
#   tools/vm-ui.sh [-v VM] rclick X Y
#   tools/vm-ui.sh [-v VM] drag X1 Y1 X2 Y2
#   tools/vm-ui.sh [-v VM] move X Y
#   tools/vm-ui.sh [-v VM] type "some text"      into whatever has focus
#   tools/vm-ui.sh [-v VM] key return|tab|esc|<code>
#   tools/vm-ui.sh [-v VM] bounds                the mapping it is using
#
# Everything scriptable should still go over ssh (files, CLI, installs); this
# is for what only exists on screen: the menu-bar panel, a sign-in window, a
# Cursor chat. The VM window must be running with graphics (`tart run VM`).
#
# Mapping: the guest's (0,0) is the window's content origin — the window frame
# plus the title bar. Override the title-bar height with VM_UI_TITLEBAR.
# ============================================================================
set -eu
HERE="${0:a:h}"
VM="${VM_UI_VM:-devbrain-look}"
[ "${1:-}" = "-v" ] && { VM="$2"; shift 2; }
CMD="${1:?see the usage comment at the top of this script}"; shift || true
TITLEBAR="${VM_UI_TITLEBAR:-33}"
BIN="$HERE/vm-ui/mouse"

[ -x "$BIN" ] || { print -r -- "building $BIN…" >&2; swiftc -O -o "$BIN" "$HERE/vm-ui/mouse.swift" >&2; }

# The tart window's frame, straight from the window server.
read -r WX WY WW WH <<<"$(osascript <<APPLESCRIPT
tell application "System Events"
  set w to first window of (first process whose name is "tart")
  set p to position of w
  set s to size of w
  return (item 1 of p as text) & " " & (item 2 of p as text) & " " & (item 1 of s as text) & " " & (item 2 of s as text)
end tell
APPLESCRIPT
)"
OX=$(( WX + 1 )); OY=$(( WY + TITLEBAR ))
host() { print -r -- "$(( OX + $1 )) $(( OY + $2 ))"; }

case "$CMD" in
  bounds) print -r -- "vm=$VM window=${WX},${WY} ${WW}x${WH} → guest origin ${OX},${OY} (titlebar ${TITLEBAR})" ;;
  shot)
    osascript -e 'tell application "System Events" to set frontmost of first process whose name is "tart" to true' >/dev/null
    sleep 0.4
    screencapture -x -R"${OX},${OY},$(( WW - 2 )),$(( WH - TITLEBAR ))" "${1:-/tmp/vm-shot.png}"
    print -r -- "${1:-/tmp/vm-shot.png}" ;;
  click|rclick|move)
    osascript -e 'tell application "System Events" to set frontmost of first process whose name is "tart" to true' >/dev/null
    sleep 0.3
    "$BIN" "$CMD" $(host "$1" "$2") "${3:-1}" ;;
  drag)
    osascript -e 'tell application "System Events" to set frontmost of first process whose name is "tart" to true' >/dev/null
    sleep 0.3
    "$BIN" drag $(host "$1" "$2") $(host "$3" "$4") ;;
  type)
    osascript -e 'tell application "System Events" to set frontmost of first process whose name is "tart" to true' >/dev/null
    sleep 0.3
    osascript -e "tell application \"System Events\" to keystroke \"${1//\"/\\\"}\"" ;;
  key)
    osascript -e 'tell application "System Events" to set frontmost of first process whose name is "tart" to true' >/dev/null
    sleep 0.3
    case "$1" in
      return|enter) code=36 ;; tab) code=48 ;; esc|escape) code=53 ;;
      down) code=125 ;; up) code=126 ;; left) code=123 ;; right) code=124 ;;
      space) code=49 ;; delete) code=51 ;; *) code="$1" ;;
    esac
    osascript -e "tell application \"System Events\" to key code $code" ;;
  *) print -r -- "unknown command: $CMD" >&2; exit 2 ;;
esac
