-- Diagnostics: keep the model's raw reply on a queue row when it failed to
-- parse, so "unparseable summary" can be investigated from SQL.
alter table journal_queue add column if not exists last_reply text;
