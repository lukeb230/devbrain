# Reminders → DevBrain task sync

A shared Apple Reminders list becomes the team task inbox: add a reminder on
your phone (or "Hey Siri, add ... to my Team Inbox list"), and within a few
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

## Setup

`devbrain setup` offers this during onboarding; to add a list later:

    devbrain reminders add "Team Inbox" "acme/app"

That runs the collector once in the foreground (click **Allow** on the macOS
Reminders prompt), then installs a launchd job that runs it every 3 minutes
using the node that ran the CLI. `devbrain update` re-renders the job whenever
the collector changes on `main`. Watch it: `tail -f /tmp/devbrain-reminders.log`.
Remove: `devbrain reminders remove "Team Inbox"`.

Manual install without the CLI (fill the placeholders; check `which node` —
nvm installs are not at /usr/local/bin/node):

    sed -e "s|/usr/local/bin/node|$(which node)|" \
        -e "s|__COLLECT_PATH__|$PWD/tools/reminders-sync/collect.mjs|" \
        -e "s|__LIST_NAME__|Team Inbox|" \
        -e "s|__REPO__|acme/app|" \
        tools/reminders-sync/com.devbrain.reminders.plist \
        > ~/Library/LaunchAgents/com.devbrain.reminders.plist
    launchctl load ~/Library/LaunchAgents/com.devbrain.reminders.plist

Two Macs running the sync is fine — the server dedupes on the reminder ID.
The first launchd run can take ~10 minutes; after that it's every 3 minutes.

## Notes
- Deleting a reminder does NOT delete the task (deletion is ambiguous — do it
  on the dashboard). Completing is synced; un-completing is not.
- Dashboard edits win ties in one case by design: a reminder with no @name
  never blanks an assignment made on the dashboard.
- The reminder's stable ID is stored on the task (external_ref), so renames
  update the same task instead of creating a new one.
