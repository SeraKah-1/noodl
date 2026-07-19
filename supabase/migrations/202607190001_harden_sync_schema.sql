-- Harden existing Noodl installs. The canonical fresh-install definition lives
-- in ../schema.sql; this migration is intentionally safe to run once via CLI.

alter table public.srs_items
  drop constraint if exists srs_items_user_id_item_id_key;
alter table public.srs_items
  drop constraint if exists srs_items_user_id_keycard_id_item_id_key;
alter table public.srs_items
  add constraint srs_items_user_id_keycard_id_item_id_key
  unique (user_id, keycard_id, item_id);

create schema if not exists private;
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (user_id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
revoke all on function private.handle_new_user() from public, anon, authenticated;

alter view public.srs_due_counts set (security_invoker = true);

revoke all on table public.user_profiles, public.quizzes, public.library_items,
  public.srs_items, public.devices, public.sync_state from anon, authenticated;
grant select on table public.quizzes to anon;
grant select, insert, update, delete on table public.user_profiles, public.quizzes,
  public.library_items, public.srs_items, public.devices, public.sync_state to authenticated;
revoke all on table public.srs_due_counts from anon, authenticated;
grant select on table public.srs_due_counts to authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

drop policy if exists profiles_update on public.user_profiles;
create policy profiles_update on public.user_profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists quizzes_update on public.quizzes;
create policy quizzes_update on public.quizzes for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists library_update on public.library_items;
create policy library_update on public.library_items for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists srs_update on public.srs_items;
create policy srs_update on public.srs_items for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
