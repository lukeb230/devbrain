-- Pin a task to the panel's Home tab for the whole team, until it's done.
alter table tasks add column if not exists pinned boolean not null default false;
