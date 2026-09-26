-- How a finished task was finished. `session` is the log sheet's "Mark the
-- task done", at the end of time spent on it; `skip` is the student taking a
-- task off the list without doing it, which never feeds recall, pages, a
-- study day or Finished early. A plain tick leaves it null, as does every row
-- written before this. supabase/schema.sql section 2 carries the same column.
-- Guarded, so a no-op where it already is.

alter table public.tasks
  add column if not exists completed_via text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_completed_via_check'
  ) then
    alter table public.tasks add constraint tasks_completed_via_check
      check (completed_via is null or completed_via in ('session', 'skip'));
  end if;
end $$;

notify pgrst, 'reload schema';
