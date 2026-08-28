-- Tick watchdog — run ONCE per Supabase project, in the SQL editor.
-- Pure Postgres, independent of Vercel: every 5 minutes, if the agent tick's
-- heartbeat (system_state.last_tick) is older than 10 minutes, POST to the
-- ops webhook via pg_net. Re-alerts hourly while dead; one "recovered" when
-- the heartbeat returns. State lives in system_state key 'watchdog'.
--
-- Set the webhook first (Slack or Discord incoming-webhook URL):
--   insert into system_state (key, value) values ('ops_webhook', '{"url":"https://hooks.slack.com/…"}')
--   on conflict (key) do update set value = excluded.value;
-- With no ops_webhook row the job runs and does nothing.
-- Re-running this file is safe — the job is unscheduled first.

select cron.unschedule('devbrain-watchdog')
where exists (select 1 from cron.job where jobname = 'devbrain-watchdog');

select cron.schedule('devbrain-watchdog', '*/5 * * * *', $$
do $body$
declare
  v_url text;
  v_age interval;
  v_state jsonb;
  v_dead boolean;
  v_last_notified timestamptz;
  v_msg text;
  v_body jsonb;
begin
  select value->>'url' into v_url from system_state where key = 'ops_webhook';
  if v_url is null or v_url = '' then return; end if;

  select now() - updated_at into v_age from system_state where key = 'last_tick';
  v_dead := v_age is null or v_age > interval '10 minutes';

  select value into v_state from system_state where key = 'watchdog';
  v_state := coalesce(v_state, '{}'::jsonb);
  v_last_notified := (v_state->>'last_notified_at')::timestamptz;

  if v_dead then
    if v_last_notified is null or now() - v_last_notified > interval '1 hour' then
      v_msg := '🔴 DevBrain · ops · agent tick is DEAD — last heartbeat ' || coalesce(to_char(v_age, 'HH24:MI:SS'), 'never') || ' ago. Check Vercel + the pg_cron job (supabase/cron/agent-tick.sql).';
      v_state := jsonb_build_object('dead', true, 'last_notified_at', now());
    else
      return;
    end if;
  else
    if coalesce((v_state->>'dead')::boolean, false) then
      v_msg := '🟢 DevBrain · ops · recovered: agent tick heartbeat is back.';
      v_state := jsonb_build_object('dead', false, 'last_notified_at', null);
    else
      return;
    end if;
  end if;

  if v_url like '%discord%' then v_body := jsonb_build_object('content', v_msg);
  else v_body := jsonb_build_object('text', v_msg); end if;

  perform net.http_post(url := v_url, headers := '{"content-type":"application/json"}'::jsonb, body := v_body, timeout_milliseconds := 5000);
  insert into system_state (key, value, updated_at) values ('watchdog', v_state, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
end $body$;
$$);
