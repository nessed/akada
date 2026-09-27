-- Why a sitting was closed for the student rather than by them, when it was
-- and they kept it anyway: `idle` held after no input (the timer now tracks
-- input apart from its heartbeat), `away` recovered after the page went
-- unseen, `break` a break past its ceiling, `max` the 18h limit. The hours
-- still count; the app leaves these out of records and habit medians.
-- supabase/schema.sql section 3 carries the same column. Guarded, so a no-op
-- where it already is.

alter table public.sessions
  add column if not exists recovery text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sessions_recovery_check'
  ) then
    alter table public.sessions add constraint sessions_recovery_check
      check (recovery is null or recovery in ('idle', 'away', 'break', 'max'));
  end if;
end $$;

notify pgrst, 'reload schema';
