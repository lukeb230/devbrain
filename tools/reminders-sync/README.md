# Reminders → DevBrain task sync

A shared Apple Reminders list becomes the team task inbox: add a reminder on
your phone (or "Hey Siri, add ... to my Scorpion One list"), and within a few
minutes it's a task on the DevBrain board. Check it off anywhere → the task
completes. Only ONE Mac needs to run this — the list is shared — but two is
harmless (the server dedupes).

## Conventions (typed in the reminder title)
- `@ethan` — assigns the task
- `#export #billing` — tags
- Priority Low/Medium/High in Reminders → P3/P2/P1 (none → P3)
- Notes → task detail; due date is appended to the detail

Apple doesn't expose shared-list assignees or hashtag-tags to any API, which
is why these ride in the title. Both are stripped before the task is stored.

## One-time setup (the Mac that runs the sync)
1. In Reminders, make the shared list (e.g. "Scorpion One") and share it.
2. Test once by hand — this also triggers the macOS Reminders permission
   prompt (click Allow):

       node tools/reminders-sync/collect.mjs "Scorpion One" "flow-sync-dev/Scorpion-One"

3. Install the schedule (every 3 minutes). Fill in the three placeholders,
   and check `which node` — if it isn't /usr/local/bin/node, put YOUR path
   in the plist:

       sed -e "s|__COLLECT_PATH__|$HOME/path/to/devbrain/tools/reminders-sync/collect.mjs|" \
           -e "s|__LIST_NAME__|Scorpion One|" \
           -e "s|__REPO__|flow-sync-dev/Scorpion-One|" \
           tools/reminders-sync/com.devbrain.reminders.plist \
           > ~/Library/LaunchAgents/com.devbrain.reminders.plist
       launchctl load ~/Library/LaunchAgents/com.devbrain.reminders.plist

4. Watch it work: `tail -f /tmp/devbrain-reminders.log`

To stop: `launchctl unload ~/Library/LaunchAgents/com.devbrain.reminders.plist`

## Notes
- Deleting a reminder does NOT delete the task (deletion is ambiguous — do it
  on the dashboard). Completing is synced; un-completing is not.
- Dashboard edits win ties in one case by design: a reminder with no @name
  never blanks an assignment made on the dashboard.
- The reminder's stable ID is stored on the task (external_ref), so renames
  update the same task instead of creating a new one.
