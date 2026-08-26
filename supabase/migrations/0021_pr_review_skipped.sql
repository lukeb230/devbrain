-- PR reviews: a fourth verdict, 'skipped', for PRs the agent cannot review
-- (e.g. GitHub refuses the diff: > 20,000 lines). Recording it stops the
-- tick from retrying the same PR every 2 minutes and starving the rest.
alter table pr_reviews drop constraint if exists pr_reviews_verdict_check;
alter table pr_reviews add constraint pr_reviews_verdict_check
  check (verdict in ('looks_good', 'caution', 'risky', 'skipped'));
