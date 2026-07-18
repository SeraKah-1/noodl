-- Noodl public schema (run in Supabase SQL editor)
-- Enable Google provider under Authentication → Providers

create extension if not exists "pgcrypto";

-- Quizzes owned by a user
create table if not exists public.quizzes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  topic text,
  questions jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quizzes_user_id_idx on public.quizzes(user_id);

alter table public.quizzes enable row level security;

create policy "quizzes_select_own" on public.quizzes
  for select using (auth.uid() = user_id);
create policy "quizzes_insert_own" on public.quizzes
  for insert with check (auth.uid() = user_id);
create policy "quizzes_update_own" on public.quizzes
  for update using (auth.uid() = user_id);
create policy "quizzes_delete_own" on public.quizzes
  for delete using (auth.uid() = user_id);

-- Spaced-repetition cards
create table if not exists public.srs_items (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  keycard_id text default 'global',
  item_id text not null,
  item_type text not null,
  content jsonb,
  easiness double precision not null default 2.5,
  interval integer not null default 0,
  repetition integer not null default 0,
  next_review timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists srs_user_due_idx on public.srs_items(user_id, next_review);
create index if not exists srs_item_id_idx on public.srs_items(user_id, item_id);

alter table public.srs_items enable row level security;

create policy "srs_select_own" on public.srs_items
  for select using (auth.uid() = user_id);
create policy "srs_insert_own" on public.srs_items
  for insert with check (auth.uid() = user_id);
create policy "srs_update_own" on public.srs_items
  for update using (auth.uid() = user_id);
create policy "srs_delete_own" on public.srs_items
  for delete using (auth.uid() = user_id);

-- Lightweight user prefs
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "profiles_select_own" on public.user_profiles
  for select using (auth.uid() = user_id);
create policy "profiles_upsert_own" on public.user_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
