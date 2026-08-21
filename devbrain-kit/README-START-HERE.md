# DevBrain — teammate kit

You're holding everything you need to join the team's DevBrain. Ten minutes,
no infrastructure, nothing to host. Requirements: a GitHub account Luke has
put on the allowlist, Node 18+, and Claude Code installed.

**Follow `ONBOARDING.md` step by step** — it covers sign-in, your dev token,
connecting your machine, and installing the plugin. `onboarding-visual.html`
is the same flow as a visual walkthrough if you'd rather skim pictures.

## The two ways to install (pick ONE)

**A — from GitHub (preferred).** This is what ONBOARDING.md describes.
Everything installs from the `lukeb230/devbrain-test` repo, and `git pull`
gets you updates later:

    /plugin marketplace add lukeb230/devbrain-test
    /plugin install devbrain@devbrain-marketplace

**B — from this folder (offline fallback).** If you can't reach the repo,
the same `plugin/` and `cli/` are included right here. From a Claude Code
session:

    /plugin marketplace add /path/to/devbrain-kit
    /plugin install devbrain@devbrain-marketplace

and wherever ONBOARDING.md says `devbrain-test/cli/...`, use this folder's
`cli/` instead. Note: a kit install doesn't auto-update — prefer A.

## The one rule that matters

DevBrain only sees Claude Code sessions. Repo work happens in Claude Code —
in the terminal, inside the repo — not Cowork. Cowork stays great for
research, docs, and long jobs; it just isn't visible to the team board.

## If something doesn't work

Run the doctor from inside a linked repo and send Luke the output:

    node <path-to>/cli/bin/devbrain.mjs doctor

Common fixes: restart the Claude Code session after installing the plugin;
make sure you created the dev token on the dashboard and pasted it into
`init`; check you're on the GitHub allowlist.
