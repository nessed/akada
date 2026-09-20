-- ============================================================================
-- Akada. Supabase schema (source of truth)
--
-- Run this whole file in the Supabase SQL Editor (Dashboard > SQL Editor >
-- New query). It is idempotent: safe to run against a fresh project and safe
-- to re-run against an existing one. Nothing here drops data.
--
-- Several statements can fail on an existing database that has drifted. Each
-- is called out inline with the query to run first.
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

-- Which semester a course belongs to. Nullable: see section 4a for why, and
-- section 5 for how existing rows get backfilled.
alter table courses add column if not exists semester_id uuid;

-- Optional catalog details, filled in when a course is picked from the
-- add-course search and left null for a manually typed one. All nullable and
-- purely additive: existing rows stay valid untouched, and the course card
-- renders only the fields that are present.
alter table courses add column if not exists credits      numeric;
alter table courses add column if not exists section      text;
alter table courses add column if not exists instructor   text;
alter table courses add column if not exists meeting_time text;

-- The order the student dragged their course cards into on the dashboard,
-- smallest first, scoped to (user_id, semester_id). Nullable and purely
-- additive: a row that predates it, or a deploy running against a database
-- that has not had this file re-run, simply has no explicit order, and
-- lib/data/course-order.ts falls back to oldest-course-first exactly as
-- before. Existing rows are numbered by section 6, no manual step.
alter table courses add column if not exists sort_order integer;

-- How a course is marked: [{ id, label, weight, score, outOf }, …]. Held as
-- one document rather than a table of its own because it is only ever read
-- and written whole, with the course, exactly like tasks.subtasks above. A
-- course with an empty array simply does not draw a grade panel.
alter table courses add column if not exists assessments jsonb not null default '[]'::jsonb;

-- How the course is marked beyond the list of pieces: the basis it is graded
-- on, any "best 6 of 7" drop rules, and a scheme proposed through the MCP
-- connector that the student has not accepted yet. One column for the same
-- reason assessments is one: it is only ever read and written whole, with the
-- course. Additive with a default, so an older deploy reading these rows
-- simply does not see it. Nothing projects a grade from a pending scheme.
alter table courses add column if not exists grading jsonb not null default '{}'::jsonb;

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

-- Task reading view / MCP context. Additive so older rows receive a harmless
-- empty value and can be progressively enriched from the app.
alter table tasks add column if not exists description text not null default '';
alter table tasks add column if not exists subtasks jsonb not null default '[]'::jsonb;

-- Denormalized copy of the owning course's semester_id, kept in sync by the
-- trigger in section 6. Lets the app filter tasks by semester with a plain
-- .eq() instead of a join through courses on every read.
alter table tasks add column if not exists semester_id uuid;

-- What a row on the list actually is, and what it is worth. A reading carries
-- a page count and feeds the backlog; an exam is circled on the month and
-- counted down to; `weight` is the percentage of the course a piece is worth,
-- which is what lets the app say how much of a grade is still unmarked.
-- Additive, so every row written before this reads as a plain, unweighted
-- task and nothing changes meaning underneath anyone.
alter table tasks add column if not exists kind text not null default 'task'
  check (kind in ('task', 'reading', 'exam'));
alter table tasks add column if not exists weight numeric
  check (weight is null or (weight >= 0 and weight <= 100));
alter table tasks add column if not exists pages integer
  check (pages is null or (pages >= 0 and pages <= 10000));

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

-- Same denormalization as tasks.semester_id, same trigger keeps it in sync.
alter table sessions add column if not exists semester_id uuid;

-- ============================================================
-- 4. SEMESTERS
--
-- A user now has many semesters, not one. The table used to be keyed
-- user_id-primary-key (exactly one row per user, upserted in place); it is
-- now id-primary-key with a user_id column, so a user can accumulate a
-- history of terms instead of overwriting the same row every time.
-- ============================================================

-- 4a. Migrate the old shape in place, if it's still there. Detected by the
-- absence of the `id` column, which only the new shape has. The one existing
-- row per user becomes their first migrated semester, with a label guessed
-- from its start date (or, lacking one, from when it was last touched) using
-- the same season-naming convention the Stats page already uses.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'semesters'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'semesters' and column_name = 'id'
  ) then
    alter table semesters rename to semesters_pre_v2;

    create table semesters (
      id         uuid primary key default gen_random_uuid(),
      user_id    uuid not null,
      label      text not null default '',
      start_date date,
      end_date   date,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    insert into semesters (user_id, label, start_date, end_date, created_at, updated_at)
    select
      user_id,
      (case
        when extract(month from coalesce(start_date, updated_at::date)) <= 5 then 'Spring '
        when extract(month from coalesce(start_date, updated_at::date)) <= 8 then 'Summer '
        else 'Fall '
      end) || extract(year from coalesce(start_date, updated_at::date))::text,
      start_date,
      end_date,
      updated_at,
      updated_at
    from semesters_pre_v2;

    drop table semesters_pre_v2;
  elsif not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'semesters'
  ) then
    create table semesters (
      id         uuid primary key default gen_random_uuid(),
      user_id    uuid not null,
      label      text not null default '',
      start_date date,
      end_date   date,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  end if;
end $$;

alter table semesters enable row level security;

create index if not exists semesters_user_id_idx on semesters (user_id);

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

-- Which semester new courses, tasks and study sessions go into. The
-- Dashboard, Tasks and Timer pages always operate on this one; switching it
-- (lib/data/*.ts: createSemester) is how "start a new semester" works, -- everything from the old semester stays exactly where it was, just no
-- longer the default view. Past semesters are reachable read-only from
-- Settings → Semester.
alter table user_settings add column if not exists active_semester_id uuid;

-- ============================================================
-- 5b. PROGRESSION INSTRUMENTATION
--
-- Two small tables that record how the progression layer behaved, so that it
-- can be judged rather than assumed. Neither is read by the app: nothing on
-- any screen depends on a row here, and the progression layer itself is
-- derived from sessions and tasks on read. Dropping both tables costs the
-- product nothing except the ability to check its own work.
--
-- mark_candidates: every Next Mark candidate considered on an impression,
-- including the ones that lost, and whether a session followed within the
-- hour. Ranking is hand written today. This is the training data that makes
-- it learnable later, and it is written now because it cannot be collected
-- retroactively.
--
-- trust_pulse: one question, asked occasionally. Does this term still feel
-- like an honest record of your work? It is a primary metric, not a nicety:
-- if retention climbs while this answer falls, the system is manufacturing
-- false records and the feature gets rolled back.
-- ============================================================
create table if not exists mark_candidates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid(),
  shown_at    timestamptz not null default now(),
  surface     text not null,
  -- The candidate list as ranked, with the shown one flagged. One row per
  -- impression rather than per candidate, because the losers are only
  -- meaningful next to the winner they lost to.
  candidates  jsonb not null default '[]'::jsonb,
  shown_id    text,
  -- Filled in later by the client if a session starts within the hour. Null
  -- means no session followed, or the question has not been answered yet.
  followed_at timestamptz
);

alter table mark_candidates enable row level security;

create table if not exists trust_pulse (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid(),
  asked_on   date not null default current_date,
  -- The answer to "does this term still feel like an honest record of your
  -- work?". Null is a dismissal, which is itself worth keeping: a question
  -- everybody closes is a question nobody wants asked.
  answer     text check (answer is null or answer in ('yes', 'mostly', 'no')),
  created_at timestamptz not null default now(),
  unique (user_id, asked_on)
);

alter table trust_pulse enable row level security;

-- ============================================================
-- 6. BACKFILL + KEEP-IN-SYNC FOR SEMESTER SCOPING
-- ============================================================

-- One-time backfill: attach every pre-existing course to its user's (single,
-- pre-migration) semester, then cascade that onto tasks and sessions through
-- their course, then point active_semester_id at the same place so existing
-- users land exactly where they already were.
update courses c
set semester_id = s.id
from semesters s
where c.semester_id is null
  and s.id = (
    select id from semesters where user_id = c.user_id order by created_at desc limit 1
  );

update tasks t
set semester_id = c.semester_id
from courses c
where t.semester_id is null and t.course_id = c.id;

-- One-time backfill of the dashboard's course order: every course that has
-- none is numbered by the order it was already being shown in, oldest first,
-- within its own semester. Idempotent, a re-run finds no nulls left and does
-- nothing, and a course that already carries an order keeps it.
update courses c
set sort_order = ranked.rn
from (
  select
    id,
    (row_number() over (
      partition by user_id, semester_id
      order by coalesce(sort_order, 2147483647), created_at, id
    ))::int - 1 as rn
  from courses
) ranked
where c.id = ranked.id
  and c.sort_order is null;

update sessions se
set semester_id = c.semester_id
from courses c
where se.semester_id is null and se.course_id = c.id;

update user_settings us
set active_semester_id = s.id
from semesters s
where us.active_semester_id is null
  and s.id = (
    select id from semesters where user_id = us.user_id order by created_at desc limit 1
  );

-- Going forward: a task or session always inherits its semester_id from the
-- course it belongs to, so the app never has to compute or pass it. This is
-- what keeps addTask/addSession unchanged in lib/data/supabase-adapter.ts, -- only the *reads* needed to learn about semesters at all.
create or replace function akada_set_semester_from_course()
returns trigger
language plpgsql
as $$
begin
  if new.semester_id is null then
    new.semester_id := (select semester_id from courses where id = new.course_id);
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_set_semester_id on tasks;
create trigger tasks_set_semester_id
  before insert on tasks
  for each row execute function akada_set_semester_from_course();

drop trigger if exists sessions_set_semester_id on sessions;
create trigger sessions_set_semester_id
  before insert on sessions
  for each row execute function akada_set_semester_from_course();

-- ============================================================
-- 7. ROW LEVEL SECURITY POLICIES
--
-- auth.uid() is wrapped in a scalar subquery so Postgres evaluates it once
-- per statement instead of once per row. This is the fix Supabase's
-- performance advisor asks for under "auth_rls_initplan".
--
-- Semester scoping (which rows a query returns) is enforced entirely in the
-- application query layer, same as any other filter, these policies only
-- ever decide ownership (whose rows these are), same as before.
-- ============================================================
drop policy if exists "Users manage own courses"  on courses;
drop policy if exists "Users manage own tasks"    on tasks;
drop policy if exists "Users manage own sessions" on sessions;
drop policy if exists "Users manage own semester" on semesters;
drop policy if exists "Users manage own settings" on user_settings;
drop policy if exists "Users manage own mark candidates" on mark_candidates;
drop policy if exists "Users manage own trust pulse" on trust_pulse;

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

create policy "Users manage own mark candidates"
  on mark_candidates for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage own trust pulse"
  on trust_pulse for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================
-- 8. INDEXES
--
-- Every read in the app filters on user_id first, and most now filter on
-- semester_id right after. Without these, the stats page, the heatmap, and
-- every semester-scoped list would sequentially scan the whole table.
-- ============================================================
create index if not exists courses_user_id_idx           on courses (user_id);
create index if not exists courses_semester_id_idx        on courses (semester_id);
-- The dashboard reads one semester's courses and shows them in sort_order.
create index if not exists courses_semester_sort_order_idx on courses (user_id, semester_id, sort_order);
create index if not exists tasks_user_id_due_date_idx     on tasks (user_id, due_date);
create index if not exists tasks_course_id_idx            on tasks (course_id);
create index if not exists tasks_semester_id_idx          on tasks (semester_id);
create index if not exists sessions_user_id_date_idx      on sessions (user_id, date);
create index if not exists sessions_course_id_idx         on sessions (course_id);
create index if not exists sessions_task_id_idx           on sessions (task_id);
create index if not exists sessions_semester_id_idx       on sessions (semester_id);
create index if not exists user_settings_active_semester_id_idx on user_settings (active_semester_id);

-- ============================================================
-- 9. DATA INTEGRITY CONSTRAINTS
-- ============================================================

-- Course codes are unique per user *within a semester*, case-insensitively, -- scoped to semester_id rather than globally, because reusing a code like
-- CS101 every term is normal. lib/planner-safety.ts checks this client-side
-- too, but nothing stopped two tabs or a later "add course" from creating
-- CS101 twice in the same semester.
--
-- If the create-index step below errors with "could not create unique
-- index", the database already holds duplicates within one semester. Find
-- them with:
--   select user_id, semester_id, upper(code), count(*) from courses
--   group by 1, 2, 3 having count(*) > 1;
-- then merge or delete the extras and re-run.
drop index if exists courses_user_id_code_unique;
create unique index if not exists courses_user_id_semester_code_unique
  on courses (user_id, semester_id, upper(code));

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

-- semester_id foreign keys. Left nullable (see section 1-3 comments) so a
-- straggler row from an unexpected migration state degrades to "invisible
-- until reassigned" instead of failing this whole script.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'courses_semester_id_fkey') then
    alter table courses add constraint courses_semester_id_fkey
      foreign key (semester_id) references semesters(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_semester_id_fkey') then
    alter table tasks add constraint tasks_semester_id_fkey
      foreign key (semester_id) references semesters(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sessions_semester_id_fkey') then
    alter table sessions add constraint sessions_semester_id_fkey
      foreign key (semester_id) references semesters(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_settings_active_semester_id_fkey') then
    alter table user_settings add constraint user_settings_active_semester_id_fkey
      foreign key (active_semester_id) references semesters(id) on delete set null;
  end if;
end $$;

-- ============================================================
-- 10. CASCADE ON ACCOUNT DELETION
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
  foreach t in array array['courses', 'tasks', 'sessions', 'semesters', 'user_settings',
                           'mark_candidates', 'trust_pulse']
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


-- ============================================================
-- 11. ACCOUNT DELETION
--
-- Clearing a user's rows still left their auth record, so the email and
-- password hash outlived the "delete my data" they asked for.
--
-- Removing a row from auth.users normally needs the service_role key, which
-- this app deliberately does not have. A SECURITY DEFINER function is the way
-- to grant exactly that one capability and nothing else: it can only ever
-- delete the caller's own row, because the id it deletes is auth.uid(). The
-- cascades in section 10 take the courses, tasks, sessions, semesters,
-- settings and the two progression instrumentation tables with it.
-- ============================================================
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
