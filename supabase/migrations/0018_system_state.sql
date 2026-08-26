-- System state: tiny key/value store for server-side heartbeats and cursors.
-- First key: last_tick — written by /api/agents/tick every run so
-- `devbrain doctor` and /api/v1/health can prove the cron schedule is alive.
-- (The schedule itself lives in Supabase pg_cron, created from
-- supabase/cron/agent-tick.sql — it carries a secret, so it is not a migration.)

create table if not exists system_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Service role only: no member policies, RLS on.
alter table system_state enable row level security;
