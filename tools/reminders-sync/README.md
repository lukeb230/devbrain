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

Mappings are **team-wide** and live on the server: **Settings → Reminders**
on the dashboard (or `devbrain reminders add "<List>" "<owner/repo>"`). Any
Mac running the DevBrain app with Reminders sync on (the first-run checkbox,
or `devbrain reminders on`) syncs every mapped list it can see, every
3 minutes, and reports the lists it sees so unmapped ones can be picked.
Two Macs syncing the same list is fine — the server dedupes on reminder ID
and the mapping guarantees one repo per list.

Manual one-off: `node tools/reminders-sync/collect.mjs "<List Name>"`.
Log: `/tmp/devbrain-reminders.log` (`/tmp/devbrain-beta-reminders.log` for beta).

## Notes
- Deleting a reminder does NOT delete the task (deletion is ambiguous — do it
  on the dashboard). Completing is synced; un-completing is not.
- Dashboard edits win ties in one case by design: a reminder with no @name
  never blanks an assignment made on the dashboard.
- The reminder's stable ID is stored on the task (external_ref), so renames
  update the same task instead of creating a new one.
