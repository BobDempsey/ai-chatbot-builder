-- The demo corpora, indexed once and copied into every new workspace.
--
-- These rows belong to no session, which is what makes them read-only: the
-- policies below grant select to anon and authenticated and nothing else, so a
-- visitor deleting their seeded documents cannot change what the next visitor
-- is given. The loader writes them with the service role.
--
-- Seeding copies the chunks rather than recomputing them, so a new workspace
-- costs nothing at the embeddings API.

create table template_documents (
  id uuid primary key default gen_random_uuid(),
  corpus corpus not null,
  -- The source file name, which is what makes the loader idempotent.
  slug text not null,
  title text not null,
  reference text not null,
  -- sha256 of the source Markdown. Re-running the loader over unchanged text
  -- writes nothing and embeds nothing.
  content_hash text not null,
  chunk_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (corpus, slug)
);
create index template_documents_corpus_idx on template_documents (corpus);

create table template_chunks (
  id uuid primary key default gen_random_uuid(),
  template_document_id uuid not null references template_documents (id) on delete cascade,
  ordinal integer not null,
  section text not null default '',
  content text not null,
  embedding extensions.vector(1536),
  unique (template_document_id, ordinal)
);

alter table template_documents enable row level security;
alter table template_chunks enable row level security;

create policy template_documents_read on template_documents
  for select to authenticated, anon
  using (true);

create policy template_chunks_read on template_chunks
  for select to authenticated, anon
  using (true);

-- Copying a corpus into the calling session's workspace. `security invoker`
-- keeps the policies in force, so the inserts below can only ever write rows
-- belonging to the session that asked: the `with check` on documents and chunks
-- refuses any other session_id.
create or replace function seed_corpus(target_bot uuid, target_corpus corpus)
returns integer
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
declare
  copied integer := 0;
  template record;
  new_document uuid;
begin
  for template in
    select * from template_documents where corpus = target_corpus order by slug
  loop
    insert into documents (session_id, bot_id, title, source, reference, state, chunk_count, seeded)
    values (
      current_session_id(),
      target_bot,
      template.title,
      'markdown',
      template.reference,
      'ready',
      template.chunk_count,
      true
    )
    returning id into new_document;

    insert into chunks (session_id, document_id, ordinal, section, content, embedding)
    select current_session_id(), new_document, tc.ordinal, tc.section, tc.content, tc.embedding
    from template_chunks tc
    where tc.template_document_id = template.id;

    copied := copied + 1;
  end loop;

  return copied;
end;
$$;

-- Swapping the doc set: seeded documents go, uploads stay.
create or replace function replace_seeded_corpus(target_bot uuid, target_corpus corpus)
returns integer
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
begin
  delete from documents where bot_id = target_bot and seeded;
  update bots set corpus = target_corpus where id = target_bot;
  return seed_corpus(target_bot, target_corpus);
end;
$$;
