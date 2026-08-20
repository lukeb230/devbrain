-- Allowlist in the database instead of a Vercel env var.
-- Adding a teammate becomes "type their GitHub username, click Add" from the
-- dashboard — no Vercel access, no redeploy, doable from a phone.
-- This table is ADDITIVE with DEVBRAIN_ALLOWED_LOGINS (allowed = env ∪ table),
-- so adopting it can never lock anyone out — the env var keeps working and
-- new people can be added without touching Vercel.

create table if not exists allowed_members (
  login       text primary key,          -- GitHub username, lowercased
  org_id      uuid references orgs(id) on delete cascade,
  invited_by  text,
  note        text,
  created_at  timestamptz not null default now()
);

alter table allowed_members enable row level security;
create policy "members read allowlist" on allowed_members
  for select using (org_id in (select my_org_ids()));
