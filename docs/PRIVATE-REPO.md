# When this repo goes private

The installer/updater assumes `lukeb230/devbrain` is public. Four things
fetch from GitHub anonymously today; each needs credentials once the repo is
private. Nothing else in the system cares.

| # | What | Where | Today | When private |
|---|------|-------|-------|--------------|
| 1 | Bootstrap script | `curl …/raw…/install.sh \| sh` (ONBOARDING.md) | anonymous raw URL | raw URLs 404 on private repos |
| 2 | Source checkout | `git clone` / `git pull` of `~/.devbrain/src` (install.sh, `updateSource()` in `cli/bin/devbrain.mjs`) | anonymous HTTPS | needs a git credential |
| 3 | Claude Code plugin | `claude plugin marketplace add lukeb230/devbrain` (`updatePlugin()`) | anonymous | Claude Code clones the marketplace with the user's git credentials — works if #2 works |
| 4 | Widget download | `https://github.com/…/releases/download/widget-vX/DevBrain.app.zip` (`updateWidget()`) | anonymous | release assets on private repos require a token; the browser-style URL redirects to a login page |

## Recommended fix (one credential, once, per Mac)

Have each teammate authenticate `gh` once — they already need GitHub access to
the code — and let everything else ride on it:

```bash
brew install gh && gh auth login        # once per Mac; pick HTTPS + "authenticate git"
```

Then:

1. **Bootstrap**: replace the raw-URL curl in ONBOARDING.md with
   `gh repo clone lukeb230/devbrain ~/.devbrain/src && ~/.devbrain/src/install.sh`
   (install.sh already handles an existing checkout).
2. **Checkout**: `gh auth login` with "authenticate git" installs a credential
   helper, so the existing `git clone` / `git pull` in `install.sh` and
   `updateSource()` keep working unchanged.
3. **Plugin**: no change — Claude Code uses the same git credentials.
4. **Widget**: in `updateWidget()`, swap the `fetch(url)` for
   `gh release download widget-v<ver> --repo <repo> --pattern DevBrain.app.zip --dir <tmp>`
   (or `fetch` with `Authorization: Bearer $(gh auth token)` against the
   API asset URL). Add a friendly error when `gh` isn't authenticated:
   *"run `gh auth login` and then `devbrain update`"*. Also add a `gh` check
   to `devbrain doctor`.

Other viable option — a **fine-grained PAT** with read-only Contents scope on
this one repo, stored at `~/.devbrain/config.json` as `githubToken` and used
in the clone URL and the release download. Simpler for non-developers, but a
shared secret you have to rotate; `gh` is per-person and revocable.

Non-goal: making the DevBrain *server* proxy the source or release assets. It
works, but it turns an app into a package host and puts widget binaries behind
Vercel's function size limits.

## Checklist on the day

- [ ] Every current teammate has run `gh auth login` (verify: `gh auth status`)
- [ ] Apply the four changes above; bump plugin + CLI, push
- [ ] Run `devbrain update` on one Mac *before* flipping the repo private, so the
      new updater code is already local everywhere (the daily job + session-start
      hook will have picked it up within a day)
- [ ] Flip the repo to private
- [ ] `devbrain doctor` on each Mac — all check marks
- [ ] Update ONBOARDING.md's install line
