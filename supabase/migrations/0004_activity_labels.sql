-- Human-readable activity: each activity row snapshots WHO did it (dev_label)
-- and WHAT they were working on (label = the session's live status phrase at
-- the moment of the edit). The dashboard groups rows by these into entries
-- like "Luke — adding light/dark mode · 6 files" instead of a raw file list.

alter table activity add column if not exists dev_label text;
alter table activity add column if not exists label text;
