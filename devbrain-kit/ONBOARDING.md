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

## 3. Get the repo + CLI

```bash
# the test repo we all work in
git clone https://github.com/lukeb230/gear-tracker.git

# the devbrain repo (has the CLI; keep this clone — hooks point into it)
git clone https://github.com/lukeb230/devbrain-test.git
```

(If you can't clone gear-tracker, ask Luke to add you as a collaborator.)

## 4. Connect your machine

```bash
node devbrain-test/cli/bin/devbrain.mjs init
```

It asks for the server URL (`https://devbrain-ebon.vercel.app`) and your
token, then installs the Claude Code presence hooks.

Verify the whole chain (run it from inside the gear-tracker folder):

```bash
cd gear-tracker
node ../devbrain-test/cli/bin/devbrain.mjs doctor
```

Every line should be a check mark.

## 5. Install the plugin (this is the hive-mind part)

In a Claude Code session (any folder):

```
/plugin marketplace add lukeb230/devbrain-test
/plugin install devbrain@devbrain-marketplace
```

Then restart the Claude Code session. Check `/plugin` shows devbrain with no
errors.

## 6. Prove it works

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
