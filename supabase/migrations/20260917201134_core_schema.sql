-- Every workspace belongs to one anonymous session and dies with it. There are
-- no accounts, so `session_id` is the only tenancy key in the whole schema, and
-- every table below carries it.

create type document_state as enum ('queued', 'extracting', 'embedding', 'ready', 'failed');
create type document_source as enum ('pdf', 'markdown', 'url');
create type corpus as enum ('saas-help-center', 'recipes', 'employee-handbook');
create type bot_tone as enum ('friendly', 'neutral', 'formal');
create type chat_surface as enum ('preview', 'widget');
create type rating as enum ('up', 'down');

create table sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Enforced on read as well as by the sweep, so an expired workspace is
  -- unreachable before the cron job gets to it.
  expires_at timestamptz not null default now() + interval '24 hours'
);

create table bots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  -- What the embed script carries. It grants asking questions and nothing else.
  public_id uuid not null unique default gen_random_uuid(),
  name text not null,
  accent_color text not null,
  greeting text not null,
  tone bot_tone not null default 'friendly',
  corpus corpus not null default 'saas-help-center',
  created_at timestamptz not null default now()
);
create index bots_session_idx on bots (session_id);

create table documents (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  bot_id uuid not null references bots (id) on delete cascade,
  title text not null,
  source document_source not null,
  reference text not null,
  state document_state not null default 'queued',
  chunk_count integer not null default 0,
  failure text,
  -- True for anything copied from a demo corpus, so the UI can label it.
  seeded boolean not null default false,
  created_at timestamptz not null default now()
);
create index documents_session_idx on documents (session_id);
create index documents_bot_state_idx on documents (bot_id, state);

create table chunks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  document_id uuid not null references documents (id) on delete cascade,
  -- Position in the document, and the nearest heading. A citation needs a
  -- section to open, so it is stored rather than reconstructed at answer time.
  ordinal integer not null,
  section text not null default '',
  content text not null,
  embedding extensions.vector(1536),
  unique (document_id, ordinal)
);
create index chunks_session_idx on chunks (session_id);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  bot_id uuid not null references bots (id) on delete cascade,
  surface chat_surface not null,
  started_at timestamptz not null default now()
);
create index conversations_session_idx on conversations (session_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  conversation_id uuid not null references conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- Resolved server-side from the chunks that were actually retrieved, so a
  -- citation cannot point at something retrieval never returned.
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on messages (conversation_id, created_at);
create index messages_session_idx on messages (session_id);

create table ratings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  message_id uuid not null references messages (id) on delete cascade unique,
  value rating not null,
  created_at timestamptz not null default now()
);
create index ratings_session_idx on ratings (session_id);

create table unanswered_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  bot_id uuid not null references bots (id) on delete cascade,
  question text not null,
  -- Left only when a visitor asks for a person to follow up.
  email text,
  asked_at timestamptz not null default now()
);
create index unanswered_session_idx on unanswered_questions (session_id);
