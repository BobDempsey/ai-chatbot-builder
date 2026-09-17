-- HNSW over cosine distance. The chunks a single session holds are few, but the
-- table holds every live session's chunks at once, so the index earns its keep.
create index chunks_embedding_idx on chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- Retrieval, with the two rules that matter baked in rather than left to a
-- caller: only this session's chunks, and only documents that finished
-- indexing. `security invoker` keeps row-level security in force, so the
-- function cannot become a way around it.
create or replace function match_chunks(
  query_embedding extensions.vector(1536),
  match_count integer default 6,
  max_distance double precision default 1.0
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_title text,
  section text,
  content text,
  distance double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    c.id,
    d.id,
    d.title,
    c.section,
    c.content,
    c.embedding <=> query_embedding as distance
  from chunks c
  join documents d on d.id = c.document_id
  where d.state = 'ready'
    and c.embedding is not null
    and (c.embedding <=> query_embedding) <= max_distance
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
