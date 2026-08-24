-- 974 Darts AI - V19.0.0
-- Sessions de jeu X01 independantes / multi-parties / multi-appareils
-- A EXECUTER UNE SEULE FOIS dans Supabase SQL Editor AVANT le deploiement V19.

begin;

-- 1) Code court unique pour chaque partie X01.
alter table public.live_games
  add column if not exists session_code text;

create or replace function public.generate_live_game_session_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  loop
    candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (
      select 1 from public.live_games where session_code = candidate
    );
  end loop;
  return candidate;
end;
$$;

update public.live_games
set session_code = public.generate_live_game_session_code()
where session_code is null;

alter table public.live_games
  alter column session_code set default public.generate_live_game_session_code(),
  alter column session_code set not null;

create unique index if not exists live_games_session_code_uidx
  on public.live_games(session_code);

-- Contrainte ajoutee de facon idempotente.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'live_games_session_code_format_chk'
  ) then
    alter table public.live_games
      add constraint live_games_session_code_format_chk
      check (session_code ~ '^[A-Z0-9]{6}$');
  end if;
end $$;

-- 2) Membres autorises a ouvrir une session partagee.
create table if not exists public.live_game_members (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.live_games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'SCORER' check (role in ('HOST','SCORER')),
  joined_at timestamptz not null default now(),
  unique (game_id, user_id)
);

create index if not exists live_game_members_user_idx
  on public.live_game_members(user_id, joined_at desc);
create index if not exists live_game_members_game_idx
  on public.live_game_members(game_id);

-- Les parties deja presentes sont rattachees a leur createur.
insert into public.live_game_members(game_id, user_id, role)
select g.id, g.created_by, 'HOST'
from public.live_games g
where g.created_by is not null
on conflict (game_id, user_id) do nothing;

-- 3) Helpers d'autorisation. SECURITY DEFINER evite les boucles RLS.
create or replace function public.can_access_live_game(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.live_games g
    where g.id = p_game_id
      and (
        g.created_by = auth.uid()
        or exists (
          select 1
          from public.live_game_members m
          where m.game_id = g.id
            and m.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_access_live_leg(p_leg_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.live_legs l
    where l.id = p_leg_id
      and public.can_access_live_game(l.game_id)
  );
$$;

create or replace function public.can_access_live_visit(p_visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.live_visits v
    join public.live_legs l on l.id = v.leg_id
    where v.id = p_visit_id
      and public.can_access_live_game(l.game_id)
  );
$$;

revoke all on function public.can_access_live_game(uuid) from public;
revoke all on function public.can_access_live_leg(uuid) from public;
revoke all on function public.can_access_live_visit(uuid) from public;
grant execute on function public.can_access_live_game(uuid) to authenticated;
grant execute on function public.can_access_live_leg(uuid) to authenticated;
grant execute on function public.can_access_live_visit(uuid) to authenticated;

-- 4) Le createur devient automatiquement HOST.
create or replace function public.live_game_add_host_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.live_game_members(game_id, user_id, role)
    values (new.id, new.created_by, 'HOST')
    on conflict (game_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists live_game_add_host_member_trg on public.live_games;
create trigger live_game_add_host_member_trg
after insert on public.live_games
for each row execute function public.live_game_add_host_member();

-- 5) Rejoindre une partie par son code. L'utilisateur doit etre authentifie.
create or replace function public.join_live_game_session(p_code text)
returns table(game_id uuid, session_code text, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.live_games%rowtype;
  normalized text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  normalized := upper(regexp_replace(coalesce(p_code, ''), '[^A-Z0-9]', '', 'g'));
  if length(normalized) <> 6 then
    raise exception 'INVALID_SESSION_CODE';
  end if;

  select * into target
  from public.live_games g
  where g.session_code = normalized
  limit 1;

  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if target.status <> 'IN_PROGRESS' then
    raise exception 'SESSION_NOT_ACTIVE';
  end if;

  insert into public.live_game_members(game_id, user_id, role)
  values (target.id, auth.uid(), case when target.created_by = auth.uid() then 'HOST' else 'SCORER' end)
  on conflict (game_id, user_id) do nothing;

  return query select target.id, target.session_code, target.status;
end;
$$;

revoke all on function public.join_live_game_session(text) from public;
grant execute on function public.join_live_game_session(text) to authenticated;

-- Liste explicite des sessions de l'utilisateur. On ne depend pas d'anciennes policies
-- eventuellement plus larges pour construire le hub "Mes sessions".
create or replace function public.list_my_live_game_sessions()
returns table(
  id uuid,
  session_code text,
  starting_score integer,
  play_format text,
  current_leg_number integer,
  current_turn integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.session_code,
    g.starting_score,
    g.play_format,
    g.current_leg_number,
    g.current_turn,
    g.created_at,
    g.updated_at
  from public.live_games g
  where auth.uid() is not null
    and g.status = 'IN_PROGRESS'
    and (
      g.created_by = auth.uid()
      or exists (
        select 1 from public.live_game_members m
        where m.game_id = g.id and m.user_id = auth.uid()
      )
    )
  order by g.updated_at desc
  limit 12;
$$;

revoke all on function public.list_my_live_game_sessions() from public;
grant execute on function public.list_my_live_game_sessions() to authenticated;

-- 6) RLS : une session est visible/modifiable par son createur ou un membre ayant rejoint le code.
alter table public.live_game_members enable row level security;

-- Les policies sont ajoutees sans supprimer les policies historiques.
drop policy if exists live_game_members_select_v19 on public.live_game_members;
create policy live_game_members_select_v19 on public.live_game_members
for select to authenticated
using (user_id = auth.uid() or public.can_access_live_game(game_id));

drop policy if exists live_games_session_select_v19 on public.live_games;
create policy live_games_session_select_v19 on public.live_games
for select to authenticated
using (public.can_access_live_game(id));

drop policy if exists live_games_session_update_v19 on public.live_games;
create policy live_games_session_update_v19 on public.live_games
for update to authenticated
using (public.can_access_live_game(id))
with check (public.can_access_live_game(id));

drop policy if exists live_game_players_session_select_v19 on public.live_game_players;
create policy live_game_players_session_select_v19 on public.live_game_players
for select to authenticated
using (public.can_access_live_game(game_id));

drop policy if exists live_game_players_session_insert_v19 on public.live_game_players;
create policy live_game_players_session_insert_v19 on public.live_game_players
for insert to authenticated
with check (public.can_access_live_game(game_id));

drop policy if exists live_game_players_session_update_v19 on public.live_game_players;
create policy live_game_players_session_update_v19 on public.live_game_players
for update to authenticated
using (public.can_access_live_game(game_id))
with check (public.can_access_live_game(game_id));

drop policy if exists live_legs_session_select_v19 on public.live_legs;
create policy live_legs_session_select_v19 on public.live_legs
for select to authenticated
using (public.can_access_live_game(game_id));

drop policy if exists live_legs_session_insert_v19 on public.live_legs;
create policy live_legs_session_insert_v19 on public.live_legs
for insert to authenticated
with check (public.can_access_live_game(game_id));

drop policy if exists live_legs_session_update_v19 on public.live_legs;
create policy live_legs_session_update_v19 on public.live_legs
for update to authenticated
using (public.can_access_live_game(game_id))
with check (public.can_access_live_game(game_id));

drop policy if exists live_visits_session_select_v19 on public.live_visits;
create policy live_visits_session_select_v19 on public.live_visits
for select to authenticated
using (public.can_access_live_leg(leg_id));

drop policy if exists live_visits_session_insert_v19 on public.live_visits;
create policy live_visits_session_insert_v19 on public.live_visits
for insert to authenticated
with check (public.can_access_live_leg(leg_id));

drop policy if exists live_visits_session_update_v19 on public.live_visits;
create policy live_visits_session_update_v19 on public.live_visits
for update to authenticated
using (public.can_access_live_leg(leg_id))
with check (public.can_access_live_leg(leg_id));

drop policy if exists live_visits_session_delete_v19 on public.live_visits;
create policy live_visits_session_delete_v19 on public.live_visits
for delete to authenticated
using (public.can_access_live_leg(leg_id));

drop policy if exists live_throws_session_select_v19 on public.live_throws;
create policy live_throws_session_select_v19 on public.live_throws
for select to authenticated
using (public.can_access_live_visit(visit_id));

drop policy if exists live_throws_session_insert_v19 on public.live_throws;
create policy live_throws_session_insert_v19 on public.live_throws
for insert to authenticated
with check (public.can_access_live_visit(visit_id));

drop policy if exists live_throws_session_delete_v19 on public.live_throws;
create policy live_throws_session_delete_v19 on public.live_throws
for delete to authenticated
using (public.can_access_live_visit(visit_id));

commit;

-- Verification apres execution :
-- select session_code, status, created_at from public.live_games order by created_at desc limit 10;
