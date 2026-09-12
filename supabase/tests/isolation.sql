-- ============================================================================
-- Can one team see another team's data? Run this in the SQL editor (or any
-- psql session as the owner). It plants canary rows in the FIRST team, adds a
-- throwaway user as a plain member of the SECOND team, then reads everything
-- back as that member — and rolls the whole thing back, so nothing survives.
--
-- Every count in the result must be 0 except the two "own team" totals.
--
-- Why canaries: a test that passes because a table happens to be empty is not
-- a test. These rows guarantee there is something to leak.
--
-- The API side of the same question lives in tools/isolation-test.sh (two real
-- dev tokens against the live endpoints).
-- ============================================================================

begin;

-- Two teams, in a fixed order, whatever they are called.
create temporary table t_orgs on commit drop as
  select id, name, row_number() over (order by created_at) as n from orgs;
grant select on t_orgs to authenticated;   -- the member role reads it below

-- Canaries in team 1.
insert into tasks (org_id, repo_id, title, priority, status, created_by)
  select o.id, r.id, 'CANARY task', 3, 'open', 'canary'
  from t_orgs o join linked_repos r on r.org_id = o.id where o.n = 1;
insert into journals (org_id, repo_id, dev_label, summary, at)
  select o.id, r.id, 'canary', 'CANARY journal', now()
  from t_orgs o join linked_repos r on r.org_id = o.id where o.n = 1;

-- A throwaway user, a plain member of team 2 only.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', '00000000-dead-4bee-8000-00000000c0de',
        'authenticated', 'authenticated', 'canary@example.invalid', crypt('x', gen_salt('bf')),
        now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"user_name":"canary"}');
insert into org_members (org_id, user_id, role, github_login)
  select id, '00000000-dead-4bee-8000-00000000c0de', 'member', 'canary' from t_orgs where n = 2;

-- Now be that member.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-dead-4bee-8000-00000000c0de","role":"authenticated"}', true);

with tamper_other as (
  update orgs set name = name where id = (select id from t_orgs where n = 1) returning 1
), promote_self as (
  update org_members set role = 'owner' where user_id = '00000000-dead-4bee-8000-00000000c0de' returning 1
)
select 'must all be zero' as expect,
  (select count(*) from tasks    where title   like 'CANARY%') as canary_tasks,
  (select count(*) from journals where summary like 'CANARY%') as canary_journals,
  (select count(*) from orgs where id = (select id from t_orgs where n = 1)) as other_team,
  (select count(*) from linked_repos where org_id = (select id from t_orgs where n = 1)) as other_teams_repos,
  (select count(*) from dev_tokens) as other_peoples_tokens,
  (select count(*) from tamper_other) as renamed_other_team,
  (select count(*) from promote_self) as self_promoted;

rollback;
