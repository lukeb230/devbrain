-- Tick watchdog — run ONCE per Supabase project, in the SQL editor.
-- Pure Postgres, independent of Vercel: every 5 minutes, if the agent tick's
-- heartbeat (system_state.last_tick) is older than 10 minutes, open an ops
-- alert (alert_log, org_id null). The operator's Mac app receives it over
-- realtime as a native notification. When the heartbeat returns the alert is
-- resolved by 'system' — the app announces "recovered". No webhooks, no
-- outbound HTTP.
--
-- Who is the operator? system_state key 'operator' = {"org_id": "<uuid>"}.
-- Re-running this file is safe — the job is unscheduled first.

select cron.unschedule('devbrain-watchdog')
where exists (select 1 from cron.job where jobname = 'devbrain-watchdog');

select cron.schedule('devbrain-watchdog', '*/5 * * * *', $$
do $body$
declare
  v_age interval;
  v_dead boolean;
  v_open uuid;
begin
  select now() - updated_at into v_age from system_state where key = 'last_tick';
  v_dead := v_age is null or v_age > interval '10 minutes';

  select id into v_open from alert_log
    where org_id is null and key = 'watchdog.tick' and resolved_at is null
    limit 1;

  if v_dead then
    if v_open is null then
      insert into alert_log (org_id, key, severity, title, detail, last_notified_at)
      values (null, 'watchdog.tick', 'error',
              'Agent tick is dead',
              'Last heartbeat ' || coalesce(to_char(v_age, 'HH24:MI:SS'), 'never') || ' ago. Check Vercel and the pg_cron job (supabase/cron/agent-tick.sql).',
              now());
    else
      -- Still dead: bump the count; re-notify hourly (the app watches last_notified_at).
      update alert_log
        set count = count + 1,
            last_seen = now(),
            detail = 'Last heartbeat ' || coalesce(to_char(v_age, 'HH24:MI:SS'), 'never') || ' ago. Check Vercel and the pg_cron job (supabase/cron/agent-tick.sql).',
            last_notified_at = case when last_notified_at is null or now() - last_notified_at > interval '1 hour' then now() else last_notified_at end
        where id = v_open;
    end if;
  elsif v_open is not null then
    update alert_log set resolved_at = now(), resolved_by = 'system' where id = v_open;
  end if;
end $body$;
$$);
