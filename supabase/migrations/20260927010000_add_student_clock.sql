-- The student's clock: the IANA time zone their browser reports and the hour
-- their day ends at, written by the app so the connector can date what it
-- writes on the student's day rather than the server's UTC one.
-- supabase/schema.sql section 5 carries the same columns and stays the source
-- of truth for a fresh project; every statement here is guarded, so this is a
-- no-op where they already exist.

alter table public.user_settings add column if not exists time_zone       text     not null default '';
alter table public.user_settings add column if not exists day_ending_hour smallint not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_settings_time_zone_length'
  ) then
    alter table public.user_settings add constraint user_settings_time_zone_length
      check (length(time_zone) <= 64);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'user_settings_day_ending_hour_range'
  ) then
    alter table public.user_settings add constraint user_settings_day_ending_hour_range
      check (day_ending_hour between 0 and 8);
  end if;
end $$;
