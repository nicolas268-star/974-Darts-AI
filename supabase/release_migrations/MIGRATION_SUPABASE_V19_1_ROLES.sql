-- 974 Darts AI - V19.1
-- Roles de session X01 : HOST / SCORER / SPECTATOR
-- A EXECUTER UNE SEULE FOIS APRES la migration V19.0.0.

begin;

-- Autoriser le role lecture seule.
alter table public.live_game_members
  drop constraint if exists live_game_members_role_check;

alter table public.live_game_members
  add constraint live_game_members_role_check
  check (role in ('HOST','SCORER','SPECTATOR'));

-- Droit d'ecriture : createur, HOST ou SCORER uniquement.
create or replace function public.can_score_live_game(p_game_id uuid)
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
            and m.role in ('HOST','SCORER')
        )
      )
  );
$$;

create or replace function public.can_score_live_leg(p_leg_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.live_legs l
    where l.id = p_leg_id
      and public.can_score_live_game(l.game_id)
  );
$$;

create or replace function public.can_score_live_visit(p_visit_id uuid)
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
      and public.can_score_live_game(l.game_id)
  );
$$;

revoke all on function public.can_score_live_game(uuid) from public;
revoke all on function public.can_score_live_leg(uuid) from public;
revoke all on function public.can_score_live_visit(uuid) from public;
grant execute on function public.can_score_live_game(uuid) to authenticated;
grant execute on function public.can_score_live_leg(uuid) to authenticated;
grant execute on function public.can_score_live_visit(uuid) to authenticated;

-- Rejoindre/reprendre en choisissant Joueur ou Observateur.
drop function if exists public.join_live_game_session(text);
create or replace function public.join_live_game_session(
  p_code text,
  p_role text default 'SCORER'
)
returns table(game_id uuid, session_code text, status text, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.live_games%rowtype;
  normalized text;
  requested_role text;
  resolved_role text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  normalized := upper(regexp_replace(coalesce(p_code, ''), '[^A-Z0-9]', '', 'g'));
  if length(normalized) <> 6 then
    raise exception 'INVALID_SESSION_CODE';
  end if;

  requested_role := upper(coalesce(p_role, 'SCORER'));
  if requested_role not in ('SCORER','SPECTATOR') then
    raise exception 'INVALID_SESSION_ROLE';
  end if;

  select * into target
  from public.live_games g
  where g.session_code = normalized
  limit 1;

  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if target.status <> 'IN_PROGRESS' then raise exception 'SESSION_NOT_ACTIVE'; end if;

  if target.created_by = auth.uid() then
    resolved_role := 'HOST';
  else
    resolved_role := requested_role;
  end if;

  insert into public.live_game_members(game_id, user_id, role)
  values (target.id, auth.uid(), resolved_role)
  on conflict (game_id, user_id)
  do update set role = case
    when public.live_game_members.role = 'HOST' then 'HOST'
    else excluded.role
  end;

  return query select target.id, target.session_code, target.status, resolved_role;
end;
$$;

revoke all on function public.join_live_game_session(text,text) from public;
grant execute on function public.join_live_game_session(text,text) to authenticated;

-- Les observateurs gardent la lecture via can_access_*, mais pas l'ecriture.
drop policy if exists live_games_session_update_v19 on public.live_games;
create policy live_games_session_update_v19 on public.live_games
for update to authenticated
using (public.can_score_live_game(id))
with check (public.can_score_live_game(id));

drop policy if exists live_game_players_session_insert_v19 on public.live_game_players;
create policy live_game_players_session_insert_v19 on public.live_game_players
for insert to authenticated
with check (public.can_score_live_game(game_id));

drop policy if exists live_game_players_session_update_v19 on public.live_game_players;
create policy live_game_players_session_update_v19 on public.live_game_players
for update to authenticated
using (public.can_score_live_game(game_id))
with check (public.can_score_live_game(game_id));

drop policy if exists live_legs_session_insert_v19 on public.live_legs;
create policy live_legs_session_insert_v19 on public.live_legs
for insert to authenticated
with check (public.can_score_live_game(game_id));

drop policy if exists live_legs_session_update_v19 on public.live_legs;
create policy live_legs_session_update_v19 on public.live_legs
for update to authenticated
using (public.can_score_live_game(game_id))
with check (public.can_score_live_game(game_id));

drop policy if exists live_visits_session_insert_v19 on public.live_visits;
create policy live_visits_session_insert_v19 on public.live_visits
for insert to authenticated
with check (public.can_score_live_leg(leg_id));

drop policy if exists live_visits_session_update_v19 on public.live_visits;
create policy live_visits_session_update_v19 on public.live_visits
for update to authenticated
using (public.can_score_live_leg(leg_id))
with check (public.can_score_live_leg(leg_id));

drop policy if exists live_visits_session_delete_v19 on public.live_visits;
create policy live_visits_session_delete_v19 on public.live_visits
for delete to authenticated
using (public.can_score_live_leg(leg_id));

drop policy if exists live_throws_session_insert_v19 on public.live_throws;
create policy live_throws_session_insert_v19 on public.live_throws
for insert to authenticated
with check (public.can_score_live_visit(visit_id));

drop policy if exists live_throws_session_delete_v19 on public.live_throws;
create policy live_throws_session_delete_v19 on public.live_throws
for delete to authenticated
using (public.can_score_live_visit(visit_id));

commit;
