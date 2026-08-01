-- OptaPrompter schema
-- Run in Supabase SQL editor (or `supabase db push` if using the CLI).

-- Extensions
create extension if not exists "pgcrypto";

-- ============================================================================
-- profiles: 1:1 with auth.users, populated by trigger
-- ============================================================================
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  created_at   timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- scripts: one document per teleprompter session
-- ============================================================================
create table if not exists public.scripts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default 'Untitled',
  room_id     text not null unique,           -- short human-friendly room code
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  -- Yjs binary snapshot; y-supabase writes here on debounced flushes.
  y_state     bytea,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists scripts_owner_idx    on public.scripts(owner_id);
create index if not exists scripts_room_idx     on public.scripts(room_id);
create index if not exists scripts_updated_idx  on public.scripts(updated_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists scripts_touch_updated_at on public.scripts;
create trigger scripts_touch_updated_at
  before update on public.scripts
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- script_collaborators: shared editing / read-only presenter access
-- ============================================================================
create table if not exists public.script_collaborators (
  script_id uuid not null references public.scripts(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null check (role in ('editor','presenter','viewer')) default 'editor',
  created_at timestamptz not null default now(),
  primary key (script_id, user_id)
);

-- ============================================================================
-- Row-Level Security
-- ============================================================================
alter table public.profiles              enable row level security;
alter table public.scripts               enable row level security;
alter table public.script_collaborators  enable row level security;

-- profiles: users can read all profiles (needed to render collaborator names),
-- but can only update their own.
drop policy if exists "profiles_select_all"      on public.profiles;
drop policy if exists "profiles_update_own"      on public.profiles;
create policy "profiles_select_all" on public.profiles for select using (true);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- scripts: owner or collaborator can read; only owner+editors can write.
drop policy if exists "scripts_select_member"    on public.scripts;
drop policy if exists "scripts_insert_owner"    on public.scripts;
drop policy if exists "scripts_update_editor"   on public.scripts;
drop policy if exists "scripts_delete_owner"    on public.scripts;

create policy "scripts_select_member" on public.scripts for select using (
  owner_id = auth.uid()
  or exists (
    select 1 from public.script_collaborators c
    where c.script_id = scripts.id and c.user_id = auth.uid()
  )
);

create policy "scripts_insert_owner" on public.scripts for insert with check (
  owner_id = auth.uid()
);

create policy "scripts_update_editor" on public.scripts for update using (
  owner_id = auth.uid()
  or exists (
    select 1 from public.script_collaborators c
    where c.script_id = scripts.id and c.user_id = auth.uid() and c.role in ('editor')
  )
);

create policy "scripts_delete_owner" on public.scripts for delete using (
  owner_id = auth.uid()
);

-- script_collaborators: only script owner manages membership.
drop policy if exists "collab_select_member" on public.script_collaborators;
drop policy if exists "collab_write_owner"   on public.script_collaborators;

create policy "collab_select_member" on public.script_collaborators for select using (
  user_id = auth.uid()
  or exists (select 1 from public.scripts s where s.id = script_id and s.owner_id = auth.uid())
);

create policy "collab_write_owner" on public.script_collaborators
  for all using (
    exists (select 1 from public.scripts s where s.id = script_id and s.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.scripts s where s.id = script_id and s.owner_id = auth.uid())
  );

-- ============================================================================
-- Realtime: broadcast row changes on scripts (y-supabase also uses a broadcast
-- channel keyed by room_id; enabling this table is optional but useful for
-- dashboard list updates).
-- ============================================================================
alter publication supabase_realtime add table public.scripts;
