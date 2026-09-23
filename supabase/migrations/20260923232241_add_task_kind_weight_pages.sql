-- Applied to production through the Supabase MCP on 2026-09-23 and recorded
-- in supabase_migrations.schema_migrations as 20260923232241 /
-- add_task_kind_weight_pages. The MCP server's create_tasks and update_tasks
-- write these three columns and failed with PGRST204 until they existed.
-- supabase/schema.sql section 2 carries the same columns with the same
-- bounds. Guarded with `if not exists`, so a no-op where they already are.

alter table public.tasks
  add column if not exists kind text not null default 'task' check (kind in ('task','reading','exam')),
  add column if not exists weight numeric check (weight >= 0 and weight <= 100),
  add column if not exists pages integer check (pages >= 1 and pages <= 10000);
notify pgrst, 'reload schema';
