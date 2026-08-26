-- Reminders sync: tasks sourced from a shared Apple Reminders list.
-- external_ref holds the reminder's stable ID so the collector can upsert
-- idempotently — re-posting the same list never duplicates a task, and
-- checking a reminder off on a phone completes the matching task here.

alter table tasks add column if not exists external_ref text;

-- One task per reminder per repo. Partial index: manual tasks (null ref)
-- are unaffected.
create unique index if not exists tasks_external_ref_idx
  on tasks (repo_id, external_ref) where external_ref is not null;
