# DevBrain — teammate onboarding

Ten minutes from zero to hive mind. You need: a GitHub account that's on the
team allowlist, Node 18+, and Claude Code installed.

## 1. Sign in to the dashboard

Go to **https://devbrain-ebon.vercel.app** and sign in with GitHub.
If it says you're not on the allowlist, ask Luke to add your GitHub username.

You'll land on the team dashboard — same org as everyone else: live presence,
PRs, tasks, the brain.

## 2. Create your dev token

Dashboard → **Tokens** (top right) → label it after your machine
(e.g. `maya-mbp`) → **Create token** → copy it immediately (shown once).

## 3. Install the app (that's the whole install)

Download **DevBrain.dmg** from the latest widget release
(https://github.com/lukeb230/devbrain-test/releases/latest), drag DevBrain to
Applications, and open it (first time: right-click → Open, it's not notarized).

It's a menu-bar app — no Dock icon. Move your mouse into the bottom-right
corner and click the brain, or press **Alt+Space**. Sign in with GitHub in
the panel, then click **Set up this Mac**. That one click:

- creates a dev token for this Mac (you never see or paste it)
- installs the `devbrain` CLI, the Claude Code plugin, presence hooks and
  the daily self-updater
- asks macOS for **Notifications** and **Reminders** access — click Allow
- starts syncing the shared Reminders list into the task board

Nothing else to install: Node is bundled inside the app. Open a new
terminal afterwards and run `devbrain doctor` — every line should be a
check mark. Restart any open Claude Code session so it loads the plugin.

Prefer a terminal? The one-liner still works (needs Node 18+ and git):

```bash
curl -fsSL https://raw.githubusercontent.com/lukeb230/devbrain-test/main/install.sh | sh
```

### Staying current

You don't do anything. Luke pushes to `main`; your Mac pulls it on the next
Claude Code session start (at most every 6 h) and daily via launchd — CLI,
plugin, sync and the app itself. To force it: `devbrain update`.

## 4. Prove it works

Open a Claude Code session in `gear-tracker/` and ask:
*"What's the team up to right now?"* — your Claude should answer from live
DevBrain data. Meanwhile, everyone else's dashboard now shows YOU under
"Now working."

## What you get from here on

- Your Claude sees teammates' sessions, open PRs, collisions, decisions,
  broadcasts, and the shared task board — live, every turn.
- It warns you before you edit a file someone else is on.
- It follows the team rules (no direct commits to main, no self-approved
  PRs, resolve conflicts before opening a PR, brain updates ride with
  behavior changes).
- Ask it "what should I work on next?" — it suggests from the task board by
  priority and what you just touched, and checks tasks off when you finish.

## Security notes

- Your dev token only lets your machine report presence and read team
  context. It cannot touch code or infrastructure. Revoke it any time on the
  Tokens page.
- DevBrain's GitHub access is read-only. All code changes happen through
  your own git + PRs, reviewed by a teammate.
- Never paste secrets into tasks, broadcasts, decisions, or `.brain/` docs.
