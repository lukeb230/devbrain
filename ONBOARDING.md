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

## 3. Install everything (one line)

```bash
curl -fsSL https://raw.githubusercontent.com/lukeb230/devbrain-test/main/install.sh | sh
```

It asks for the server URL (press Enter for the default) and your token, then
sets up this Mac end to end:

- Claude Code presence hooks
- the `devbrain` plugin (marketplace + install)
- the shared **Reminders → tasks** sync — say yes to "Scorpion One" and
  click **Allow** when macOS asks for Reminders access
- the **DevBrain menu-bar widget** in /Applications (launches automatically)
- a daily self-update job

Open a new terminal afterwards so `devbrain` is on your PATH. Then verify:

```bash
devbrain doctor
```

Every line should be a check mark. Restart any open Claude Code session so it
picks up the plugin.

### Staying current

You don't do anything. Luke pushes to `main`; your Mac pulls it on the next
Claude Code session start (at most every 6 h) and daily via launchd — CLI,
plugin, sync jobs and widget alike. To force it: `devbrain update`.

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
