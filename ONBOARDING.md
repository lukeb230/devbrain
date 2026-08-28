# DevBrain — joining a team

About ten minutes. You need a GitHub account, Claude Code installed, and
either an **invite link** from your team or the intention to create a team.

## 1. Join (or create) the team

- **Got an invite link?** Open it (`https://<devbrain-host>/join/…`) and sign
  in with GitHub. You're in.
- **No invite?** Open the DevBrain site, sign in with GitHub, and create a
  team on the Welcome page. You become its owner; invite others from
  **Settings → Members**.

Roles: **owner** manages the team and roles · **admin** links repos, edits
team rules, maps Reminders lists, mints invites · **member** does the
everyday work (tasks, claims, handoffs, specs, their own tokens).

## 2. Install the Mac app (that's the whole install)

Paste this in Terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/lukeb230/devbrain/main/install.sh | sh
```

It downloads the latest release, installs it to Applications and opens it.
Nothing else to install — Node is bundled inside the app.

It's a menu-bar app with no Dock icon. Move your mouse into the bottom-right
corner and click the brain (or press **Alt+Space**). Click **Sign in** — your
browser opens for GitHub and hands back to the app — then **Set up this Mac**.
That one click:

- creates a dev token for this Mac (you never see or paste it)
- installs the `devbrain` CLI, the Claude Code plugin (presence hooks
  included) and a daily self-updater
- asks macOS for **Notifications** and **Reminders** access — click Allow
- shows a ✓/✗ list per part; anything that failed says exactly why and how
  to fix it, and **Re-run setup** lives in the app's Settings tab

Then restart any open Claude Code session so it loads the plugin, and run
`devbrain doctor` in a new terminal — every line should be a check mark.

**Prefer the DMG?** Download `DevBrain.dmg` from the
[latest release](https://github.com/lukeb230/devbrain/releases/latest) and
drag it to Applications. The app isn't notarized yet, so macOS will say it is
"damaged" (it isn't — it's unsigned). Fix, once:

```bash
xattr -dr com.apple.quarantine /Applications/DevBrain.app
```

### Beta channel (optional)

**DevBrain Beta** is a second, independent install — its own app
(`DevBrain Beta.app`), command (`devbrain-beta`), config (`~/.devbrain-beta`)
and plugin (`devbrain-beta`). It runs side by side with stable; its badge
defaults to the opposite corner. Install with
`curl -fsSL …/install.sh | sh -s -- beta` or `DevBrain-Beta.dmg`
(quarantine fix: `xattr -dr com.apple.quarantine "/Applications/DevBrain Beta.app"`).

### Staying current

You don't do anything. Every Mac updates itself from the `main` branch on the
next Claude Code session start (at most every 6 h) and daily via launchd —
CLI, plugin and the app. To force it: `devbrain update`.

## 3. Prove it works

Open a Claude Code session in any linked repo and ask *"What's the team up to
right now?"* — your Claude answers from live DevBrain data, and everyone
else's dashboard shows you under "Now working".

## What you get from here on

- Your Claude sees teammates' sessions, open PRs, collisions, decisions,
  broadcasts and the shared task board — live, every turn.
- It warns you before you edit a file someone else is on.
- It follows the team rules an admin toggles on the Rules tab.
- Ask "what should I work on next?" — it suggests from the task board and
  checks tasks off when you finish.
- Session journals: what each session learned, tried and left unfinished is
  searchable by the whole team (`search_team_memory`).

## Terminal / headless install (no app)

For a CI runner, a Linux box or a Mac without the app:

1. Dashboard → **Settings → Tokens** → create a token (shown once).
2. Either paste the one-line connect command the page shows, then
   `curl -fsSL …/install.sh | sh -s -- --cli` (needs git + Node 18+), or
   set `DEVBRAIN_URL` + `DEVBRAIN_TOKEN` in the environment — the plugin
   hooks and MCP server read those when no config file exists.

## Security notes

- Your dev token only lets your machine report presence and read team
  context. It cannot touch code or infrastructure. Revoke it any time on
  Settings → Tokens; leaving a team revokes it automatically.
- DevBrain's GitHub access is read-only. All code changes happen through
  your own git + PRs, reviewed by a teammate.
- Hook payloads carry file *paths* and redacted transcript excerpts — never
  file contents. Never paste secrets into tasks, broadcasts, decisions or
  `.brain/` docs.
