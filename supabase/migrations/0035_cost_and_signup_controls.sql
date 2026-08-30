-- ============================================================================
-- Cost & abuse controls for going public.
-- ============================================================================

-- New orgs get a modest cap; existing orgs (incl. the operator's) are untouched.
alter table orgs alter column ai_daily_cap set default 50;

-- Operator-tunable limits & signup mode, in system_state (one row each, no
-- deploy to change). Seeded conservative-but-non-blocking.
insert into system_state (key, value)
values ('ai_limits', jsonb_build_object('global_daily', 5000))
on conflict (key) do nothing;
insert into system_state (key, value)
values ('signups', jsonb_build_object('mode', 'invite'))
on conflict (key) do nothing;

-- ai_reserve, reworked: check BOTH the org cap and the global daily ceiling
-- BEFORE incrementing, so (a) usage never runs past the cap the way the old
-- insert-then-compare did — which meant raising a cap mid-day couldn't unblock
-- — and (b) one runaway org can't spend the whole platform's budget.
-- Returns true and reserves one call, or false and reserves nothing.
create or replace function ai_reserve(p_org uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_cap int;
  v_today date := (now() at time zone 'utc')::date;
  v_org_now int;
  v_global int;
  v_global_now bigint;
begin
  select ai_daily_cap into v_cap from orgs where id = p_org;
  if v_cap is null then return false; end if;

  select coalesce(calls, 0) into v_org_now from ai_usage where org_id = p_org and day = v_today;
  if v_org_now >= v_cap then return false; end if;

  select (value->>'global_daily')::int into v_global from system_state where key = 'ai_limits';
  if v_global is not null then
    select coalesce(sum(calls), 0) into v_global_now from ai_usage where day = v_today;
    if v_global_now >= v_global then return false; end if;
  end if;

  insert into ai_usage (org_id, day, calls) values (p_org, v_today, 1)
    on conflict (org_id, day) do update set calls = ai_usage.calls + 1, updated_at = now();
  return true;
end $$;

-- Grants unchanged (service_role only — 0030 revoked anon/authenticated).
