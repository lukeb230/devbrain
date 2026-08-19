-- Task lanes — collision avoidance at ASSIGNMENT time.
-- tasks.footprint: predicted path prefixes this task will touch (stamped by
--   the footprint agent on the tick; null = not yet predicted).
-- tasks.started_by/started_at: who is actively working the task (set by
--   start_task; the dispatcher never hands a started task to someone else).
-- claims.task_id: lane claims created by start_task — released automatically
--   when the task completes.

alter table tasks add column if not exists footprint jsonb;
alter table tasks add column if not exists footprint_at timestamptz;
alter table tasks add column if not exists started_by text;
alter table tasks add column if not exists started_at timestamptz;
alter table claims add column if not exists task_id uuid references tasks(id) on delete set null;
