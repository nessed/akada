-- Applied to production through the Supabase MCP on 2026-09-25 and recorded
-- in supabase_migrations.schema_migrations as 20260925142035 / add_quizzes.
-- Quizzes an assistant sends over MCP. supabase/schema.sql section 3c carries
-- the same table and stays the source of truth for a fresh project; every
-- statement here is guarded, so this is a no-op where it already exists.

create table if not exists public.quizzes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  course_id   uuid references public.courses(id) on delete set null,
  task_id     uuid references public.tasks(id) on delete set null,
  note_id     uuid references public.notes(id) on delete set null,
  title       text not null,
  context     text,
  questions   jsonb not null,
  attempts    jsonb not null default '[]'::jsonb,
  source      text not null default 'mcp' check (source in ('mcp')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint quizzes_title_length check (char_length(title) between 1 and 300),
  constraint quizzes_context_length check (context is null or char_length(context) <= 300),
  constraint quizzes_questions_array check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 1 and 50),
  constraint quizzes_attempts_array check (jsonb_typeof(attempts) = 'array')
);

alter table public.quizzes enable row level security;

drop policy if exists "Users manage own quizzes" on public.quizzes;
create policy "Users manage own quizzes"
  on public.quizzes for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists quizzes_user_created_idx on public.quizzes (user_id, created_at desc);
create index if not exists quizzes_course_idx on public.quizzes (course_id);
create index if not exists quizzes_task_idx on public.quizzes (task_id);
create index if not exists quizzes_note_idx on public.quizzes (note_id);
notify pgrst, 'reload schema';
