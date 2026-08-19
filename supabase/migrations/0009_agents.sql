-- Agent tier: server-side Claude features (PR review agent + standup digest).
-- Reviews and digests are DevBrain-only surfaces — nothing is written to GitHub.

-- PRs need a head sha so a review binds to an exact state of the branch.
alter table prs add column if not exists head_sha text;

create table if not exists pr_reviews (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  repo_id     uuid not null references linked_repos(id) on delete cascade,
  pr_number   int  not null,
  head_sha    text not null,
  verdict     text not null check (verdict in ('looks_good', 'caution', 'risky')),
  summary     text not null,
  points      jsonb not null default '[]',   -- [{kind: 'risk'|'suggestion'|'brain', text}]
  model       text,
  created_at  timestamptz not null default now(),
  unique (repo_id, pr_number, head_sha)
);
create index if not exists pr_reviews_repo_pr_idx on pr_reviews (repo_id, pr_number, created_at desc);

alter table pr_reviews enable row level security;
create policy "members read pr_reviews" on pr_reviews for select using (org_id in (select my_org_ids()));

create table if not exists digests (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  day         date not null,
  body        text not null,
  model       text,
  created_at  timestamptz not null default now(),
  unique (org_id, day)
);

alter table digests enable row level security;
create policy "members read digests" on digests for select using (org_id in (select my_org_ids()));

alter publication supabase_realtime add table pr_reviews;
alter publication supabase_realtime add table digests;
