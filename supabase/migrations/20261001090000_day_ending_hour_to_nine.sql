-- A day may now end as late as 9am (Settings, "Day ends at"); it stopped at 8.
alter table public.user_settings drop constraint if exists user_settings_day_ending_hour_range;
alter table public.user_settings add constraint user_settings_day_ending_hour_range
  check (day_ending_hour between 0 and 9);
