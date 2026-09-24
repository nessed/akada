-- Applied to production through the Supabase MCP on 2026-09-24 and recorded
-- in supabase_migrations.schema_migrations as 20260924002851 /
-- add_note_task_and_reads. Notes can be studied under a task, and remember
-- how long a read-through from the top took on that task's clock.
-- supabase/schema.sql section 3b carries the same columns. Guarded, so a
-- no-op where they already are.

alter table public.notes
  add column if not exists task_id uuid references public.tasks(id) on delete set null,
  add column if not exists reads jsonb not null default '[]'::jsonb;

do $$ begin
  alter table public.notes add constraint notes_reads_array check (jsonb_typeof(reads) = 'array');
exception when duplicate_object then null; end $$;

create index if not exists notes_task_idx on public.notes (task_id);
notify pgrst, 'reload schema';
