-- Isolation lives here, not in application code. One forgotten `where` clause
-- in the API would otherwise show one visitor another's documents, and that is
-- the single worst failure this app can have.
--
-- Every request sets `request.acb_session` before it queries. A request with no
-- claim sees nothing at all, which is the safe default for a route that forgot.

create or replace function current_session_id() returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.acb_session', true), '')::uuid;
$$;

-- An expired workspace is unreachable the moment it expires, whatever the
-- sweep has got around to deleting.
create or replace function session_is_live(target uuid) returns boolean
language sql
stable
as $$
  select exists (select 1 from sessions s where s.id = target and s.expires_at > now());
$$;

alter table sessions enable row level security;
alter table bots enable row level security;
alter table documents enable row level security;
alter table chunks enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table ratings enable row level security;
alter table unanswered_questions enable row level security;

create policy sessions_own on sessions
  for all to authenticated, anon
  using (id = current_session_id() and expires_at > now())
  with check (id = current_session_id());

create policy bots_own on bots
  for all to authenticated, anon
  using (session_id = current_session_id() and session_is_live(session_id))
  with check (session_id = current_session_id());

create policy documents_own on documents
  for all to authenticated, anon
  using (session_id = current_session_id() and session_is_live(session_id))
  with check (session_id = current_session_id());

create policy chunks_own on chunks
  for all to authenticated, anon
  using (session_id = current_session_id() and session_is_live(session_id))
  with check (session_id = current_session_id());

create policy conversations_own on conversations
  for all to authenticated, anon
  using (session_id = current_session_id() and session_is_live(session_id))
  with check (session_id = current_session_id());

create policy messages_own on messages
  for all to authenticated, anon
  using (session_id = current_session_id() and session_is_live(session_id))
  with check (session_id = current_session_id());

create policy ratings_own on ratings
  for all to authenticated, anon
  using (session_id = current_session_id() and session_is_live(session_id))
  with check (session_id = current_session_id());

create policy unanswered_own on unanswered_questions
  for all to authenticated, anon
  using (session_id = current_session_id() and session_is_live(session_id))
  with check (session_id = current_session_id());
