# DevBrain app testing: handoff (2026-09-14)

Read this whole file before doing anything. It is the state of an in-progress test pass, written so a fresh model can pick it up mid-stream. Luke is the user; he types passwords and signs into accounts himself, never the assistant.

## Ground rules (do not skip)

- Product repo is `~/Downloads/devbrain-product` (GitHub `lukeb230/devbrain`). **`~/Downloads/devbrain` is the frozen FlowSync repo and must never be touched.** The shell cwd resets to it after every command, so always `cd ~/Downloads/devbrain-product` first.
- Production is https://getdevbrain.com. Supabase project `guuzgqzljrnfqzrprgrp`. Vercel team `dev-brain1`, project `devbrain`.
- Luke pushes (`git push` is blocked for the assistant). Never sign in to accounts, type passwords, or enter credentials for him.
- Do not raise notarization; it is deliberately last. If Gatekeeper refuses the app on a VM, report exactly what macOS said and the workaround a customer would need, without recommending notarization.
- Report faithfully: failed step = say so with the output.
- Two VMs is the maximum Apple's Virtualization framework allows at once. Do not clone a third while two run.

## The layout Luke chose (option 1)

| Machine | Host tool | DevBrain channel | Status |
|---|---|---|---|
| Luke's own Mac | Claude Code | Beta (`/Applications/DevBrain Beta.app`, `~/.devbrain-beta`, scheme `devbrain-beta://`) | Already installed and signed in. Untouched by this pass. |
| Tart VM `devbrain-cursor`, hostname `cursor-mac`, IP 192.168.64.8 | Cursor | Stable (`/Applications/DevBrain.app`, `~/.devbrain`, scheme `devbrain://`) | Fresh macOS 26.6.2 clone. No DevBrain, no Node, no Cursor yet. |
| Tart VM `devbrain-codex`, hostname `codex-mac`, IP 192.168.64.9 | Codex CLI | Stable (same as above) | Fresh clone. Node 22.12.0 installed at /usr/local/bin. `npm i -g @openai/codex` was started in the background, log `/tmp/codex-npm.log` on the VM. No DevBrain yet. |

All three land in the same DevBrain team, so the panel on any machine should show all three sessions. Same GitHub user on every machine: this tests the three hosts and the collision guard against Luke's own other sessions, not two different people.

The base image `devbrain-test` (stopped) is the clean template. Old VMs `devbrain-look` and `devbrain-fresh` were deleted on Luke's instruction.

Why the hostnames matter: a Mac's teammate identity is its token label, taken from `scutil --get ComputerName` by the app. Minting a token on a same-named Mac revokes the previous one (PR #2), so clones must be renamed before install. Both are renamed already.

## Driving the VMs

SSH (password `admin`):
```
sshpass -p admin ssh -o StrictHostKeyChecking=no admin@192.168.64.8 '<cmd>'   # cursor-mac
sshpass -p admin ssh -o StrictHostKeyChecking=no admin@192.168.64.9 '<cmd>'   # codex-mac
```
sudo inside the guest: `printf admin | sudo -S -p "" <cmd>`.

Screen (VNC, no host pointer needed). Both VMs were started with `tart run --vnc-experimental`. Each has its own state dir and log; set both env vars before every `tools/vm-vnc.sh` call:
```
cd ~/Downloads/devbrain-product
SP=/private/tmp/claude-501/-Users-lukebrowne-Downloads-devbrain/b240179b-df70-4cc2-9008-2cba4c63958c/scratchpad
export VM_VNC_STATE=$HOME/.devbrain-vm-vnc-cursor VM_VNC_LOG=$SP/tart-cursor.log   # or -codex
tools/vm-vnc.sh shot out.png | click X Y | dblclick X Y | drag X1 Y1 X2 Y2 | type "text" | key return|tab|esc|cmd-l
```
Guest coordinates are 2048×1536. Known spots: Safari in the Dock (283, 1466); Safari address bar (1020, 112); the site's hero "Download for Mac" (818, 1002) when scrolled to top.

If the VNC state is lost (new session, VM restarted): `pkill -f 'tart run --vnc-experimental devbrain-cursor'`, then `nohup tart run --vnc-experimental devbrain-cursor > <log> 2>&1 &`, wait for `vnc://` in the log, then `tools/vm-vnc.sh connect` with the env vars above. Same for codex. Read the tips in `~/.claude/projects/-Users-lukebrowne-Downloads-devbrain/memory/devbrain-vm-testing-tips.md`.

Quirks found today:
- Typing a URL over VNC gets mangled (`:` became `;`, Safari searched Google). Open URLs over ssh instead: `open "https://…"` in the guest lands in Safari.
- `tools/vm-vnc.sh` reports a 30 s timeout on drags but the drag lands.

## What has been verified so far today

1. Website launch pass merged and live (see `docs/superpowers/plans/2026-09-13-site-launch-pages.md`): `/start`, 404s, canonical/robots/sitemap, www redirect. Verified with curl and a real click in Luke's Chrome (page stayed on `/start?dl=1`, DMG downloaded).
2. **Update path** on the previous beta VM: `devbrain-beta update` took the app 0.4.10 → 0.4.11 and relaunched it. Gap found: the updater never rewrites `server` in `~/.devbrain-beta/config.json`, so old installs stay on `https://devbrain-seven.vercel.app` (still answers). Note for Luke; not fixed.
3. On both fresh VMs, Safari at getdevbrain.com, "Download for Mac" clicked: Safari landed on `/start?dl=1` correctly, **but no DMG appeared in `~/Downloads` after 60 s on either VM.** Hypothesis: Safari blocks the script-started download (`window.location.assign("/download")` fires 600 ms after load with no user gesture). Unverified.

## Next steps, in order

### A. Settle the Safari download question (both VMs, do cursor first)
1. Screenshot. If Safari shows an "allow downloads on getdevbrain.com?" popover, note that; click Allow.
2. If nothing is there, scroll `/start` down and click "Download again" (a plain user-gesture link to `/download`). Wait; check `ls ~/Downloads` over ssh for `DevBrain.dmg`.
3. Outcome A: the manual link downloads, the auto one did not → product finding: Safari blocks the auto-download. Proposed fix for later (do not build now unless Luke says so): keep the button a direct `href="/download"` for the user gesture, and in its `onClick` schedule `location.assign("/start")` ~300 ms later, so the download starts from the click and the page then shows the steps. Tests in `src/lib/__tests__/site-copy.test.tsx` assert the button href (`/start?dl=1`) and would change.
   Outcome B: neither downloads → look at Safari's download list (⌘⌥L) and the Safari > Settings > General download location. Report.
4. Fallback that keeps the test moving if Safari is stubborn: `curl -L -o ~/Downloads/DevBrain.dmg https://getdevbrain.com/download` over ssh, and say in the report that the browser path was substituted.

### B. Install DevBrain the customer way (both VMs)
1. Double-click the DMG in Finder (or `open ~/Downloads/DevBrain.dmg` over ssh), drag DevBrain to Applications over VNC (or `ditto /Volumes/DevBrain/DevBrain.app /Applications/DevBrain.app` if the drag is unreliable; say which).
2. Open it from Applications. **Expect a Gatekeeper dialog** (the build is ad-hoc signed and quarantined by the browser download). Screenshot it and record the exact wording. The customer workaround is right-click → Open, or System Settings → Privacy & Security → Open Anyway. Do whichever works and note it. Do not `xattr -dr com.apple.quarantine` first; that hides what a customer sees. Use it only as a fallback after recording the dialog.
3. First run: the app is menu-bar only (no Dock icon); the panel opens from the bottom corner when the mouse reaches it. Screenshot the panel's sign-in screen.
4. **Sign in with GitHub: Luke's step.** Tell him which VM is ready, take a screenshot showing the browser sign-in page, and wait. He signs in through the VM's Safari (VNC or the VM window). After the `devbrain://login` deep link fires, the panel should be signed in.
5. Link a repository (Console → onboarding wall → "Link a repository"). Use the same repo the beta Mac uses so all machines share one team. If the GitHub App is already installed for that org, the wall should just list the repo; if it asks to install, that is Luke's step again (GitHub password prompt).
6. "Set up this Mac" in the Console (This Mac page) installs the CLI, hooks and hosts. On cursor-mac it should detect Cursor once Cursor is installed; on codex-mac, Codex. Read `~/.devbrain/config.json` (server must be `https://getdevbrain.com`, `bootstrap_ok: true`) and the host files: `~/.cursor/mcp.json`, `~/.cursor/hooks.json`, `~/.codex/config.toml`, `~/.codex/hooks.json`.

### C. Install the host tools
- **Cursor (cursor-mac):** `https://downloader.cursor.sh/mac/dmg/arm64` returned nothing usable. Try `curl -s 'https://www.cursor.com/api/download?platform=darwin-arm64&releaseTrack=stable'` for a JSON `downloadUrl`, then download that DMG to `~/Downloads`, mount, copy to /Applications. Open it once so it creates `~/.cursor`. **Cursor account sign-in is Luke's step.**
- **Codex (codex-mac):** check `/tmp/codex-npm.log`; `codex --version` with `PATH=/usr/local/bin:$PATH`. **ChatGPT sign-in for Codex is Luke's step** (`codex login` opens a browser). Run "Set up this Mac" after Codex exists so DevBrain wires `~/.codex`.
- Neither VM has Claude Code; that is by design (Luke's Mac is the Claude Code machine).

### D. The multi-host session test (the point of the exercise)
With all three signed in and linked to the same repo:
1. Open a session on each host in a clone of the repo (`git clone` over ssh on the VMs; Luke's Mac already has one). Cursor: open the folder and start a chat that edits a file. Codex: `codex` in the repo dir, ask for a small edit. Claude Code on Luke's Mac: Luke starts it.
2. Verify in the panel and Console on any machine: three teammates live (`cursor-mac · cursor`, `codex-mac · codex`, Luke's Mac · claude code), status phrases updating, activity rows per edit.
3. Collision: have two hosts edit the same file. The PreToolUse guard on the second should warn/deny (Cursor: denial sticks until the person replies; Codex/Claude: "ask"). Record what each host actually showed.
4. Claims: `claim_area` from one host, then an edit inside that area from another host; expect the guard to block.
5. Tasks and handoffs: `add_task` on one host, `start_task`/`complete_task` on another, `leave_handoff` then `pickup_handoff` across hosts. Check the Board and Home "Needs you" rows.
6. A PR from one host: push a branch, open a PR; the tick (every 2 min) should post an AI review and traffic light within a few minutes. Check the Pull requests page.
7. Journals: end a session; a journal row should appear under Feed & memory within a few ticks (needs the repo's `journals` policy on).
8. ⌘K jump, Reminders sync, and alerts in the app are secondary; check if time allows.

### E. Report format
For each step: what was done, what was expected, what happened, screenshot path if relevant. Findings go in one list with severity. Do not fix product code during the pass unless Luke asks; collect findings.

## Open findings so far
- Updater does not migrate `server` to the app's built-in host (old installs stay on devbrain-seven.vercel.app).
- Safari may block the `/start?dl=1` auto-download (unverified, see A).
- Site minors deferred from the launch pass: `/download` fallback leaves `/start` when the GitHub release lookup fails; `src/app/desk/(team)/plan/page.tsx` exports `PlanWall` from a page file (dev types complain, build passes); main-repo `.env.local` still points at the old vercel host.
- `docs/HANDOFF-2026-09-13.md` is untracked in the repo (Luke's call whether to commit).

## Findings added 2026-09-14 (session 2)

- **WANTED CHANGE: team creation must move into the Console.** On a first launch with a brand-new account, `src/app/auth/device/start/route.ts` counts `org_members`, and on zero redirects the browser to `/welcome` (Create a team / Join with an invite), stashing the return in the `devbrain_next` cookie. The panel gives no warning, so pressing "Sign in with GitHub" ends with Safari showing a team form. Every new customer takes this path. Luke's decision: create-or-join belongs in the Console's first-run setup with repo linking and rules. Keep `/welcome` for the browser-only invite path. Verified on `cursor-mac` with `Luke-test-cursor` (0 teams); `sandbox240` (2 teams) skips the branch and the `devbrain://login` deep link fires correctly.
- **Gatekeeper result is not trustworthy on these VMs.** `spctl --status` = "assessments disabled" on the base image (its shell history shows `sudo spctl --global-disable`). The dialog observed was the quarantine prompt ("DevBrain is an app downloaded from the Internet", with an Open button), not a real Gatekeeper verdict. The app is ad-hoc signed (`Signature=adhoc`, `TeamIdentifier=not set`). A customer's true first-open experience is UNTESTED. Re-test needs assessments re-enabled on a VM.
- **First run ignores macOS dark mode.** With macOS set to Dark on `cursor-mac`, the DevBrain panel still opens light. `BrowserShell` reads the saved `devbrain_theme` key and there is none on first run, so it falls back to light rather than following the system.
- **Safari asks a one-time download permission** ("Do you want to allow downloads on getdevbrain.com?") before the `/start?dl=1` auto-download runs, while the page reads "Your download is starting". After Allow it works. One download stalled at 2.4 of 46.1 MB with "the network connection was lost"; Safari's own retry completed it (looks like VM networking, not the site).
- **Fresh installs are correctly on the new domain.** The installed 0.4.11 binary on both VMs contains only `https://getdevbrain.com`. The earlier updater gap (existing installs keep the old host in `config.json`) is unchanged.
- **Codex CLI needed sudo.** `npm i -g @openai/codex` failed with EACCES on `/usr/local/lib/node_modules`; it installed with sudo. Now `codex-cli 0.154.0` at `/usr/local/bin/codex`, on the default interactive PATH.
- **Cursor 3.20.17** installed on `cursor-mac` from `https://www.cursor.com/api/download?platform=darwin-arm64&releaseTrack=stable` (the `downloader.cursor.sh` URL returned nothing usable). Launched once, `~/.cursor` created.

### Account state as of this session
Two different GitHub accounts were used, so the three-machines-one-team layout is not yet in place:

| Account | Teams | Where |
|---|---|---|
| `lukeb230` | lukeb230's team (owner), Sandbox (owner) | Luke's own Mac (beta channel) |
| `sandbox240` | lukeb230's team (member), northwind (owner) | codex-mac |
| `Luke-test-cursor` | none | cursor-mac |

To run the multi-host test they must share one team. Either invite `Luke-test-cursor` into a shared team (gives two genuinely different people, and exercises the invite flow), or sign cursor-mac back in as `sandbox240` (restores the original one-person plan).

## Findings added 2026-09-14 (session 3): setup pass

### BUG 1 (high): "Set up this Mac" shows a green check on a Mac that has nothing installed
`src/lib/setup-mac-copy.ts` states it in its own header comment: `done` is "a live dev token for this user in THIS team"; `hasToken` is "config.json holds some token — for any team". Neither is scoped to *this machine*. `setupMacCopy` tests `done` first and returns immediately:
```ts
if (i.done) return { button: "Re-run setup", note: null };
```
So any account that already holds a live token in the team — from another Mac, or from a Mac that no longer exists — sees step 3 rendered complete on a brand-new machine, with no note.

Reproduced on `codex-mac`: the wall showed "Set up this Mac ✓ / Re-run setup" while the machine had **no `~/.devbrain` directory at all**, no CLI, no hooks and no `~/.codex/config.toml`. The stale token was `sandbox240` / label "Managed's Virtual Machine" in `northwind`, minted 2026-09-13 from the since-deleted `devbrain-look` VM.

Impact: second Mac, replacement Mac, or reinstall. The person is told they are set up, nothing is wired, no hooks fire, they never appear as a teammate, and there is no signal. Note that `shouldMint` is *correct* (`!done || !hasToken` → mints), so pressing "Re-run setup" does the right thing. The defect is purely that nothing tells the user to press it. Smallest fix: in `setupMacCopy`, handle `done && !hasToken` as not-done with a note.

### BUG 2 (high): switching teams and re-running setup silently keeps the old team's token
Same root cause, worse consequence. On `codex-mac`, with the Mac set up for `northwind`, I switched the Console to `lukeb230's team` and pressed "Re-run setup". The token in `~/.devbrain/config.json` was **unchanged** (`dbk_546ffb552cbe42f04709…`), so the Console displays one team while the Mac reports into another.

Why: `shouldMint({done, hasToken, bootstrapOk})` returned false because `done` was true (a stale 2026-09-12 token for this account existed in the destination team, from a different machine) and `hasToken` was true (config held *a* token, for the wrong team). The pair `(true, true)` cannot distinguish "correctly set up" from "set up for a different team", which is exactly the case the header comment claims to cover.

### BUG 3 (medium): the team switcher needs a second render to show the new team
Clicking a team in the sidebar switcher left the label showing the old team; the page had actually switched (the next screenshot showed `northwind` and the role had changed to `owner`). Cosmetic but it reads as a failed click, and I initially mis-diagnosed it as one.

### Verified working on codex-mac
- Install from the real site: Safari download, DMG with Applications drag target, app copied, quarantine intact, launched menu-bar only with no Dock icon.
- Tray menu correct, including `Corner: Bottom Right` for the stable channel.
- "Re-run setup" installed everything: `~/.devbrain/config.json` (`server: https://getdevbrain.com`, `bootstrap_ok: true`, no failures) and the CLI at `~/.devbrain/src/cli/bin/devbrain.mjs`.
- **Multi-host wiring is correct.** `~/.codex/config.toml` registers the MCP server with `DEVBRAIN_HOST = "codex"` and `[features] hooks = true`; `~/.codex/hooks.json` carries SessionStart, SessionEnd and PostToolUse pointing at `presence.mjs --host=codex`.
- `devbrain doctor`: config ✓, server+auth ✓, agent tick alive (112s) ✓, source checkout @ 7efa30d ✓, daily updater ✓, reminders ✓, bundled node ✓, widget 0.4.11 running ✓. It correctly reports `claude CLI — not installed — codex wired instead`. One ✗: `alerts — 1 open for your team`.
- Console renders fully: Home, Board, Pull requests, Specs, Brain, Feed & memory, History, Team, This Mac, ⌘K jump.

### Blocked, and why
No agent session has been run yet. Three things block it and each needs Luke:
1. `cursor-mac` is signed in as `Luke-test-cursor` with no team, so it cannot be set up at all. It has DevBrain 0.4.11 running and Cursor 3.20.17 installed, but no `~/.devbrain` and no `~/.cursor` wiring.
2. `codex-mac`'s token points at `northwind`, which has **zero linked repos** (`sandbox240/northwind-app` was unlinked 2026-09-14 06:40). Linking opens `github.com/apps/devbrain-product/installations/new/permissions`, a GitHub App permissions grant, which the assistant will not approve on the user's behalf.
3. The Codex model is unchosen. Running the default risks the free-plan quota Luke asked to conserve.

Smallest unblock: approve the GitHub App on `sandbox240/northwind-app`. The page is already open in Safari on `codex-mac`. That links a repo to the team the token already points at, and `codex-mac` becomes fully testable in one step.

### Also observed
- A macOS prompt "DevBrain wants access to control Reminders" appears after setup (reminders sync is on by default in config). Declined; not needed for these tests.
- A macOS "App Background Activity / Software from Node.js Foundation can run in the background" notice appears after setup, naming Node.js Foundation rather than DevBrain.

## Session 4: cross-platform communication test — PASSED

### Final test rig
| Machine | Host | DevBrain identity | Team | Repo |
|---|---|---|---|---|
| `cursor-mac` (192.168.64.8) | Cursor 3.20.17 | `Cursorvm2` | lukeb230's team | lukeb230/devbrain-playground |
| `codex-mac` (192.168.64.9) | Codex CLI 0.154.0 | `codexvm` | lukeb230's team | lukeb230/devbrain-playground |

Both run DevBrain 0.4.11 against https://getdevbrain.com. Host wiring verified: `~/.cursor/hooks.json` (sessionStart, sessionEnd, afterFileEdit, preToolUse, beforeSubmitPrompt, stop) + `~/.cursor/mcp.json`; `~/.codex/hooks.json` (SessionStart, SessionEnd, PostToolUse, PreToolUse, UserPromptSubmit) + `[mcp_servers.devbrain]` in `~/.codex/config.toml` with `DEVBRAIN_HOST="codex"`.

### What passed
1. **Shared context is identical on both machines.** Each sees the other's claims, tasks, handoffs, broadcasts and decisions. Context keys: active_sessions, claims, collisions, open_prs, open_tasks, open_handoffs, recent_broadcasts, recent_decisions, merge_plan, rebase_needed, brain_stale, standup_digest, suggested_next, team_rules, guard_7d.
2. **Claims cross over.** cursor claimed `src/a.ts`, codex claimed `src/b.ts`; both appeared to both identities with the right `dev_label`.
3. **Guard warns on a claim, across identities.** cursor asking about `src/b.ts` → `warn:true`, `with:[{label:"codexvm",via:"claim"}]`. Own claim → `warn:false` (correct).
4. **Guard warns on an active session, across platforms.** With a live Cursor session editing `src/c.ts`, codex's guard returned `warn:true`, `with:[{label:"Cursorvm2",via:"session"}]`.
5. **A real Codex session refused to edit a file claimed by the Cursor machine.** `codex exec` on `src/a.ts`: hooks SessionStart and UserPromptSubmit fired, and the model replied "`src/a.ts` is currently claimed by another teammate, so I won't modify it". Model `gpt-5.6-terra`, reasoning effort none, 3,628 tokens.
6. **A real Codex session refused to edit a file a live Cursor session was in.** Same flow on `src/c.ts`: "currently being edited by another active teammate". 3,855 tokens.
7. **Cursor's pre-edit hook denies correctly.** `check-collision.mjs --host=cursor` on `src/b.ts` returned `{"permission":"deny", ...}` with the sticky-denial wording; on an unclaimed path it returned nothing (allow).
8. **Cursor's sessionStart hook injects the full team brief** as `additional_context`, including the Codex machine's claims, decisions and broadcasts.
9. **Presence lands with the right host.** `sessions` rows recorded for `codexvm/codex` and `Cursorvm2/cursor`; SessionEnd closes them (`ended_at` set).
10. **Tasks, handoffs, broadcasts, decisions all cross machines.** codex created a task → cursor completed it; cursor left a handoff → codex picked it up and received the full payload; broadcast and decision each visible to the other side.
11. **Guard warnings are recorded.** 5 `collision_warned` events; `guard_7d` moved from `{warned:3}` to `{warned:5, edited_after:0}`.
12. **MCP server works on cursor-mac.** initialize → `{name:"devbrain",version:"0.1.0"}`; `tools/list` → 15 tools.
13. **`devbrain spawn` works.** Minted a child identity and cloned the repo to `~/.devbrain/clones/devbrain-playground-2`.
14. **`devbrain doctor`** green on both except a pre-existing open alert.

### New issues found in this session
- **BUG 4 (high): Console-minted dev tokens often do not authenticate.** Tokens created on Tokens & sessions were copied with the page's own Copy button (clipboard cleared first, verified with `pbpaste`) and returned **401** from `/api/v1/context`. Two separate values (`dbk_2cd29f80…`, `dbk_ad90bb92…`) match **none** of the 23 `dev_tokens` rows by `sha256` hex, while the row for the label was created and live. One earlier token (`Cursorvm2`) did work and did match. `createToken` stashes the plaintext in the `devbrain_new_token` cookie scoped to `/desk` and the page renders that cookie, so a stale or mismatched cookie is the likely path. Impact: the documented manual/CI setup route hands out dead tokens. Workaround that always worked: `devbrain spawn --label X`, then read the token from `~/.devbrain/sessions/<label>/config.json`.
- **BUG 5 (medium): the Console tells you to run a command that does not exist.** Tokens & sessions says "For a manual, CI or headless setup: `devbrain connect --token …`". `devbrain connect` appears nowhere in the CLI (`src/app/desk/(team)/tokens/page.tsx:61` is the only occurrence in the repo). The real command is `devbrain bootstrap --server URL --token TOKEN`.
- **BUG 6 (medium): Tokens & sessions lists tokens from every team, not the selected one.** With `lukeb230's team` selected (Members 2), the list showed `codex-mac` and `Managed's Virtual Machine`, both of which belong to `northwind`, alongside that team's own tokens. The page filters by user, not by org, and nothing on each row says which team it belongs to. Revoking from here can kill another team's machine.
- **BUG 7 (low): Codex clamps DevBrain's SessionEnd hook timeout.** Every run prints `warning: clamping SessionEnd hook timeout to 3s in /Users/admin/.codex/hooks.json`. DevBrain writes 8s. The journal POST is spawned detached at SessionEnd, so a 3s ceiling risks cutting it off.
- **BUG 8 (medium): Codex hooks do not run without `--dangerously-bypass-hook-trust`.** A `codex exec` run without that flag produced no `hook:` lines and created no session row; with it, everything fired. After "Set up this Mac" nothing tells the user Codex hooks are inert until trusted, so a Codex user's first sessions are silently invisible to DevBrain.
- **Observation (unreproduced): one guard call missed a one-second-old claim.** The first `guard` call for `src/a.ts` returned `warn:false` while `/context` in the same batch already showed the claim; a retry a minute later warned correctly. A measured re-test showed the guard seeing a brand-new claim at **t+893 ms** on the first poll, so this did not reproduce. Recorded, not diagnosed.
- **New token button needs two clicks.** The first click after typing a label is swallowed; the second mints. The label field also auto-capitalises ("cursorvm" became "Cursorvm").
- **MCP tool count is 15, not 16.** `docs/HANDOFF-2026-09-13.md` claims 16 tools including a `devbrain` meta-tool; the server advertises 15 and no `devbrain` tool.

### Not tested, and why
- **Journals / session summaries.** No `journals` policy row exists for this repo, and the policy is off by default, so SessionEnd journals are intentionally dropped. Enabling it is a Rules toggle.
- **PR review, traffic lights, merge order, auto-merge.** These need a real branch and PR on the linked repo, and pushing requires GitHub write credentials for the test account.
- **The Cursor GUI itself.** Cursor is installed and its hooks and MCP server are verified by direct invocation, but driving the Cursor chat UI needs a Cursor account sign-in, which is Luke's step.
- **Gatekeeper's true first-open dialog.** Still blocked: the base VM image has `spctl` assessments disabled.

### Workarounds used (no DevBrain code was changed)
- Tokens obtained via `devbrain spawn` instead of the Console, because of BUG 4.
- codex-mac and cursor-mac were pointed at the team with a linked repo using `devbrain bootstrap --token`, because "Re-run setup" would not re-point an already-set-up Mac (BUG 2).
- The CLI source was copied from codex-mac to cursor-mac rather than re-downloaded.
- A local git repo with the linked `origin` remote stood in for a full clone on each VM.

## Session 5: cursor-mac through the product path (afternoon)

Luke's correction: the morning's cursor-mac result was reached by bootstrapping a token minted elsewhere, not by the product's own flow. Redone properly.

### What was done, in product order
1. **Invite.** On codex-mac (sandbox240, owner of northwind): Console → Team → Members → New invite link. Invite code `gpdtZPg98RGD29-j`, role member, 7-day expiry.
2. **Join.** On cursor-mac, Safari (signed in as `Luke-test-cursor`): opened the invite URL → `/open?joined=1` "You're in — welcome to northwind". `org_members` row created 14:39:40.
3. **Hand-off.** "Open the Console in DevBrain" → Safari prompt "allow this website to open DevBrain?" → Console opened at its sign-in screen → "Sign in with GitHub" → `/auth/device/start?surface=desk` → "Signed in" → second Safari prompt → Console signed in as `Luke-test-cursor · member`, team northwind. `device_logins` row used at 14:41:40.
4. **Set up this Mac.** The wall showed step 3 un-ticked with the correct note: "This Mac was set up before, but not for northwind. Setting it up again points it at northwind" and the button "Set up this Mac for northwind". One click: `~/.devbrain/config.json` token changed from `dbk_152c62b0…` (Cursorvm2, lukeb230's team) to a new one; `dev_tokens` row `cursor-mac` owned by `Luke-test-cursor` in northwind; `bootstrap_ok: true`; doctor: server+auth ✓, "cursor wired instead". So the wrong-team case is handled correctly **when the account has no token in the destination team** (it is only wrong when a stale same-account token exists there, as in Session 3).
5. **codex-mac re-pointed at northwind** via a Console-minted token (`Codexnw`, single row, verified with curl before use) and `devbrain bootstrap`. doctor ✓.
6. **A test repo.** `sandbox240/northwind-app` no longer exists on GitHub (404; the Console alert "was removed from the GitHub App" was right). Created `sandbox240/neap` (public, README, branch main) on the sandbox account. Local repos on both VMs point their `origin` at it.
7. **GitHub App install** on `sandbox240/neap`, scoped to that one repo: after "Install", GitHub asked for the sandbox240 password (sudo mode). **Stopped there: the assistant does not type passwords.**

### Observations this session
- **Wall "Skip for now" link is unreachable at the default window size.** On a 1024×768 display the link sits under the window's bottom edge/Dock; clicks hit the Dock. It took hiding the Dock to reach it.
- **Team switcher is unreliable.** Three of four attempts to switch teams by clicking the item did nothing; the keyboard (open, Down, Return) worked. The dropdown also stays open after a keyboard pick.
- **"New token": the first click does mint, the page just does not re-render.** `Codexnw` was created at 14:53:06 by the first click while the list still showed the old state; a second click then goes down the duplicate-label path (BUG 4). Refines the earlier "needs two clicks" note: the fix is the missing re-render/pending state, and the double-submit guard.
- **Tokens page again listed other teams' tokens** under northwind (BUG 6 reconfirmed).
- The join route sets the browser's active team to the invite's team even for an existing member. Useful: it is the only browser-side way left to choose which team a GitHub App install is claimed for, now that the dashboard is retired. Worth making explicit or giving `/open` a switcher.
- Cursor 3.20.17 is signed in on cursor-mac (`cursorAuth/accessToken` present in its state store).

### Ready to run once the repo is linked
- codex-mac claims `src/a.ts` (real `codex exec`), then a real Cursor chat on cursor-mac asked to edit `src/a.ts` → expect the sticky deny inside Cursor.
- The reverse: Cursor session live in `src/b.ts`, Codex asked to edit it → expect refusal (already proven cross-machine on the playground repo this morning).
- Presence for both in the Console Home on each machine.

## Session 6: live two-editor run on the linked repo (`sandbox240/neap`, team northwind)

Luke typed in the VM windows for the first steps; the assistant drove the rest (Cursor by AppleScript keystrokes over ssh, Codex by `codex exec`) and verified every step against the database, the shared context API and the files.

| Step | Result | Evidence |
|---|---|---|
| Codex starts, hooks approved interactively | ✓ | `Codexnw/codex` session rows at 15:43:34 and 15:44:00 |
| Cursor agent chat starts | ✓ | `cursor-mac/cursor` session, presence |
| Cursor edits `src/b.ts` before any claim | ✓ allowed (correct) | activity 15:44:28; claim on that file arrived 15:44:51 |
| Codex claims `src/b.ts` via `claim_area` (interactive approval) | ✓ | claim row Codexnw `["src/b.ts"]` |
| **Cursor asked to add a line to claimed `src/b.ts`** | **✓ denied in the editor** | `collision_warned` 15:52:20, actor cursor-mac, host cursor, decision deny, with Codexnw via claim; file unchanged; guard 1→2 |
| Cursor creates `src/hello.ts` | ✓ allowed | activity lists the file; file content correct |
| **Codex asked to append to `src/hello.ts` while Cursor is live on it** | **✗ edit went through, guard never asked** | Codex used `apply_patch` (patch body, no path); `editedFile()` returns null → hook exits. Proven by simulation: same edit with a path → "ask". See plan Task 14. |
| Codex `add_task` via MCP (`codex exec --approve-for-me`) | ✓ | task "write tests for hello" by Codexnw |
| Cursor `list_tasks` + `start_task` via MCP | ✓ | task assigned_to cursor-mac within 20 s |
| Cursor `leave_handoff` via MCP | ✓ | handoff id 72866e8f… |
| Codex `pickup_handoff` via MCP | ✓ | Codex echoed the summary and remaining work |

### Observations
- **Codex `apply_patch` bypasses the guard and activity** (high). Every Codex session shows `files=[]`; earlier "refusals" were the model reading the brief. Plan Task 14.
- **Codex headless MCP calls need `--approve-for-me`**; with the default "never" policy the tool is refused and the model still claimed success. Interactive Codex prompts the person and works.
- **A first Cursor request that would change nothing produces no guard call**: asking for a line that was already present made the agent inspect and stop. Not a defect; worth knowing when reading guard counters.
- **Cursor sessions accumulate**: each new agent chat opens a new DevBrain session and abandoned chats never send `sessionEnd`; eight `cursor-mac` sessions were open at once. They age out after the 15-minute window. Codex started twice around the hook-approval prompt and left two open sessions too.
- Cursor's agent claimed `README.md` on its own during the task step (model initiative, harmless).
- **VM/tooling**: the cursor VM kernel-panicked once during the run ("restarted because of a problem"); Apple's Virtualization VNC allows one client, so the assistant's screen driver and the user's Screen Sharing fought until the VMs were relaunched as normal windows; AppleScript keystrokes over ssh proved the reliable way to drive Cursor; in-guest `screencapture` hangs over ssh.

### Updated verdict
Both editors communicate through DevBrain with real sessions: presence, claims, tasks, handoffs and MCP tools in both directions, and the Cursor-side guard denial inside the editor. The one enforcement gap is Codex's patch tool (Task 14); until it lands, Codex is context-only.

## Fix verification (2026-09-14, after merge + deploy)

Branch `fix/app-testing-findings` merged to `main` (fast-forward, `0769cd7`) and pushed; production deploy Ready; both VMs updated (`devbrain update`: source `7efa30d → 0769cd7`, widget `0.4.11 → 0.4.12` installed and relaunched). CI note: the pushed commit failed the "plugin-beta is in sync with plugin" check; fixed by `tools/sync-beta-plugin.sh` in local commit `9eb1a64` (unpushed — needs `git push`).

Verified over ssh against the two VMs (`cursor-mac` .8, `codex-mac` .9) and `sandbox240/neap`:

- **Task 7 (Codex hooks):** `~/.codex/hooks.json` SessionEnd `timeout: 3`; `devbrain doctor` prints the `codex hooks` line including "for codex exec, pass --approve-for-me"; `codex exec` runs the hooks with no timeout-clamping warning. PASS.
- **Task 8 (server host):** both Macs already point at `https://getdevbrain.com`; `devbrain update` ran clean. PASS.
- **Task 14 (Codex `apply_patch` guard):** `check-collision.mjs` fed a Codex `apply_patch` body (`*** Update File: README.md`, no `file_path`) returns `permissionDecision: "ask"` — "README.md is being worked on right now by cursor-mac … risks a collision". Direct `POST /api/v1/guard` returns `warn: true`. Before the fix `editedFile` returned null and the hook exited silently. PASS.
- **Task 15 (one session per teammate):** after three consecutive Cursor chats in the linked repo, exactly one live `cursor-mac/cursor` session in `active_sessions` (not three); two `codex exec` runs end cleanly and leave no stale Codex session. PASS.
- **Task 17 (Console fits the work area):** on the 1024×768 VM display the Console window (0.4.12) reads position (0, 30), size 1024×681 — bottom edge 711, ~57 px of Dock clearance. Pre-fix it was 1180×760 (wider than the screen, bottom under the Dock). PASS.

Not yet run (need the Console UI driven at the screen, or a fresh GitHub account only Luke can sign in with):
- **Tasks 1–2 (tokens page):** mint → Copy → curl 200; re-mint shows "already exists" with no token banner; switching teams changes the list.
- **Task 6 (Set up this Mac across teams):** the row shows step 3 (not a check) on a team where the Mac isn't set up; pressing it re-points `~/.devbrain/config.json`.
- **Task 16 (team switcher):** five clicks in a row each land on `/desk` under the clicked team; the ✓ is visible in the popover.
- **Tasks 9–10 (fresh-account sign-in):** signing in as a brand-new account lands on the Console's team forms and the onboarding wall, with Safari untouched after the GitHub page.
