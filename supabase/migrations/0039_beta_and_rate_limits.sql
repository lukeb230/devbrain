-- ============================================================================
-- Free beta + the limits that make going public survivable.
--
--   system_state.beta          {"free": bool, "max_teams": int, "max_members": int}
--   system_state.rate_limits   the ceilings below, tunable with no deploy
--   orgs.beta                  this team was created during the free beta
--   rate_counters + rate_take  a durable fixed-window counter shared by every
--                              serverless instance (the in-process limiter in
--                              src/lib/ratelimit.ts only bounds one instance)
--   platform_counts()          teams + distinct people, for the signup cap
--
-- Everything here is operator-tunable from one row: no deploy to open signups,
-- raise a cap, or end the free beta.
-- ============================================================================

-- ---- the beta switch -------------------------------------------------------
alter table orgs add column if not exists beta boolean not null default false;

insert into system_state (key, value)
values ('beta', jsonb_build_object('free', true, 'max_teams', 150, 'max_members', 600))
on conflict (key) do nothing;

-- A comped team with an explicit overage limit is bound by it. Without this,
-- "comped" meant unlimited AI past the daily allowance — fine for the
-- operator's own team, a hole for a hundred free beta teams sharing one
-- platform budget. Beta teams are created with a limit of 0, so they get the
-- plan's daily allowance and then pause; a null limit still means unlimited.
create or replace function ai_reserve(p_org uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_plan text; v_status text; v_trial_end timestamptz; v_period_end timestamptz;
  v_limit int; v_cap int; v_today date := (now() at time zone 'utc')::date;
  v_org_now int; v_global int; v_global_now bigint;
  v_month_overage bigint; v_period_from timestamptz;
begin
  select plan, billing_status, trial_ends_at, period_end, overage_limit_cents
    into v_plan, v_status, v_trial_end, v_period_end, v_limit
    from orgs where id = p_org;
  if v_plan is null then return 'paused'; end if;

  if v_status = 'canceled' then return 'paused'; end if;
  if v_status = 'trialing' and v_trial_end is not null and v_trial_end <= now() then return 'paused'; end if;
  if v_status = 'past_due' and v_period_end is not null and v_period_end + interval '7 days' <= now() then return 'paused'; end if;

  select (value->>'global_daily')::int into v_global from system_state where key = 'ai_limits';
  if v_global is not null then
    select coalesce(sum(calls), 0) into v_global_now from ai_usage where day = v_today;
    if v_global_now >= v_global then return 'paused'; end if;
  end if;

  v_cap := plan_cap(v_plan);
  select coalesce(calls, 0) into v_org_now from ai_usage where org_id = p_org and day = v_today;

  if v_org_now < v_cap then
    insert into ai_usage (org_id, day, calls) values (p_org, v_today, 1)
      on conflict (org_id, day) do update set calls = ai_usage.calls + 1, updated_at = now();
    return 'allow';
  end if;

  -- Overage. Unlimited only when comped AND no explicit limit is set.
  if v_status <> 'comped' or v_limit is not null then
    v_limit := coalesce(v_limit, plan_overage_limit_cents(v_plan));
    if v_limit <= 0 then return 'paused'; end if;
    select coalesce(period_start, date_trunc('month', now())) into v_period_from from orgs where id = p_org;
    select coalesce(sum(overage), 0) into v_month_overage
      from ai_usage where org_id = p_org and day >= v_period_from::date;
    if (v_month_overage + 1) * 10 > v_limit then return 'paused'; end if;
  end if;

  insert into ai_usage (org_id, day, calls, overage) values (p_org, v_today, 1, 1)
    on conflict (org_id, day) do update
      set calls = ai_usage.calls + 1, overage = ai_usage.overage + 1, updated_at = now();
  return 'overage';
end $$;

revoke all on function ai_reserve(uuid) from public, anon, authenticated;
grant execute on function ai_reserve(uuid) to service_role;

-- ---- rate limits -----------------------------------------------------------
insert into system_state (key, value)
values ('rate_limits', jsonb_build_object(
  'token_per_min', 240,      -- one agent session; a busy one does ~60
  'org_per_min',  1200,      -- a whole team's hooks at once
  'org_per_day', 200000,
  'ip_per_min',     60,      -- unauthenticated: invite links, device exchange
  'global_per_min', 30000    -- platform backstop, not a customer meter
))
on conflict (key) do nothing;

-- Fixed-window counters. One row per (bucket, window); rows older than a day
-- are swept by the tick. Counting stops once a window is over its limit, so a
-- sustained flood costs one row and no further growth.
create table if not exists rate_counters (
  bucket       text not null,
  window_start timestamptz not null,
  hits         bigint not null default 0,
  primary key (bucket, window_start)
);
create index if not exists rate_counters_window_idx on rate_counters (window_start);

alter table rate_counters enable row level security;  -- service role only

-- Add p_cost hits to the bucket's current window and return the new total.
-- Over the limit the total is returned but not increased further.
create or replace function rate_take(p_bucket text, p_limit int, p_window_secs int, p_cost int default 1)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_secs) * p_window_secs);
  v_hits bigint;
begin
  insert into rate_counters (bucket, window_start, hits)
  values (p_bucket, v_start, p_cost)
  on conflict (bucket, window_start) do update
    set hits = rate_counters.hits + case when rate_counters.hits > p_limit then 0 else p_cost end
  returning hits into v_hits;
  return v_hits;
end $$;

-- Several buckets in one round trip. p_checks is
--   [{"bucket": "...", "limit": 240, "window": 60, "cost": 1}, ...]
-- Returns the buckets that are over their limit (empty array = allowed).
create or replace function rate_take_many(p_checks jsonb)
returns text[] language plpgsql security definer set search_path = public as $$
declare
  c jsonb;
  v_over text[] := '{}';
  v_hits bigint;
begin
  for c in select * from jsonb_array_elements(p_checks) loop
    v_hits := rate_take(c->>'bucket', (c->>'limit')::int, (c->>'window')::int, coalesce((c->>'cost')::int, 1));
    if v_hits > (c->>'limit')::int then v_over := v_over || (c->>'bucket'); end if;
  end loop;
  return v_over;
end $$;

create or replace function rate_sweep()
returns int language sql security definer set search_path = public as $$
  with gone as (delete from rate_counters where window_start < now() - interval '1 day' returning 1)
  select count(*)::int from gone
$$;

-- ---- the signup cap --------------------------------------------------------
-- Teams, and the number of distinct people across all of them.
create or replace function platform_counts()
returns table (teams int, members int) language sql stable security definer set search_path = public as $$
  select (select count(*)::int from orgs),
         (select count(distinct user_id)::int from org_members)
$$;

revoke all on function rate_take(text, int, int, int) from public, anon, authenticated;
revoke all on function rate_take_many(jsonb) from public, anon, authenticated;
revoke all on function rate_sweep() from public, anon, authenticated;
revoke all on function platform_counts() from public, anon, authenticated;
grant execute on function rate_take(text, int, int, int) to service_role;
grant execute on function rate_take_many(jsonb) to service_role;
grant execute on function rate_sweep() to service_role;
grant execute on function platform_counts() to service_role;
