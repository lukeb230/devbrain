-- Team task board. Humans create/complete tasks in the UI; Claudes read them
-- in the context digest and manage them via MCP tools. Open tasks auto-sort
-- by priority (1=critical .. 4=low); completed tasks keep for 72h then a
-- cron purge removes them.

create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  repo_id     uuid not null references linked_repos(id) on delete cascade,
  title       text not null,
  detail      text,
  priority    int  not null default 3 check (priority between 1 and 4),
  tags        jsonb not null default '[]',
  status      text not null default 'open' check (status in ('open', 'done')),
  created_by  text,
  created_at  timestamptz not null default now(),
  done_by     text,
  done_at     timestamptz
);
create index if not exists tasks_repo_open_idx on tasks (repo_id, status, priority, created_at);

alter table tasks enable row level security;
create policy "members read tasks"   on tasks for select using (org_id in (select my_org_ids()));
create policy "members insert tasks" on tasks for insert with check (org_id in (select my_org_ids()));
create policy "members update tasks" on tasks for update using (org_id in (select my_org_ids()));

alter publication supabase_realtime add table tasks;

-- Purge completed tasks older than 72h (hourly).
select cron.unschedule('devbrain-task-purge') from cron.job where jobname = 'devbrain-task-purge';
select cron.schedule('devbrain-task-purge', '23 * * * *',
  $$delete from tasks where status = 'done' and done_at < now() - interval '72 hours'$$);
