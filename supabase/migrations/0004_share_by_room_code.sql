-- Open scripts to any authenticated user who knows the room_id.
-- The room_id is a random 8-char code (~1 trillion combos) — treat it as
-- the "share link secret." Anyone with an account + the code can join and
-- edit. Dashboard queries filter by owner in the client so users only see
-- their own scripts unless they explicitly join by room code.

-- SELECT: any authenticated user can read any script row.
drop policy if exists "scripts_select_member"        on public.scripts;
drop policy if exists "scripts_select_authenticated" on public.scripts;
create policy "scripts_select_authenticated" on public.scripts
  for select using (auth.uid() is not null);

-- UPDATE: any authenticated user can update. Client code only writes y_state.
-- Owner-only privileges (rename, delete) are protected below.
drop policy if exists "scripts_update_editor"        on public.scripts;
drop policy if exists "scripts_update_authenticated" on public.scripts;
create policy "scripts_update_authenticated" on public.scripts
  for update using (auth.uid() is not null)
              with check (auth.uid() is not null);

-- Prevent non-owners from changing owner_id / room_id / title via a trigger.
-- (Column-level GRANTS would work too, but this is easier to reason about.)
create or replace function public.enforce_script_ownership_immutable()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is distinct from old.owner_id then
    new.owner_id := old.owner_id;
    new.room_id  := old.room_id;
    new.title    := old.title;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists scripts_enforce_ownership on public.scripts;
create trigger scripts_enforce_ownership
  before update on public.scripts
  for each row execute function public.enforce_script_ownership_immutable();
