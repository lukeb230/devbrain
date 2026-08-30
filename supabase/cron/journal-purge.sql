-- Journal queue purge — hourly. Only rows the tick is finished with:
--   · attempts >= 3   — the summariser gave up (last_reply holds the raw
--                       reply for diagnosis); keep 24h for that, then drop
--   · older than 7d   — hard cap on growth if the tick is down for a week
-- Unprocessed rows younger than 7 days are left alone: a queued journal
-- must survive a missing API key, an outage, or a day at the AI cap. The
-- tick alerts (tick.journal_backlog) when the queue stops draining.
--
-- Apply with:  select cron.alter_job(job_id := <id>, command := $$ ... $$);
-- (job name: devbrain-journal-purge)
delete from journal_queue
 where (attempts >= 3 and at < now() - interval '24 hours')
    or at < now() - interval '7 days';
