-- ============================================================================
-- DevBrain — Phase 0 schema
-- ----------------------------------------------------------------------------
-- Multi-tenant from day one: every row belongs to an org; RLS enforces it.
-- Apply with: supabase db push   (or paste into the Supabase SQL editor)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Orgs & membership
-- ----------------------------------------------------------------------------

create table orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now()
);

create table org_members (
  org_id      uuid not null references orgs(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'member' check (role in ('owner','admin','member')),
  github_login text,
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- Helper: the orgs the current user belongs to. SECURITY DEFINER so RLS
-- policies can call it without recursing into org_members' own policy.
create or replace function my_org_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select org_id from org_members where user_id = auth.uid();
$$;

-- ----------------------------------------------------------------------------
-- GitHub App installations & linked repos
-- ----------------------------------------------------------------------------

create table installations (
  id               bigint primary key,          -- GitHub installation_id
  org_id           uuid references orgs(id) on delete set null,
  account_login    text not null,               -- GitHub org/user the app is installed on
  account_type     text,
  created_at       timestamptz not null default now(),
  suspended        boolean not null default false
);

create table linked_repos (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id) on delete cascade,
  installation_id  bigint not null references installations(id) on delete cascade,
  github_repo_id   bigint not null unique,
  full_name        text not null,               -- "owner/name"
  default_branch   text not null default 'main',
  is_vault         boolean not null default false,
  created_at       timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Presence: sessions + activity
-- ----------------------------------------------------------------------------

create table dev_tokens (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  label       text not null default 'default',   -- e.g. "lukes-macbook"
  token_hash  text not null,                     -- sha256 of the bearer token
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
create index on dev_tokens (token_hash) where revoked_at is null;

create table sessions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  repo_id      uuid not null references linked_repos(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  dev_label    text not null,
  branch       text,
  summary      text,
  agent_kind   text not null default 'claude-code',
  started_at   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  ended_at     timestamptz
);
create index on sessions (repo_id, last_seen desc);

create table activity (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references orgs(id) on delete cascade,
  session_id  uuid references sessions(id) on delete set null,
  repo_id     uuid not null references linked_repos(id) on delete cascade,
  user_id     uuid not null,
  branch      text,
  file        text not null,
  tool        text not null default 'edit',      -- edit | write | commit | checkout
  at          timestamptz not null default now()
);
create index on activity (repo_id, at desc);
create index on activity (repo_id, file, at desc);

-- ----------------------------------------------------------------------------
-- GitHub mirror: branches + PRs (kept fresh by webhooks)
-- ----------------------------------------------------------------------------

create table branches (
  repo_id       uuid not null references linked_repos(id) on delete cascade,
  org_id        uuid not null references orgs(id) on delete cascade,
  name          text not null,
  head_sha      text,
  changed_files jsonb not null default '[]',      -- vs default branch, from compare API
  last_push_at  timestamptz,
  primary key (repo_id, name)
);

create table prs (
  repo_id       uuid not null references linked_repos(id) on delete cascade,
  org_id        uuid not null references orgs(id) on delete cascade,
  number        int  not null,
  title         text not null,
  author        text,
  head_branch   text,
  base_branch   text,
  state         text not null,                    -- open | closed | merged
  review_state  text,                             -- approved | changes_requested | pending
  draft         boolean not null default false,
  changed_files jsonb not null default '[]',
  checks        jsonb not null default '[]',      -- [{name, status, conclusion}]
  html_url      text,
  updated_at    timestamptz not null default now(),
  primary key (repo_id, number)
);

-- ----------------------------------------------------------------------------
-- Claims, restore points, events
-- ----------------------------------------------------------------------------

create table claims (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  repo_id     uuid not null references linked_repos(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  dev_label   text not null,
  paths       jsonb not null default '[]',        -- glob strings
  note        text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,
  released_at timestamptz
);

create table restore_points (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references orgs(id) on delete cascade,
  repo_id           uuid not null references linked_repos(id) on delete cascade,
  tag               text,
  sha               text not null,
  bundle_hash       text,
  migration_version text,
  lambda_versions   jsonb not null default '{}',  -- {"sql-lambda": 42, ...}
  db_snapshot_id    text,
  environment       text not null default 'prod',
  notes             text,
  created_at        timestamptz not null default now()
);
create index on restore_points (repo_id, created_at desc);

create table events (
  id         bigint generated always as identity primary key,
  org_id     uuid not null references orgs(id) on delete cascade,
  repo_id    uuid references linked_repos(id) on delete cascade,
  kind       text not null,                       -- decision | deploy | drift | system
  payload    jsonb not null default '{}',
  at         timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Row-level security — org members read their org's rows; writes go through
-- the service role (API routes), which bypasses RLS by design.
-- ----------------------------------------------------------------------------

alter table orgs            enable row level security;
alter table org_members     enable row level security;
alter table installations   enable row level security;
alter table linked_repos    enable row level security;
alter table dev_tokens      enable row level security;
alter table sessions        enable row level security;
alter table activity        enable row level security;
alter table branches        enable row level security;
alter table prs             enable row level security;
alter table claims          enable row level security;
alter table restore_points  enable row level security;
alter table events          enable row level security;

create policy "members read own orgs"        on orgs           for select using (id in (select my_org_ids()));
create policy "members read own membership"  on org_members    for select using (org_id in (select my_org_ids()));
create policy "members read installations"   on installations  for select using (org_id in (select my_org_ids()));
create policy "members read repos"           on linked_repos   for select using (org_id in (select my_org_ids()));
create policy "members read own tokens"      on dev_tokens     for select using (user_id = auth.uid());
create policy "members read sessions"        on sessions       for select using (org_id in (select my_org_ids()));
create policy "members read activity"        on activity       for select using (org_id in (select my_org_ids()));
create policy "members read branches"        on branches       for select using (org_id in (select my_org_ids()));
create policy "members read prs"             on prs            for select using (org_id in (select my_org_ids()));
create policy "members read claims"          on claims         for select using (org_id in (select my_org_ids()));
create policy "members read restore points"  on restore_points for select using (org_id in (select my_org_ids()));
create policy "members read events"          on events         for select using (org_id in (select my_org_ids()));

-- Realtime: expose presence + PR tables on the default publication.
alter publication supabase_realtime add table sessions, activity, prs, branches, claims, events;
