-- ============================================================================
-- Give a team its call back when the provider fails.
--
-- ai_reserve() increments BEFORE the API call, which is correct — it is what
-- stops a burst from running past the cap. But nothing ever undid it, so a
-- provider outage spent real customers' allowances on calls that produced
-- nothing. Measured on 2026-09-12: 179 calls charged against a 40/day
-- allowance while the Anthropic key had no credit and every call failed.
--
-- Refund is idempotent-safe (floored at zero) and only ever called on a
-- failed call, so a double-refund cannot create negative usage.
-- ============================================================================

create or replace function ai_refund(p_org uuid, p_overage boolean default false)
returns void language sql security definer set search_path = public as $$
  update ai_usage
     set calls   = greatest(0, calls - 1),
         overage = case when p_overage then greatest(0, overage - 1) else overage end,
         updated_at = now()
   where org_id = p_org
     and day = (now() at time zone 'utc')::date
$$;

revoke all on function ai_refund(uuid, boolean) from public, anon, authenticated;
grant execute on function ai_refund(uuid, boolean) to service_role;
