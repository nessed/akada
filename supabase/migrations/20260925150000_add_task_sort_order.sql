-- The order a student drags a course's tasks into, and the order the MCP
-- server's reorder_tasks writes. supabase/schema.sql section 2 carries the
-- same column. Nullable with no backfill: a task nobody has placed reads in
-- the "what matters" order every list already showed (lib/data/task-order.ts).
-- Guarded with `if not exists`, so a no-op where it already is.

alter table public.tasks
  add column if not exists sort_order integer;
notify pgrst, 'reload schema';
