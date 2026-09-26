-- Applied to production through the Supabase MCP on 2026-09-26 and recorded
-- in supabase_migrations.schema_migrations as 20260926231336 / add_quiz_timer.
-- A quiz can carry a suggested timer, in minutes, set by the assistant when
-- it sends the quiz over MCP. Null means it sent none, and no countdown
-- shows. supabase/schema.sql section 3c carries the same column and stays
-- the source of truth for a fresh project; every statement here is guarded,
-- so this is a no-op where it already exists.

alter table quizzes add column if not exists timer_minutes integer;
do $$ begin
  alter table quizzes add constraint quizzes_timer_minutes_range check (timer_minutes is null or timer_minutes between 1 and 180);
exception when duplicate_object then null; end $$;
notify pgrst, 'reload schema';
