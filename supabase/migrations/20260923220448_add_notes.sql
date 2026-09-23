-- Applied to production through the Supabase MCP on 2026-09-23 and recorded
-- in supabase_migrations.schema_migrations as 20260923220448 / add_notes.
-- Checked in verbatim so the repo's history matches what the project has
-- recorded. supabase/schema.sql section 3b carries the same table and stays
-- the source of truth for a fresh project; every statement here is guarded,
-- so this is a no-op against a database that already has it.

create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  course_id   uuid references public.courses(id) on delete set null,
  title       text not null,
  markdown    text not null,
  checks      jsonb not null default '{}'::jsonb,
  source      text not null default 'app' check (source in ('app', 'import', 'mcp')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint notes_title_length check (char_length(title) between 1 and 300),
  constraint notes_markdown_length check (char_length(markdown) between 1 and 200000),
  constraint notes_checks_object check (jsonb_typeof(checks) = 'object')
);

alter table public.notes enable row level security;

drop policy if exists "Users manage own notes" on public.notes;
create policy "Users manage own notes"
  on public.notes for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists notes_user_updated_idx on public.notes (user_id, updated_at desc);
create index if not exists notes_course_idx on public.notes (course_id);
