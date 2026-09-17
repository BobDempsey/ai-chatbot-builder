-- Both helpers run inside row-level security policies, so a caller-controlled
-- search_path would be a way to swap what they resolve to. Supabase's linter
-- flags exactly this.
alter function current_session_id() set search_path = public;
alter function session_is_live(uuid) set search_path = public;
