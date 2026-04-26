-- Supabase schema for Academic Planner
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New query)

-- ============================================================
-- 1. COURSES
-- ============================================================
create table if not exists courses (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid(),
  code            text not null,
  name            text not null,
  color           text not null,
  tint            text,
  weekly_goal_hours numeric not null default 6,
  created_at      timestamptz not null default now()
);

alter table courses enable row level security;

create policy "Users manage own courses"
  on courses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 2. TASKS  (FK → courses)
-- ============================================================
create table if not exists tasks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid(),
  course_id       uuid not null references courses(id) on delete cascade,
  title           text not null,
  due_date        date,
  priority        text not null default 'normal' check (priority in ('high', 'normal')),
  completed       boolean not null default false,
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);

alter table tasks enable row level security;

create policy "Users manage own tasks"
  on tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 3. SESSIONS  (FK → courses, FK → tasks)
-- ============================================================
create table if not exists sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid(),
  course_id       uuid not null references courses(id) on delete cascade,
  task_id         uuid references tasks(id) on delete set null,
  date            date not null,
  duration_seconds integer not null,
  note            text not null default '',
  created_at      timestamptz not null default now()
);

alter table sessions enable row level security;

create policy "Users manage own sessions"
  on sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 4. SEMESTERS  (one row per user, upserted)
-- ============================================================
create table if not exists semesters (
  user_id         uuid primary key default auth.uid(),
  start_date      date not null,
  end_date        date not null,
  updated_at      timestamptz not null default now()
);

alter table semesters enable row level security;

create policy "Users manage own semester"
  on semesters for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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

create policy "Users manage own settings"
  on user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- MIGRATION: Run this if user_settings table already exists
-- ============================================================
-- alter table user_settings add column if not exists display_name text not null default '';
-- alter table user_settings add column if not exists daily_goal_hours numeric not null default 4;
-- alter table user_settings add column if not exists avatar_url text not null default '';
