-- Spawned sessions: a child token is a full teammate (label = identity, as
-- everywhere) that belongs to a parent token. One level deep — children
-- cannot mint children. Revoking or deleting the parent takes the children
-- with it.
alter table dev_tokens add column if not exists parent_token_id uuid references dev_tokens(id) on delete cascade;

-- Two live tokens with the same label for one user would be two teammates
-- wearing one name badge: presence, claims and journals would blur them.
-- Loud 409 at mint time instead.
create unique index if not exists dev_tokens_live_label_per_user
  on dev_tokens (user_id, lower(label)) where revoked_at is null;

create index if not exists dev_tokens_parent_idx on dev_tokens (parent_token_id);
