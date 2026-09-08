#!/bin/sh
# Console smoke test — run BY HAND on a Mac with the app installed, never from CI
# or a hook. Launches the installed app with stderr captured, deep-links every
# Console route, and fails if the shell refused a navigation (a URL handed to the
# browser) or panicked. This is the check that would have caught both 2026-09-07
# bugs (the /widget bounce and the reload loop).
#
#   ./scripts/desk-smoke.sh            # beta channel (DevBrain Beta.app)
#   ./scripts/desk-smoke.sh stable     # DevBrain.app
#
# It quits and relaunches the chosen app. Nothing else on the Mac is touched.
set -eu
CH="${1:-beta}"
case "$CH" in
  beta)   APP="/Applications/DevBrain Beta.app"; SCHEME="devbrain-beta"; LOG="/tmp/devbrain-beta-smoke.log" ;;
  stable) APP="/Applications/DevBrain.app";      SCHEME="devbrain";      LOG="/tmp/devbrain-smoke.log" ;;
  *) echo "usage: $0 [beta|stable]" >&2; exit 2 ;;
esac
BIN="$APP/Contents/MacOS/devbrain-widget"
[ -x "$BIN" ] || { echo "not installed: $APP" >&2; exit 2; }

ROUTES="${ROUTES:-/ /board /prs /specs /brain /feed /history /rules /members /tokens /team /reminders /mac}"

pkill -f "$APP/Contents/MacOS" 2>/dev/null || true
sleep 1
: > "$LOG"
nohup "$BIN" > "$LOG" 2>&1 &
sleep 8

fail=0
for r in $ROUTES; do
  open -a "$APP" "$SCHEME://desk$r"
  sleep 5
  if grep -q "refused navigation" "$LOG"; then echo "FAIL $r — refused navigation:"; grep "refused navigation" "$LOG" | tail -1; fail=1; : > "$LOG"; fi
  if grep -q "panicked" "$LOG"; then echo "FAIL $r — panic:"; grep -m1 "panicked" "$LOG"; fail=1; break; fi
  pgrep -f "$APP/Contents/MacOS/devbrain-widget" >/dev/null || { echo "FAIL $r — app died"; fail=1; break; }
  echo "ok   $r"
done

# Close the Console (hide) so the Mac is left as found: menu-bar only.
osascript -e "tell application \"System Events\" to tell (first application process whose bundle identifier is \"app.devbrain.desktop$([ "$CH" = beta ] && echo .beta)\") to click button 1 of window 1" >/dev/null 2>&1 || true

[ "$fail" = 0 ] && echo "desk-smoke: all routes clean" || { echo "desk-smoke: FAILED — see $LOG"; exit 1; }
