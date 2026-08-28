-- Digests become per-repo. They were org-wide: one digest a day blending every
-- linked repo's activity, shown inside every repo's Overview and served into
-- every Claude's context — so working in one repo meant reading about
-- another. A repo page must only ever show that repo's data.
--
-- Existing rows hold blended, now-meaningless content, so they're dropped.

alter table digests add column if not exists repo_id uuid references linked_repos(id) on delete cascade;
delete from digests where repo_id is null;
alter table digests drop constraint if exists digests_org_id_day_key;
alter table digests alter column repo_id set not null;
alter table digests add constraint digests_repo_day_key unique (repo_id, day);
create index if not exists digests_repo_idx on digests (repo_id, day desc);
