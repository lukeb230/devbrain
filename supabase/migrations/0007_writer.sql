-- Direction 2 ("Copilot"): the separate writer GitHub App. A repo gains
-- write features only when (a) the writer app is installed on it AND
-- (b) the team turns the specific feature policy on. Both default to off.
alter table linked_repos add column if not exists writer_installation_id bigint;
