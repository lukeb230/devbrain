-- A token with no last-use has no way to be told apart from one on a laptop
-- somebody stopped using. Stamped by resolveDevToken, at most once per 5 min.
alter table dev_tokens add column if not exists last_used_at timestamptz;
