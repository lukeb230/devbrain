-- Spec layer: drop a context doc (md/txt/html/pdf/paste) on a repo and DevBrain
-- extracts its requirements, then judges each against reality (brain notes,
-- repo tree, tasks, merged PRs). The brain says what the app IS; a spec says
-- what it SHOULD BE. Holding both makes coverage measurable.
--
-- Note: this is the first table holding substantive product content rather
-- than metadata. Org-scoped under RLS like everything else, deletable per spec.

create table if not exists specs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  repo_id      uuid not null references linked_repos(id) on delete cascade,
  title        text not null,
  source_name  text,
  source_kind  text not null default 'paste',   -- md | txt | html | pdf | paste
  body         text not null,                   -- normalized markdown
  uploaded_by  text,
  status       text not null default 'new',     -- new | analyzing | ready | failed | archived
  error        text,
  created_at   timestamptz not null default now(),
  analyzed_at  timestamptz
);
create index if not exists specs_repo_idx on specs (repo_id, created_at desc);
create index if not exists specs_pending_idx on specs (status) where status = 'new';

create table if not exists spec_items (
  id                 uuid primary key default gen_random_uuid(),
  spec_id            uuid not null references specs(id) on delete cascade,
  org_id             uuid not null references orgs(id) on delete cascade,
  repo_id            uuid not null references linked_repos(id) on delete cascade,
  requirement        text not null,
  detail             text,
  verdict            text not null default 'missing',  -- done | partial | missing | conflict
  confidence         text not null default 'low',      -- high | low
  evidence           text,
  suggested_priority int not null default 3,
  suggested_tags     jsonb not null default '[]',
  task_id            uuid references tasks(id) on delete set null,
  dismissed_at       timestamptz,
  rechecked_at       timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists spec_items_spec_idx on spec_items (spec_id, verdict);

alter table specs enable row level security;
alter table spec_items enable row level security;
create policy "members read specs" on specs for select using (org_id in (select my_org_ids()));
create policy "members read spec_items" on spec_items for select using (org_id in (select my_org_ids()));

alter publication supabase_realtime add table specs;
alter publication supabase_realtime add table spec_items;
