-- The sitting on the timer, before it is a session: a snapshot the app writes
-- as the sitting changes shape and every ten minutes while it is open, and
-- clears once it is logged or discarded (lib/live-sitting.ts), so the
-- connector can read a sitting that is still running. user_settings already
-- has one row per student and the policies for it.
-- supabase/schema.sql section 5 carries the same column. Guarded, so a no-op
-- where it already is.

alter table public.user_settings
  add column if not exists live_sitting jsonb;

notify pgrst, 'reload schema';
