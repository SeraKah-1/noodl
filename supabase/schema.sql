-- ═══════════════════════════════════════════════════════════
-- Noodl · Supabase schema (cross-device sync, RLS, realtime)
-- Run in SQL Editor OR: supabase db push
-- ═══════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── profiles (prefs, non-secret settings) ──────────────────
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  config jsonb not null default '{}'::jsonb,
  -- never store raw API keys in production if avoidable; optional encrypted blob
  provider_settings jsonb not null default '{}'::jsonb,
  last_device_id text,
  last_seen_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── quizzes ────────────────────────────────────────────────
create table if not exists public.quizzes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  topic text,
  questions jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  folder text default '',
  tags text[] default '{}',
  last_score numeric,
  visibility text not null default 'private'
    check (visibility in ('private', 'unlisted', 'public')),
  access_code text default '',
  client_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists quizzes_user_updated_idx
  on public.quizzes (user_id, updated_at desc);
create index if not exists quizzes_user_alive_idx
  on public.quizzes (user_id) where deleted_at is null;

-- ── library materials ──────────────────────────────────────
create table if not exists public.library_items (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null default '',
  processed_content text,
  type text not null default 'text',
  tags text[] default '{}',
  client_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists library_user_updated_idx
  on public.library_items (user_id, updated_at desc);

-- ── spaced repetition ──────────────────────────────────────
create table if not exists public.srs_items (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  keycard_id text default 'global',
  item_id text not null,
  item_type text not null default 'quiz_question',
  content jsonb,
  easiness double precision not null default 2.5,
  interval integer not null default 0,
  repetition integer not null default 0,
  next_review timestamptz not null default now(),
  client_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, item_id)
);

create index if not exists srs_user_due_idx
  on public.srs_items (user_id, next_review)
  where deleted_at is null;

-- ── devices (optional multi-device awareness) ──────────────
create table if not exists public.devices (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  platform text,
  last_sync_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists devices_user_idx on public.devices (user_id);

-- ── sync cursor per device (delta sync helper) ─────────────
create table if not exists public.sync_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  last_pull_at timestamptz,
  last_push_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  primary key (user_id, device_id)
);

-- ── updated_at trigger ─────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists quizzes_set_updated_at on public.quizzes;
create trigger quizzes_set_updated_at
  before update on public.quizzes
  for each row execute function public.set_updated_at();

drop trigger if exists library_set_updated_at on public.library_items;
create trigger library_set_updated_at
  before update on public.library_items
  for each row execute function public.set_updated_at();

drop trigger if exists srs_set_updated_at on public.srs_items;
create trigger srs_set_updated_at
  before update on public.srs_items
  for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.user_profiles;
create trigger profiles_set_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- ── auto profile on signup ─────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'user_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── RLS ────────────────────────────────────────────────────
alter table public.user_profiles enable row level security;
alter table public.quizzes enable row level security;
alter table public.library_items enable row level security;
alter table public.srs_items enable row level security;
alter table public.devices enable row level security;
alter table public.sync_state enable row level security;

-- drop old policies if re-run
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('user_profiles','quizzes','library_items','srs_items','devices','sync_state')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- profiles
create policy profiles_select on public.user_profiles for select using (auth.uid() = user_id);
create policy profiles_insert on public.user_profiles for insert with check (auth.uid() = user_id);
create policy profiles_update on public.user_profiles for update using (auth.uid() = user_id);
create policy profiles_delete on public.user_profiles for delete using (auth.uid() = user_id);

-- quizzes: owner full access; public rows readable by anyone authenticated
create policy quizzes_select on public.quizzes for select
  using (auth.uid() = user_id or (visibility = 'public' and deleted_at is null));
create policy quizzes_insert on public.quizzes for insert with check (auth.uid() = user_id);
create policy quizzes_update on public.quizzes for update using (auth.uid() = user_id);
create policy quizzes_delete on public.quizzes for delete using (auth.uid() = user_id);

-- library
create policy library_select on public.library_items for select using (auth.uid() = user_id);
create policy library_insert on public.library_items for insert with check (auth.uid() = user_id);
create policy library_update on public.library_items for update using (auth.uid() = user_id);
create policy library_delete on public.library_items for delete using (auth.uid() = user_id);

-- srs
create policy srs_select on public.srs_items for select using (auth.uid() = user_id);
create policy srs_insert on public.srs_items for insert with check (auth.uid() = user_id);
create policy srs_update on public.srs_items for update using (auth.uid() = user_id);
create policy srs_delete on public.srs_items for delete using (auth.uid() = user_id);

-- devices / sync_state
create policy devices_all on public.devices for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy sync_state_all on public.sync_state for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Realtime (cross-device live updates) ───────────────────
-- Dashboard → Database → Replication → enable for these tables,
-- or run (needs supabase_realtime membership):
do $$
begin
  begin
    alter publication supabase_realtime add table public.quizzes;
  exception when duplicate_object then null; when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.srs_items;
  exception when duplicate_object then null; when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.library_items;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end $$;

-- ── helpful view: due SRS count ────────────────────────────
create or replace view public.srs_due_counts as
select user_id, count(*)::int as due_count
from public.srs_items
where deleted_at is null and next_review <= now()
group by user_id;
