-- ============================================================================
-- Agent tick schedule — run ONCE per Supabase project, in the SQL editor.
--
-- This is deliberately not a migration: it embeds DEVBRAIN_CRON_SECRET, which
-- must match the Vercel env var of the same name. Replace the two
-- placeholders, run it, then confirm with:
--
--   select jobname, schedule from cron.job where jobname = 'devbrain-agent-tick';
--
-- and, a few minutes later, `devbrain doctor` (it reads the tick heartbeat).
-- Re-running is safe — the job is unscheduled first.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('devbrain-agent-tick')
  from cron.job where jobname = 'devbrain-agent-tick';

select cron.schedule('devbrain-agent-tick', '*/2 * * * *', $$
  select net.http_post(
    url := 'https://__DEPLOYMENT_HOST__/api/agents/tick',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-devbrain-cron', '__CRON_SECRET__'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$$);
