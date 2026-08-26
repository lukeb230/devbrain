-- Team memory index — one full-text index over everything the team has
-- learned: journals, decisions, broadcasts, handoffs, AI PR reviews, tasks,
-- and .brain/ notes. Kept fresh by the agent tick (unit 1.9, deterministic,
-- no API key needed). Searched by /api/v1/memory/search, the
-- search_team_memory MCP tool, and the context digest's relevant_history.
--
-- Postgres FTS only (websearch syntax, english). Semantic/vector search is
-- deliberately deferred: pgvector is available on the project and would be a
-- single nullable column here if keyword search ever falls short.

create table if not exists memory_index (
  repo_id    uuid not null references linked_repos(id) on delete cascade,
  kind       text not null,          -- journal | decision | broadcast | handoff | pr_review | task | brain
  source_id  text not null,          -- source row id, or note filename for brain
  title      text not null,
  body       text not null,
  by_label   text,                   -- author, always carried through to results
  at         timestamptz not null,
  indexed_at timestamptz not null default now(),
  tsv        tsvector generated always as (
               setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
               setweight(to_tsvector('english', coalesce(body, '')), 'B')
             ) stored,
  primary key (repo_id, kind, source_id)
);
create index if not exists memory_index_tsv_idx on memory_index using gin (tsv);
create index if not exists memory_index_repo_at_idx on memory_index (repo_id, at desc);

-- Per-source cursors so the indexer only reads what changed since last tick.
create table if not exists memory_cursor (
  key     text primary key,          -- e.g. 'journal', 'event', 'brain:<repo_id>'
  last_at timestamptz not null default 'epoch'
);

alter table memory_index enable row level security;   -- service role only
alter table memory_cursor enable row level security;  -- service role only

-- Ranked search with highlighted snippets. Called with the service role.
create or replace function memory_search(p_repo uuid, p_q text, p_limit int default 8)
returns table (kind text, source_id text, title text, snippet text, by_label text, at timestamptz, rank real)
language sql stable as $$
  select m.kind, m.source_id, m.title,
         ts_headline('english', m.body, websearch_to_tsquery('english', p_q),
                     'MaxFragments=2, MaxWords=28, MinWords=10, FragmentDelimiter=" … ", StartSel="", StopSel=""') as snippet,
         m.by_label, m.at,
         ts_rank_cd(m.tsv, websearch_to_tsquery('english', p_q)) as rank
  from memory_index m
  where m.repo_id = p_repo
    and m.tsv @@ websearch_to_tsquery('english', p_q)
  order by rank desc, m.at desc
  limit greatest(1, least(coalesce(p_limit, 8), 25));
$$;
