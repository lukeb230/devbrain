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
--   p_mode 'strict' — websearch syntax, every term must match (explicit searches)
--   p_mode 'any'    — OR of the query's lexemes, ranked by how many match
--                     (natural-language prompts → relevant_history)
create or replace function memory_search(p_repo uuid, p_q text, p_limit int default 8, p_mode text default 'strict')
returns table (kind text, source_id text, title text, snippet text, by_label text, at timestamptz, rank real)
language sql stable as $$
  with q as (
    select case
      when p_mode = 'any' then
        (select to_tsquery('english', string_agg(lexeme, ' | '))
           from unnest(to_tsvector('english', p_q)))
      else websearch_to_tsquery('english', p_q)
    end as tsq
  )
  select m.kind, m.source_id, m.title,
         ts_headline('english', m.body, q.tsq,
                     'MaxFragments=2, MaxWords=28, MinWords=10, FragmentDelimiter=" … ", StartSel="", StopSel=""') as snippet,
         m.by_label, m.at,
         ts_rank_cd(m.tsv, q.tsq) as rank
  from memory_index m, q
  where q.tsq is not null
    and m.repo_id = p_repo
    and m.tsv @@ q.tsq
  order by rank desc, m.at desc
  limit greatest(1, least(coalesce(p_limit, 8), 25));
$$;
