-- ============================================================================
-- Leads — people who want in but are not signing up today, either because the
-- beta is full or because they are not ready.
--
-- Deliberately thin: an address, where it came from, and when. No name, no
-- company, no tracking fields. It exists so that "the beta is full" stops
-- being a dead end, and so there is a list to write to when it reopens.
--
-- Service role only, like every other table here. Nothing reads this but the
-- operator.
-- ============================================================================

create table if not exists leads (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  -- Which surface captured it: 'landing', 'beta_full', …
  source      text not null default 'landing',
  created_at  timestamptz not null default now(),
  -- Stamped when this person is actually written to, so a later send can skip
  -- the ones already contacted.
  notified_at timestamptz
);

-- One row per address. A second submit refreshes nothing and fails quietly:
-- someone typing their email twice is not an error worth showing them.
create unique index if not exists leads_email_key on leads (lower(email));
create index if not exists leads_created_idx on leads (created_at desc);

alter table leads enable row level security;  -- service role only, no policies
