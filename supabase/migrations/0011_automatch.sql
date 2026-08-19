-- Auto-complete on merge.
-- prs.task_ids: explicit task links parsed from "DevBrain-Task: <id>" PR-body
--   trailers (foundation for task lanes later).
-- prs.automatch: matching state for merged PRs with no trailer —
--   'pending' (queued for the AI matcher on the tick) | 'done'.
-- tasks.maybe_done_pr: medium-confidence match — "possibly done by PR #N",
--   confirmed or dismissed by a human; never auto-closed.

alter table prs add column if not exists task_ids jsonb not null default '[]';
alter table prs add column if not exists automatch text;
alter table tasks add column if not exists maybe_done_pr int;

create index if not exists prs_automatch_idx on prs (automatch) where automatch = 'pending';
