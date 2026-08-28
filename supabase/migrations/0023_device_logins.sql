-- Device (desktop app) sign-in handoff.
--
-- The desktop panel is a webview with its own cookie jar; asking people to
-- log in to GitHub *inside* it fails for Google/SSO-backed GitHub accounts
-- (the provider opens a new window the panel can't keep). So the panel sends
-- the user to their normal browser, the site completes OAuth there, then
-- issues a ONE-TIME token that the browser hands back to the app via a
-- devbrain:// URL. The panel loads /auth/device?token=… and the server turns
-- that token into a session for the panel's own cookie jar.
--
-- Rows are short-lived (5 min) and single-use; the plaintext token is never
-- stored (hash only), mirroring dev_tokens.

create table if not exists device_logins (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  token_hash  text not null unique,
  channel     text not null default 'stable',
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '5 minutes',
  used_at     timestamptz
);
create index if not exists device_logins_expiry_idx on device_logins (expires_at);

alter table device_logins enable row level security;   -- service role only

select cron.unschedule('devbrain-device-login-purge') from cron.job where jobname = 'devbrain-device-login-purge';
select cron.schedule('devbrain-device-login-purge', '*/30 * * * *',
  $$delete from device_logins where expires_at < now() - interval '1 hour'$$);
