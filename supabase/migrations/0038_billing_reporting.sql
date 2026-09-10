-- Billing, phase 2: markers so usage is reported to Stripe exactly once.
alter table ai_usage add column if not exists reported_at timestamptz;
alter table orgs add column if not exists seats_reported_period_end timestamptz;
