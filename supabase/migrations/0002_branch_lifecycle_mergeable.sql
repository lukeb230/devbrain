-- Branch lifecycle (merged badge + 48h retention) and PR conflict tracking.
alter table branches add column if not exists merged_at timestamptz;
alter table prs add column if not exists mergeable_state text;
