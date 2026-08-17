-- Per-repo team rules (advisory in Documentarian mode; the source of truth
-- agents read via the context API).
create table if not exists policies (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  repo_id     uuid not null references linked_repos(id) on delete cascade,
  rule        text not null,
  enabled     boolean not null default true,
  note        text,
  updated_at  timestamptz not null default now(),
  unique (repo_id, rule)
);
alter table policies enable row level security;
create policy "members read policies" on policies for select using (org_id in (select my_org_ids()));
alter publication supabase_realtime add table policies;
