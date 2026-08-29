-- ============================================================================
-- Akada — Supabase schema (source of truth)
--
-- Run this whole file in the Supabase SQL Editor (Dashboard > SQL Editor >
-- New query). It is idempotent: safe to run against a fresh project and safe
-- to re-run against an existing one. Nothing here drops data.
--
-- Two statements can fail on an existing database that has drifted. Both are
-- called out inline with the query to run first.
-- ============================================================================

-- ============================================================
-- 1. COURSES
-- ============================================================
create table if not exists courses (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid(),
  code              text not null,
  name              text not null,
  color             text not null,
  tint              text,
  weekly_goal_hours numeric not null default 6,
  created_at        timestamptz not null default now()
);

alter table courses enable row level security;

-- ============================================================
-- 2. TASKS  (FK -> courses)
-- ============================================================
create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid(),
  course_id    uuid not null references courses(id) on delete cascade,
  title        text not null,
  due_date     date,
  priority     text not null default 'normal' check (priority in ('high', 'normal')),
  completed    boolean not null default false,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);

alter table tasks enable row level security;

-- ============================================================
-- 3. SESSIONS  (FK -> courses, FK -> tasks)
-- ============================================================
create table if not exists sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid(),
  course_id        uuid not null references courses(id) on delete cascade,
  task_id          uuid references tasks(id) on delete set null,
  date             date not null,
  duration_seconds integer not null,
  note             text not null default '',
  created_at       timestamptz not null default now()
);

alter table sessions enable row level security;

-- ============================================================
-- 4. SEMESTERS  (one row per user, upserted)
-- ============================================================
create table if not exists semesters (
  user_id    uuid primary key default auth.uid(),
  start_date date not null,
  end_date   date not null,
  updated_at timestamptz not null default now()
);

alter table semesters enable row level security;

-- ============================================================
-- 5. USER SETTINGS  (one row per user, upserted)
-- ============================================================
create table if not exists user_settings (
  user_id             uuid primary key default auth.uid(),
  onboarding_complete boolean not null default false,
  display_name        text not null default '',
  daily_goal_hours    numeric not null default 4,
  avatar_url          text not null default '',
  updated_at          timestamptz not null default now()
);

alter table user_settings enable row level security;

-- Columns added after the first release. Kept as executable statements rather
-- than commented-out notes so this file stays the source of truth.
alter table user_settings add column if not exists display_name     text    not null default '';
alter table user_settings add column if not exists daily_goal_hours numeric not null default 4;
alter table user_settings add column if not exists avatar_url       text    not null default '';

-- ============================================================
-- 6. ROW LEVEL SECURITY POLICIES
--
-- auth.uid() is wrapped in a scalar subquery so Postgres evaluates it once
-- per statement instead of once per row. This is the fix Supabase's
-- performance advisor asks for under "auth_rls_initplan".
-- ============================================================
drop policy if exists "Users manage own courses"  on courses;
drop policy if exists "Users manage own tasks"    on tasks;
drop policy if exists "Users manage own sessions" on sessions;
drop policy if exists "Users manage own semester" on semesters;
drop policy if exists "Users manage own settings" on user_settings;

create policy "Users manage own courses"
  on courses for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage own tasks"
  on tasks for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage own sessions"
  on sessions for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage own semester"
  on semesters for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage own settings"
  on user_settings for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================
-- 7. INDEXES
--
-- Every read in the app filters on user_id first. Without these, the stats
-- page and the 13-week heatmap sequentially scan the whole table.
-- ============================================================
create index if not exists courses_user_id_idx         on courses (user_id);
create index if not exists tasks_user_id_due_date_idx  on tasks (user_id, due_date);
create index if not exists tasks_course_id_idx         on tasks (course_id);
create index if not exists sessions_user_id_date_idx   on sessions (user_id, date);
create index if not exists sessions_course_id_idx      on sessions (course_id);
create index if not exists sessions_task_id_idx        on sessions (task_id);

-- ============================================================
-- 8. DATA INTEGRITY CONSTRAINTS
-- ============================================================

-- Course codes are unique per user, case-insensitively. lib/planner-safety.ts
-- checks this client-side during onboarding, but nothing stopped two tabs or
-- a later "add course" from creating CS101 twice.
--
-- If this errors with "could not create unique index", the database already
-- holds duplicates. Find them with:
--   select user_id, upper(code), count(*) from courses
--   group by 1, 2 having count(*) > 1;
-- then merge or delete the extras and re-run.
create unique index if not exists courses_user_id_code_unique
  on courses (user_id, upper(code));

-- A session cannot be zero-length or longer than the 18h timer ceiling
-- (MAX_SESSION_SECONDS in lib/session-safety.ts).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sessions_duration_seconds_range'
  ) then
    alter table sessions add constraint sessions_duration_seconds_range
      check (duration_seconds > 0 and duration_seconds <= 64800);
  end if;
end $$;

-- Avatars are stored inline as base64 data URLs. Cap them so one user cannot
-- park an unbounded blob in the row (AVATAR_URL_MAX in lib/planner-safety.ts).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_settings_avatar_url_length'
  ) then
    alter table user_settings add constraint user_settings_avatar_url_length
      check (length(avatar_url) <= 64000);
  end if;
end $$;

-- ============================================================
-- 9. CASCADE ON ACCOUNT DELETION
--
-- Without this, deleting a user from Supabase Auth orphans all of their rows.
--
-- If any of these error with "violates foreign key constraint", the table
-- already holds rows for deleted users. Clear them with, e.g.:
--   delete from courses where user_id not in (select id from auth.users);
-- then re-run.
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array['courses', 'tasks', 'sessions', 'semesters', 'user_settings']
  loop
    if not exists (
      select 1 from pg_constraint where conname = t || '_user_id_fkey'
    ) then
      execute format(
        'alter table %I add constraint %I foreign key (user_id) references auth.users(id) on delete cascade',
        t, t || '_user_id_fkey'
      );
    end if;
  end loop;
end $$;
