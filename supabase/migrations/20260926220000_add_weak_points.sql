-- Weak points: what a student keeps getting wrong in a course, written by an
-- assistant over MCP after it marks a quiz (record_weak_points) and read back
-- before exams. supabase/schema.sql section 3d carries the same table and
-- stays the source of truth for a fresh project; every statement here is
-- guarded, so this is a no-op where it already exists.

create table if not exists public.weak_points (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  course_id     uuid not null references public.courses(id) on delete cascade,
  task_id       uuid references public.tasks(id) on delete set null,
  quiz_id       uuid references public.quizzes(id) on delete set null,
  section       text not null default '',
  page_ref      text not null default '',
  summary       text not null,
  confusion     text,
  error_type    text not null check (error_type in ('concept', 'assumption', 'algebra', 'graph', 'evidence', 'command_word', 'careless')),
  times_missed  integer not null default 1 check (times_missed >= 1),
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  status        text not null default 'open' check (status in ('open', 'fixed')),
  fixed_at      timestamptz,
  constraint weak_points_summary_length check (char_length(summary) between 1 and 300),
  constraint weak_points_confusion_length check (confusion is null or char_length(confusion) <= 200),
  constraint weak_points_section_length check (char_length(section) <= 40),
  constraint weak_points_page_ref_length check (char_length(page_ref) <= 40),
  constraint weak_points_fixed_at check ((status = 'fixed') = (fixed_at is not null))
);

alter table public.weak_points enable row level security;

drop policy if exists "Users manage own weak points" on public.weak_points;
create policy "Users manage own weak points"
  on public.weak_points for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists weak_points_user_course_idx on public.weak_points (user_id, course_id, status);
create index if not exists weak_points_course_idx on public.weak_points (course_id);
create index if not exists weak_points_task_idx on public.weak_points (task_id);
create index if not exists weak_points_quiz_idx on public.weak_points (quiz_id);
notify pgrst, 'reload schema';
