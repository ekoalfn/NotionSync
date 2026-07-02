-- ============================================================================
-- Manual Time Entries — backfill hours that weren't tracked in Notion
-- ============================================================================
-- Run this in Supabase SQL Editor (dashboard.supabase.com → SQL Editor → New query)

create extension if not exists "uuid-ossp";

create table if not exists public.manual_time_entries (
  id              uuid primary key default uuid_generate_v4(),
  -- The work date (YYYY-MM-DD). Used to bucket into weeks.
  date            date not null,
  -- Person name — should match the assignee names that come from Notion sync.
  person          text not null,
  -- Project: foreign key to notion_projects. CASCADE delete so removing a
  -- project cleans up its manual entries too.
  project_id      uuid not null references public.notion_projects(id) on delete cascade,
  -- Hours worked. Stored as numeric to allow 0.5 / 1.25 etc.
  hours           numeric(6,2) not null check (hours > 0 and hours < 24),
  -- Free-form note (what was worked on, why backfilled).
  notes           text,
  -- Audit trail.
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Optional: who entered it. NULL ok if we don't have user context.
  created_by      uuid references auth.users(id) on delete set null
);

-- Indexes for the most common query shapes
create index if not exists manual_time_entries_date_idx     on public.manual_time_entries (date);
create index if not exists manual_time_entries_person_idx   on public.manual_time_entries (person);
create index if not exists manual_time_entries_project_idx  on public.manual_time_entries (project_id);
create index if not exists manual_time_entries_date_proj_idx on public.manual_time_entries (date, project_id);

-- Trigger to keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists manual_time_entries_set_updated_at on public.manual_time_entries;
create trigger manual_time_entries_set_updated_at
  before update on public.manual_time_entries
  for each row execute function public.set_updated_at();

-- ============================================================================
-- RLS — only authenticated users can read/write; service role bypasses.
-- ============================================================================
alter table public.manual_time_entries enable row level security;

drop policy if exists "manual_time_entries_select_authenticated" on public.manual_time_entries;
create policy "manual_time_entries_select_authenticated"
  on public.manual_time_entries
  for select
  to authenticated
  using (true);

drop policy if exists "manual_time_entries_insert_authenticated" on public.manual_time_entries;
create policy "manual_time_entries_insert_authenticated"
  on public.manual_time_entries
  for insert
  to authenticated
  with check (true);

drop policy if exists "manual_time_entries_update_authenticated" on public.manual_time_entries;
create policy "manual_time_entries_update_authenticated"
  on public.manual_time_entries
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "manual_time_entries_delete_authenticated" on public.manual_time_entries;
create policy "manual_time_entries_delete_authenticated"
  on public.manual_time_entries
  for delete
  to authenticated
  using (true);

-- ============================================================================
-- Verify
-- ============================================================================
-- After running, this should return one row with table_name = 'manual_time_entries':
-- select table_name from information_schema.tables where table_name = 'manual_time_entries';
