-- Session handoffs — work survives the end of a session. A Claude wrapping
-- up mid-task leaves a structured note (done / remaining / warnings); every
-- teammate's Claude sees open handoffs in its context and can pick one up.
create table if not exists handoffs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  repo_id       uuid not null references linked_repos(id) on delete cascade,
  dev_label     text,
  branch        text,
  task_id       uuid references tasks(id) on delete set null,
  summary       text not null,          -- what the work is
  done          text,                   -- what's finished
  remaining     text,                   -- what's left
  warnings      text,                   -- gotchas for whoever resumes
  created_at    timestamptz not null default now(),
  picked_up_by  text,
  picked_up_at  timestamptz
);
create index if not exists handoffs_repo_open_idx on handoffs (repo_id, picked_up_at, created_at);

alter table handoffs enable row level security;
create policy "members read handoffs"   on handoffs for select using (org_id in (select my_org_ids()));
create policy "members update handoffs" on handoffs for update using (org_id in (select my_org_ids()));

alter publication supabase_realtime add table handoffs;

-- Purge: picked-up handoffs after 72h; unclaimed ones after 7 days.
select cron.unschedule('devbrain-handoff-purge') from cron.job where jobname = 'devbrain-handoff-purge';
select cron.schedule('devbrain-handoff-purge', '41 * * * *',
  $$delete from handoffs where (picked_up_at is not null and picked_up_at < now() - interval '72 hours')
      or (picked_up_at is null and created_at < now() - interval '7 days')$$);
