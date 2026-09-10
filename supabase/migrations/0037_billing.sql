-- ============================================================================
-- Billing, phase 0: the plan model. No customer-facing change yet.
--
--   orgs.plan            base | scale   (legacy "beta" → scale, comped)
--   orgs.billing_status  trialing | active | past_due | canceled | comped
--   orgs.ai_daily_cap    now DERIVED from the plan (plan_cap), kept for display
--   ai_usage.overage     actions past the daily allowance (billed at period end)
--   billing_seats()      distinct identities with a session in a window
--   ai_reserve()         returns 'allow' | 'overage' | 'paused' (was boolean)
--
-- Mirrors src/lib/billing/plans.ts — keep the two caps in step (parity test).
-- ============================================================================

alter table orgs
  add column if not exists billing_status text not null default 'trialing',
  add column if not exists trial_ends_at timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists period_start timestamptz,
  add column if not exists period_end timestamptz,
  add column if not exists overage_limit_cents int;

alter table orgs alter column plan set default 'base';
-- Existing teams (the operator's own) keep working with nothing to do: Scale,
-- comped, no overage limit. New teams start on Base, trialing. (Before the
-- check constraint: legacy rows say "beta".)
update orgs set plan = 'scale', billing_status = 'comped'
  where plan not in ('base', 'scale') or plan is null;
alter table orgs drop constraint if exists orgs_plan_check;
alter table orgs add constraint orgs_plan_check check (plan in ('base', 'scale'));
alter table orgs drop constraint if exists orgs_billing_status_check;
alter table orgs add constraint orgs_billing_status_check
  check (billing_status in ('trialing', 'active', 'past_due', 'canceled', 'comped'));

alter table ai_usage add column if not exists overage int not null default 0;

create or replace function plan_cap(p_plan text)
returns int language sql immutable as $$
  select case p_plan when 'scale' then 500 else 40 end
$$;

create or replace function plan_overage_limit_cents(p_plan text)
returns int language sql immutable as $$
  select case p_plan when 'scale' then 10000 else 2000 end
$$;

update orgs set ai_daily_cap = plan_cap(plan);

-- Seats: identities (any host, spawned sessions included) with at least one
-- session in the window. Case-insensitive on the label.
create or replace function billing_seats(p_org uuid, p_from timestamptz, p_to timestamptz)
returns int language sql stable security definer set search_path = public as $$
  select count(distinct lower(dev_label))::int
  from sessions
  where org_id = p_org and dev_label is not null
    and started_at >= p_from and started_at < p_to
$$;

-- Three-way reserve. Within the plan's daily allowance → 'allow'. Past it →
-- 'overage' while the period's overage spend stays under the team's limit
-- (null limit = plan default; comped = unlimited) → counted for the invoice.
-- Otherwise, or when the team is not entitled, or when the platform's global
-- ceiling is reached → 'paused' and nothing is reserved.
drop function if exists ai_reserve(uuid);
create or replace function ai_reserve(p_org uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_plan text;
  v_status text;
  v_trial_end timestamptz;
  v_period_end timestamptz;
  v_limit int;
  v_cap int;
  v_today date := (now() at time zone 'utc')::date;
  v_org_now int;
  v_global int;
  v_global_now bigint;
  v_month_overage bigint;
  v_period_from timestamptz;
begin
  select plan, billing_status, trial_ends_at, period_end, overage_limit_cents
    into v_plan, v_status, v_trial_end, v_period_end, v_limit
    from orgs where id = p_org;
  if v_plan is null then return 'paused'; end if;

  -- Entitlement (mirrors isEntitled in plans.ts).
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

  -- Overage: bounded by the period's limit unless comped.
  if v_status <> 'comped' then
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
revoke all on function billing_seats(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function ai_reserve(uuid) to service_role;
grant execute on function billing_seats(uuid, timestamptz, timestamptz) to service_role;
