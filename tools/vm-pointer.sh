#!/bin/zsh
# ============================================================================
# Install / start / stop the Claude-orange pointer inside a Tart VM.
#
#   tools/vm-pointer.sh install [vm]   build in the guest, run it, run at login
#   tools/vm-pointer.sh start [vm]
#   tools/vm-pointer.sh stop [vm]
#
# The overlay (tools/vm-ui/claude-pointer.swift) draws an orange ring that
# follows the pointer and rings that expand on every click, so anyone looking
# at the VM can tell the machine is being driven by Claude. It is a
# click-through window and needs no permissions.
# ============================================================================
set -eu
HERE="${0:a:h}"
CMD="${1:?install|start|stop}"
VM="${2:-devbrain-look}"
IP=$(tart ip "$VM")
export SSHPASS="${VM_SSH_PASS:-admin}"
USER_="${VM_SSH_USER:-admin}"
ssh_opts=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR)
R() { sshpass -e ssh $ssh_opts "$USER_@$IP" "$@"; }
APP="/Users/$USER_/Applications/ClaudePointer.app"
PLIST="/Users/$USER_/Library/LaunchAgents/ai.claude.vm.pointer.plist"

case "$CMD" in
  install)
    sshpass -e scp $ssh_opts "$HERE/vm-ui/claude-pointer.swift" "$USER_@$IP:~/claude-pointer.swift" >/dev/null
    R "set -e
      swiftc -O -framework AppKit -o ~/claude-pointer ~/claude-pointer.swift
      rm -rf '$APP'; mkdir -p '$APP/Contents/MacOS'
      cp ~/claude-pointer '$APP/Contents/MacOS/ClaudePointer'
      printf '%s' '<?xml version=\"1.0\" encoding=\"UTF-8\"?><plist version=\"1.0\"><dict><key>CFBundleName</key><string>Claude Pointer</string><key>CFBundleIdentifier</key><string>ai.claude.vm.pointer</string><key>CFBundleExecutable</key><string>ClaudePointer</string><key>CFBundlePackageType</key><string>APPL</string><key>LSUIElement</key><true/></dict></plist>' > '$APP/Contents/Info.plist'
      mkdir -p ~/Library/LaunchAgents
      printf '%s' '<?xml version=\"1.0\" encoding=\"UTF-8\"?><plist version=\"1.0\"><dict><key>Label</key><string>ai.claude.vm.pointer</string><key>ProgramArguments</key><array><string>$APP/Contents/MacOS/ClaudePointer</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><true/></dict></plist>' > '$PLIST'
      pkill -f ClaudePointer 2>/dev/null || true
      open '$APP'"
    sleep 3; R "pgrep -fl ClaudePointer | head -1" ;;
  start) R "open '$APP'"; sleep 2; R "pgrep -fl ClaudePointer | head -1" ;;
  stop)  R "pkill -f ClaudePointer || true; echo stopped" ;;
  *) print -r -- "unknown: $CMD" >&2; exit 2 ;;
esac
