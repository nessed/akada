-- Applied to production through the Supabase MCP on 2026-09-23 and recorded
-- in supabase_migrations.schema_migrations as 20260923234143 /
-- add_course_assessments. supabase/schema.sql section 1 has declared this
-- column all along, but prod never had it, so every grade-weighting edit in
-- the app came back 400. Guarded with `if not exists`, so a no-op where the
-- column already is.

alter table public.courses add column if not exists assessments jsonb not null default '[]'::jsonb;
notify pgrst, 'reload schema';
