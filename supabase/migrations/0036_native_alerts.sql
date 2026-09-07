-- ============================================================================
-- Native-only alerts.
--   * alert_log joins the realtime publication: the Mac app subscribes and
--     shows a macOS notification when a row is inserted / re-notified /
--     recovered. RLS scopes what each connection receives.
--   * The operator's team (system_state key 'operator' = {"org_id": …}) also
--     receives org_id-null (ops) rows, so tick failures, unhandled 500s and
--     the Postgres watchdog reach the operator's Mac.
--   * alert_channels (Slack/Discord webhooks) is gone. No outbound HTTP from
--     alerting anywhere — see src/lib/alerts.ts and supabase/cron/watchdog.sql.
-- ============================================================================

-- Realtime delivery.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'alert_log'
  ) then
    alter publication supabase_realtime add table alert_log;
  end if;
end $$;

-- Is the caller a member of the operator's team?
create or replace function is_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from system_state s
    where s.key = 'operator'
      and (s.value->>'org_id')::uuid in (select my_org_ids())
  );
$$;
revoke all on function is_operator() from public;
grant execute on function is_operator() to authenticated;

drop policy if exists "operator reads ops alerts" on alert_log;
create policy "operator reads ops alerts" on alert_log
  for select using (org_id is null and is_operator());

-- Webhook channels are gone.
drop table if exists alert_channels;

-- Deployment data, set once per project (not here — it is not schema):
--   insert into system_state (key, value) values ('operator', '{"org_id":"<uuid of the operating team>"}')
--   on conflict (key) do update set value = excluded.value, updated_at = now();
