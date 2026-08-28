-- ============================================================================
-- Team onboarding, part 1: invite links + owners for existing orgs.
-- Additive: new table only. allowed_members stays in place (no longer read).
-- ============================================================================

create table if not exists org_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  code        text not null unique,                 -- random, in the URL
  role        text not null default 'member' check (role in ('admin','member')),
  created_by  text,
  max_uses    int,                                  -- null = unlimited
  uses        int not null default 0,
  expires_at  timestamptz not null default now() + interval '7 days',
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists org_invites_org_idx on org_invites(org_id);

alter table org_invites enable row level security;
create policy "members read invites" on org_invites
  for select using (org_id in (select my_org_ids()));

-- Every org gets an owner: the earliest member of any org that has none.
update org_members m set role = 'owner'
where m.role <> 'owner'
  and not exists (select 1 from org_members o where o.org_id = m.org_id and o.role = 'owner')
  and m.created_at = (select min(created_at) from org_members x where x.org_id = m.org_id);
