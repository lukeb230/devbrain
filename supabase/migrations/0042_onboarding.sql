-- supabase/migrations/0042_onboarding.sql
-- First-run onboarding keeps only what cannot be derived from other rows:
--   { dismissed_at, preset }. Gating reads dismissed_at alone; every step's
--   completion is computed from linked_repos / dev_tokens / policies /
--   sessions / activity / events (src/lib/onboarding.ts).
alter table org_members add column if not exists onboarding jsonb not null default '{}'::jsonb;
