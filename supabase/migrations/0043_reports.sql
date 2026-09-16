-- supabase/migrations/0043_reports.sql
-- Support questions, bug reports and feature requests, from the website
-- (/support, all three kinds) and the Console (/desk/help, bug + feature).
-- Every submission is a row whether or not the email went out: the inbox is
-- the queue, the table is the record. `ref` is the number people see
-- ("DB-1042"). `context` is what the Console attaches on its own (app
-- version, channel, team name, last setup result) — never a token or a
-- path. Service role only, like leads.
create table if not exists reports (
  id          uuid primary key default gen_random_uuid(),
  ref         bigint generated always as identity,
  kind        text not null check (kind in ('support', 'bug', 'feature')),
  source      text not null check (source in ('web', 'console')),
  email       text not null,
  name        text,
  subject     text not null,
  message     text not null,
  user_id     uuid references auth.users (id) on delete set null,
  org_id      uuid references orgs (id) on delete set null,
  context     jsonb not null default '{}'::jsonb,
  mail_status text not null default 'pending' check (mail_status in ('pending', 'sent', 'failed')),
  mail_error  text,
  created_at  timestamptz not null default now()
);

create unique index if not exists reports_ref_key on reports (ref);
create index if not exists reports_created_idx on reports (created_at desc);

alter table reports enable row level security;  -- service role only, no policies
