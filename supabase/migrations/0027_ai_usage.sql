-- ============================================================================
-- Team onboarding, part 2: per-org AI budget.
-- Every Claude call is charged to an org; past orgs.ai_daily_cap the call is
-- refused (AiCapExceeded) and the tick skips that org's AI units until UTC
-- midnight. Deterministic work is never affected.
-- ============================================================================

alter table orgs add column if not exists ai_daily_cap int not null default 300;
alter table orgs add column if not exists plan text not null default 'beta';

create table if not exists ai_usage (
  org_id        uuid not null references orgs(id) on delete cascade,
  day           date not null default (now() at time zone 'utc')::date,
  calls         int not null default 0,
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (org_id, day)
);
alter table ai_usage enable row level security;
create policy "members read ai usage" on ai_usage
  for select using (org_id in (select my_org_ids()));

-- Reserve one call: bumps today's counter and says whether it was within cap.
create or replace function ai_reserve(p_org uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_calls int; v_cap int;
begin
  select ai_daily_cap into v_cap from orgs where id = p_org;
  if v_cap is null then return false; end if;
  insert into ai_usage (org_id, day, calls) values (p_org, (now() at time zone 'utc')::date, 1)
    on conflict (org_id, day) do update set calls = ai_usage.calls + 1, updated_at = now()
    returning calls into v_calls;
  return v_calls <= v_cap;
end $$;

create or replace function ai_record(p_org uuid, p_in bigint, p_out bigint)
returns void language sql security definer set search_path = public as $$
  update ai_usage set input_tokens = input_tokens + p_in, output_tokens = output_tokens + p_out, updated_at = now()
  where org_id = p_org and day = (now() at time zone 'utc')::date;
$$;
