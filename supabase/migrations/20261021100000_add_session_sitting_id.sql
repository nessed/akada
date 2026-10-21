-- One session per timer sitting. A sitting can move between devices
-- (lib/live-sitting.ts); if it ever ends up stopped on both, the second save
-- finds the first row instead of writing the hours twice.
-- supabase/schema.sql section 3 carries the same column. Guarded, so a no-op
-- where it already is.

alter table public.sessions
  add column if not exists sitting_id text;

create unique index if not exists sessions_user_sitting_id_key
  on public.sessions (user_id, sitting_id) where sitting_id is not null;

notify pgrst, 'reload schema';
