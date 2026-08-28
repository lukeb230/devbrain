-- ============================================================================
-- Error alerting.
--   alert_log      — every distinct failure (fingerprinted by scope+key),
--                    with counts and throttle state. org_id null = ops scope.
--   alert_channels — where alerts are delivered. kind is open-ended so email,
--                    PagerDuty, etc. are a new adapter, not a schema change.
--                    org_id null = the operator's channel.
-- In-app delivery needs no channel row: owners/admins see open org alerts
-- on the dashboard and widget.
-- ============================================================================

create table if not exists alert_log (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid references orgs(id) on delete cascade,   -- null = ops
  key              text not null,                                -- e.g. tick.review, http.500
  severity         text not null default 'error' check (severity in ('info','warn','error')),
  title            text not null,
  detail           text,
  count            int not null default 1,
  first_seen       timestamptz not null default now(),
  last_seen        timestamptz not null default now(),
  last_notified_at timestamptz,
  resolved_at      timestamptz,
  resolved_by      text
);
-- One OPEN row per (scope, key); resolved rows are history.
create unique index if not exists alert_log_open_idx on alert_log (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), key) where resolved_at is null;
create index if not exists alert_log_org_idx on alert_log (org_id, last_seen desc);

create table if not exists alert_channels (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references orgs(id) on delete cascade,        -- null = ops
  kind        text not null,                                     -- 'webhook' today; 'email', … later
  target      text not null,                                     -- URL / address
  enabled     boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists alert_channels_org_idx on alert_channels (org_id);

alter table alert_log enable row level security;
alter table alert_channels enable row level security;
create policy "members read org alerts"   on alert_log      for select using (org_id in (select my_org_ids()));
create policy "members read org channels" on alert_channels for select using (org_id in (select my_org_ids()));
