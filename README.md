# DevBrain

A shared second brain for dev teams and their coding agents. Link any GitHub
repo and get: live presence (which files each human — or each Claude Code
session — is editing right now), open PRs with collision warnings, a
git-versioned team vault, restore-point timelines, and a context API that
briefs every agent session before it writes a line.

**Status: Phase 0 scaffold** — auth, schema, GitHub App linking, webhook
ingestion, presence/context/restore-point API routes, and the CLI stub.
See `docs/` in the design doc for Phases 1–4 (dashboard panels, realtime UI,
vault wiki, drift detection).

## Stack

Next.js 15 (app router) · Supabase (Postgres + Auth + Realtime, RLS
multi-tenant) · GitHub App (webhooks + API) · zero-dependency Node CLI.

## Setup (once per deployment)

### 1. Supabase
1. Create a project at supabase.com.
2. SQL Editor → paste and run `supabase/migrations/0001_init.sql`.
3. Authentication → Providers → enable **GitHub** (create a GitHub *OAuth app*
   for sign-in; callback URL is shown in the Supabase UI).
4. Copy Project URL, anon key, and service-role key into `.env.local`.

### 2. GitHub App (this is the repo-linking mechanism, separate from OAuth)
1. GitHub → Settings → Developer settings → **GitHub Apps** → New GitHub App.
2. Homepage URL: your deployment URL. **Setup URL**:
   `https://<your-host>/api/github/setup` and check "Redirect on update".
3. **Webhook URL**: `https://<your-host>/api/github/webhook`; set a webhook
   secret (any long random string).
4. Permissions: **Contents: Read-only** · **Pull requests: Read-only** ·
   **Checks: Read-only** · **Metadata: Read-only**.
5. Subscribe to events: **Push**, **Pull request**, **Pull request review**,
   **Installation**, **Installation repositories**.
6. Create, then: note the **App ID**, generate a **private key**, and put
   ID / key / webhook secret / app slug in `.env.local`.

### 3. Run
```bash
npm install
npm run dev        # http://localhost:3000
```
For webhooks in local dev, tunnel with `ngrok http 3000` (or `smee.io`) and
point the GitHub App webhook at the tunnel.

### 4. Deploy
Push to GitHub → import in Vercel → set the same env vars → update the GitHub
App's Setup/Webhook URLs to the production host.

## Linking a repo

Sign in → Dashboard → **Link a repository** → GitHub's install screen → pick
repos. The installation webhook + setup redirect store it; the repo appears on
the dashboard.

## Dev tokens & the CLI

Phase 0 has no token UI yet — mint one manually:

```sql
-- in Supabase SQL editor; replace org/user ids from your tables
insert into dev_tokens (org_id, user_id, label, token_hash)
values ('<org_id>', '<user_id>', 'lukes-macbook',
        encode(digest('YOUR-RANDOM-TOKEN', 'sha256'), 'hex'));
```

Then on each dev machine:

```bash
node cli/bin/devbrain.mjs init     # stores server URL + token, installs Claude Code hooks
node cli/bin/devbrain.mjs ctx     # prints the live context digest for the current repo
```

The installed hooks report every Claude Code Edit/Write to `/api/v1/ingest`
and inject the `/api/v1/context` digest at session start.

## Restore points (from any deploy script)

```bash
curl -sS -X POST "$DEVBRAIN_URL/api/v1/restore-points" \
  -H "Authorization: Bearer $DEVBRAIN_TOKEN" -H "Content-Type: application/json" \
  -d "{\"repo\":\"owner/name\",\"sha\":\"$(git rev-parse HEAD)\",\"tag\":\"$TAG\",\"bundle_hash\":\"$HASH\"}"
```

## Security model

- Webhooks: HMAC signature verification, service-role writes.
- CLI: per-dev bearer tokens, sha256-hashed at rest, revocable.
- Browser: Supabase Auth (GitHub OAuth); RLS restricts every read to the
  member's org. No AWS or infra credentials ever touch this app.
- Hook payloads carry file *paths* only — never file contents.

- ## TEST
