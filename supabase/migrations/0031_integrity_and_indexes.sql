-- ---------------------------------------------------------------------------
-- Integrity: two things that were "prevented" by convention only.
-- ---------------------------------------------------------------------------

-- One journal per session. A double SessionEnd, or the rescue script
-- re-posting an envelope whose delete failed, used to queue two rows and
-- produce two journals. The route inserts with ON CONFLICT DO NOTHING.
-- (Plain unique: NULL session_ids stay distinct, so legacy rows are fine.)
alter table journal_queue add constraint journal_queue_session_id_key unique (session_id);

-- One open lane per (task, teammate). start_task now reuses an existing
-- claim; this is the backstop against the race it used to lose.
create unique index if not exists claims_one_open_per_task_label
  on claims (task_id, lower(dev_label)) where released_at is null and task_id is not null;

-- ---------------------------------------------------------------------------
-- Hot paths. The collision guard reads open claims on EVERY file edit; the
-- feed and context read events by kind, newest first. Both were seq scans.
-- ---------------------------------------------------------------------------
create index if not exists claims_open_by_repo_idx on claims (repo_id, expires_at) where released_at is null;
create index if not exists events_repo_kind_at_idx on events (repo_id, kind, at desc);

-- ---------------------------------------------------------------------------
-- Foreign keys without a covering index (Supabase advisor, 35 of them —
-- nearly all org_id, the filter on essentially every query in the product).
-- ---------------------------------------------------------------------------
create index if not exists activity_org_id_idx on activity (org_id);
create index if not exists activity_session_id_idx on activity (session_id);
create index if not exists allowed_members_org_id_idx on allowed_members (org_id);
create index if not exists branches_org_id_idx on branches (org_id);
create index if not exists claims_org_id_idx on claims (org_id);
create index if not exists claims_repo_id_idx on claims (repo_id);
create index if not exists claims_task_id_idx on claims (task_id);
create index if not exists claims_user_id_idx on claims (user_id);
create index if not exists dev_tokens_org_id_idx on dev_tokens (org_id);
create index if not exists dev_tokens_user_id_idx on dev_tokens (user_id);
create index if not exists device_logins_user_id_idx on device_logins (user_id);
create index if not exists digests_org_id_idx on digests (org_id);
create index if not exists events_org_id_idx on events (org_id);
create index if not exists events_repo_id_idx on events (repo_id);
create index if not exists handoffs_org_id_idx on handoffs (org_id);
create index if not exists handoffs_task_id_idx on handoffs (task_id);
create index if not exists installations_org_id_idx on installations (org_id);
create index if not exists journal_queue_org_id_idx on journal_queue (org_id);
create index if not exists journal_queue_repo_id_idx on journal_queue (repo_id);
create index if not exists journal_queue_session_id_idx on journal_queue (session_id);
create index if not exists journal_queue_task_id_idx on journal_queue (task_id);
create index if not exists journals_org_id_idx on journals (org_id);
create index if not exists journals_task_id_idx on journals (task_id);
create index if not exists linked_repos_installation_id_idx on linked_repos (installation_id);
create index if not exists org_members_user_id_idx on org_members (user_id);
create index if not exists policies_org_id_idx on policies (org_id);
create index if not exists pr_reviews_org_id_idx on pr_reviews (org_id);
create index if not exists prs_org_id_idx on prs (org_id);
create index if not exists reminder_sources_repo_id_idx on reminder_sources (repo_id);
create index if not exists restore_points_org_id_idx on restore_points (org_id);
create index if not exists sessions_org_id_idx on sessions (org_id);
create index if not exists sessions_user_id_idx on sessions (user_id);
create index if not exists spec_items_org_id_idx on spec_items (org_id);
create index if not exists spec_items_repo_id_idx on spec_items (repo_id);
create index if not exists spec_items_task_id_idx on spec_items (task_id);
create index if not exists specs_org_id_idx on specs (org_id);
create index if not exists tasks_org_id_idx on tasks (org_id);

-- The one RLS policy that re-evaluated auth.uid() per row.
drop policy if exists "members read own tokens" on dev_tokens;
create policy "members read own tokens" on dev_tokens
  for select using (user_id = (select auth.uid()));
