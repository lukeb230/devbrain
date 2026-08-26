-- Session journals — what each Claude Code session learned, captured
-- automatically at session end. ORG-WIDE visible; every row is labelled with
-- its author (dev_label + user_id) and that label is shown wherever a journal
-- is rendered or surfaced.
--
-- Two tables:
--   journal_queue  raw, redacted transcript EXCERPT posted by the plugin hook.
--                  Short-lived: the agent tick summarises one row per run and
--                  deletes it; a purge job removes anything older than 24h.
--   journals       the summary. Kept.
--
-- Feature flag: policies.rule = 'journals' must be enabled=true for the repo
-- (default OFF — the /api/v1/journal route 204s otherwise).

create table if not exists journal_queue (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  repo_id         uuid not null references linked_repos(id) on delete cascade,
  session_id      uuid references sessions(id) on delete set null,
  user_id         uuid,
  dev_label       text not null,
  branch          text,
  task_id         uuid references tasks(id) on delete set null,
  dirty           boolean not null default false,   -- uncommitted changes at session end
  excerpt         text not null,                    -- redacted; assistant text + tool names + paths only
  plugin_version  text,
  attempts        int not null default 0,
  at              timestamptz not null default now()
);
create index if not exists journal_queue_at_idx on journal_queue (at);

create table if not exists journals (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references orgs(id) on delete cascade,
  repo_id           uuid not null references linked_repos(id) on delete cascade,
  session_id        uuid,
  user_id           uuid,
  dev_label         text not null,                  -- the author, always shown
  branch            text,
  task_id           uuid references tasks(id) on delete set null,
  dirty             boolean not null default false,
  summary           text not null,
  learned           jsonb not null default '[]'::jsonb,
  decisions         jsonb not null default '[]'::jsonb,
  tried_and_failed  jsonb not null default '[]'::jsonb,
  remaining         text,
  files             jsonb not null default '[]'::jsonb,
  model             text,
  session_started_at timestamptz,
  at                timestamptz not null default now()
);
create index if not exists journals_repo_at_idx on journals (repo_id, at desc);

alter table journal_queue enable row level security;   -- service role only
alter table journals enable row level security;
create policy "members read journals" on journals for select using (org_id in (select my_org_ids()));

alter publication supabase_realtime add table journals;

select cron.unschedule('devbrain-journal-purge') from cron.job where jobname = 'devbrain-journal-purge';
select cron.schedule('devbrain-journal-purge', '17 * * * *',
  $$delete from journal_queue where at < now() - interval '24 hours'$$);
