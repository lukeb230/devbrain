-- Reminders sources — the list → repo mapping, owned by the TEAM on the
-- server instead of by whichever Mac happened to run the collector.
--
-- Before: each Mac's ~/.devbrain/config.json said "list X → repo Y" and
-- posted items with the repo name; two Macs could (and did) map the same list
-- to different repos, duplicating every task. Now collectors post
-- "here is list X and its items" and the server routes by this table. One
-- list maps to exactly one repo per org; unmapped lists are ignored but
-- remembered (reminder_sightings) so the dashboard can offer them.

create table if not exists reminder_sources (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  repo_id     uuid not null references linked_repos(id) on delete cascade,
  list_name   text not null,
  created_by  text,
  created_at  timestamptz not null default now()
);
-- Case-insensitive uniqueness: "Team Inbox" and "team inbox" are the same list.
create unique index if not exists reminder_sources_org_list_idx
  on reminder_sources (org_id, lower(list_name));

-- Lists a collector can see on some Mac, mapped or not. Powers the "map this
-- list" picker; rows are upserted by (org, list) with the latest sighting.
create table if not exists reminder_sightings (
  org_id      uuid not null references orgs(id) on delete cascade,
  list_name   text not null,
  seen_by     text,
  item_count  int,
  last_seen   timestamptz not null default now(),
  primary key (org_id, list_name)
);

alter table reminder_sources enable row level security;
alter table reminder_sightings enable row level security;
create policy "members read reminder_sources"   on reminder_sources   for select using (org_id in (select my_org_ids()));
create policy "members read reminder_sightings" on reminder_sightings for select using (org_id in (select my_org_ids()));

alter publication supabase_realtime add table reminder_sources;
