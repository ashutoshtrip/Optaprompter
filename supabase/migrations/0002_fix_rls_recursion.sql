-- Fix: infinite recursion between scripts + script_collaborators RLS policies.
-- Postgres RLS re-evaluates policies on every referenced table, so a policy
-- that reads the "other" table triggers that table's policy, which reads back,
-- and so on. The idiomatic fix is to hoist the cross-table lookup into a
-- SECURITY DEFINER function that runs with the function owner's privileges
-- and skips RLS on the internal query.

-- ============================================================================
-- Helper functions
-- ============================================================================
create or replace function public.is_script_collaborator(_script_id uuid, _user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.script_collaborators
    where script_id = _script_id and user_id = _user_id
  );
$$;

create or replace function public.is_script_editor(_script_id uuid, _user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.script_collaborators
    where script_id = _script_id and user_id = _user_id and role = 'editor'
  );
$$;

create or replace function public.is_script_owner(_script_id uuid, _user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.scripts
    where id = _script_id and owner_id = _user_id
  );
$$;

-- ============================================================================
-- Rebuild policies
-- ============================================================================

-- scripts
drop policy if exists "scripts_select_member" on public.scripts;
drop policy if exists "scripts_insert_owner"  on public.scripts;
drop policy if exists "scripts_update_editor" on public.scripts;
drop policy if exists "scripts_delete_owner"  on public.scripts;

create policy "scripts_select_member" on public.scripts for select using (
  owner_id = auth.uid()
  or public.is_script_collaborator(id, auth.uid())
);

create policy "scripts_insert_owner" on public.scripts for insert with check (
  owner_id = auth.uid()
);

create policy "scripts_update_editor" on public.scripts for update using (
  owner_id = auth.uid()
  or public.is_script_editor(id, auth.uid())
);

create policy "scripts_delete_owner" on public.scripts for delete using (
  owner_id = auth.uid()
);

-- script_collaborators
drop policy if exists "collab_select_member" on public.script_collaborators;
drop policy if exists "collab_write_owner"   on public.script_collaborators;

create policy "collab_select_member" on public.script_collaborators for select using (
  user_id = auth.uid()
  or public.is_script_owner(script_id, auth.uid())
);

create policy "collab_write_owner" on public.script_collaborators
  for all using (public.is_script_owner(script_id, auth.uid()))
        with check (public.is_script_owner(script_id, auth.uid()));
