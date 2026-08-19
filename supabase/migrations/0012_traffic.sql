-- Merge traffic lights + zombie branch detection.
-- prs.light: last computed lamp state (green/yellow/red/gray) — the tick
--   updates it and fires a pr_cleared event on the transition to green.
-- branches.stale_note / stale_checked_at: zombie detection — unmerged,
--   PR-less branches quiet for 7+ days get flagged with an AI summary of
--   what's inside, so rescue-or-delete is an informed decision.

alter table prs add column if not exists light text;
alter table branches add column if not exists stale_note text;
alter table branches add column if not exists stale_checked_at timestamptz;
