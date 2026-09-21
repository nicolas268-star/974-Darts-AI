-- A018 / F-031 / F-032
-- Optimise les politiques RLS sans élargir les autorisations.
-- À appliquer seulement après exécution du script VERIFY en pré-déploiement.
begin;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='live_games'
      and policyname='owners manage live games'
  ) then
    raise exception 'A018 preflight failed: production RLS baseline has drifted';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='player_profiles'
      and policyname='captains read team profiles'
  ) then
    raise exception 'A018 preflight failed: player profile RLS baseline has drifted';
  end if;
end $$;

drop policy if exists "public read public players" on public.players;
create policy "public read public players" on public.players
for select to public
using (public_profile = true or (select auth.uid()) is not null);

drop policy if exists "public read published rounds" on public.rounds;
create policy "public read published rounds" on public.rounds
for select to public
using (published = true or (select auth.uid()) is not null);

drop policy if exists "players read own statistics" on public.player_profiles;
drop policy if exists "public read allowed player profiles" on public.player_profiles;
drop policy if exists "captains read team profiles" on public.player_profiles;

create policy "public read allowed player profiles"
on public.player_profiles for select
to anon, authenticator, dashboard_user, supabase_privileged_role
using (
  player_id in (
    select p.id from public.players p where p.public_profile = true
  )
);

create policy "authenticated read allowed player profiles"
on public.player_profiles for select
to authenticated
using (
  player_id in (
    select p.id from public.players p where p.public_profile = true
  )
  or player_id in (
    select pr.player_id from public.profiles pr
    where pr.user_id = (select auth.uid())
  )
  or (select public.current_app_role()) = 'ADMIN'::public.app_role
  or player_id in (
    select p.id from public.players p
    where p.team_id = (select public.current_captain_team_id())
  )
);

drop policy if exists "players read own daily statistics" on public.player_daily_stats;
drop policy if exists "public read allowed daily stats" on public.player_daily_stats;
drop policy if exists "captains read team daily stats" on public.player_daily_stats;

create policy "public read allowed daily stats"
on public.player_daily_stats for select
to anon, authenticator, dashboard_user, supabase_privileged_role
using (
  player_id in (
    select p.id from public.players p where p.public_profile = true
  )
);

create policy "authenticated read allowed daily stats"
on public.player_daily_stats for select
to authenticated
using (
  player_id in (
    select p.id from public.players p where p.public_profile = true
  )
  or player_id in (
    select pr.player_id from public.profiles pr
    where pr.user_id = (select auth.uid())
  )
  or (select public.current_app_role()) = 'ADMIN'::public.app_role
  or team_id = (select public.current_captain_team_id())
);

drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin"
on public.profiles for select to authenticated
using (
  user_id = (select auth.uid())
  or (select public.current_app_role()) = 'ADMIN'::public.app_role
);

drop policy if exists "profiles admin update" on public.profiles;
drop policy if exists "profiles update own display name" on public.profiles;
create policy "profiles update own or admin"
on public.profiles for update to authenticated
using (
  (select public.current_app_role()) = 'ADMIN'::public.app_role
  or user_id = (select auth.uid())
)
with check (
  (select public.current_app_role()) = 'ADMIN'::public.app_role
  or (
    user_id = (select auth.uid())
    and role = (select public.current_app_role())
  )
);

drop policy if exists "admins manage competition rules" on public.competition_rules;
drop policy if exists "public read competition rules" on public.competition_rules;
create policy "public read competition rules"
on public.competition_rules for select to public using (true);
create policy "admins insert competition rules"
on public.competition_rules for insert to authenticated
with check ((select public.current_app_role()) = 'ADMIN'::public.app_role);
create policy "admins update competition rules"
on public.competition_rules for update to authenticated
using ((select public.current_app_role()) = 'ADMIN'::public.app_role)
with check ((select public.current_app_role()) = 'ADMIN'::public.app_role);
create policy "admins delete competition rules"
on public.competition_rules for delete to authenticated
using ((select public.current_app_role()) = 'ADMIN'::public.app_role);

drop policy if exists "admins manage championship results" on public.championship_results;
drop policy if exists "public read championship results" on public.championship_results;
create policy "public read championship results"
on public.championship_results for select to public using (true);
create policy "admins insert championship results"
on public.championship_results for insert to authenticated
with check ((select public.current_app_role()) = 'ADMIN'::public.app_role);
create policy "admins update championship results"
on public.championship_results for update to authenticated
using ((select public.current_app_role()) = 'ADMIN'::public.app_role)
with check ((select public.current_app_role()) = 'ADMIN'::public.app_role);
create policy "admins delete championship results"
on public.championship_results for delete to authenticated
using ((select public.current_app_role()) = 'ADMIN'::public.app_role);

drop policy if exists "owners manage live games" on public.live_games;
create policy "owners insert live games"
on public.live_games for insert to authenticated
with check (created_by = (select auth.uid()));
create policy "owners delete live games"
on public.live_games for delete to authenticated
using (created_by = (select auth.uid()));

drop policy if exists "owners manage live game players" on public.live_game_players;
create policy "owners delete live game players"
on public.live_game_players for delete to authenticated
using (
  exists (
    select 1 from public.live_games g
    where g.id = live_game_players.game_id
      and g.created_by = (select auth.uid())
  )
);

drop policy if exists "owners manage live legs" on public.live_legs;
create policy "owners delete live legs"
on public.live_legs for delete to authenticated
using (
  exists (
    select 1 from public.live_games g
    where g.id = live_legs.game_id
      and g.created_by = (select auth.uid())
  )
);

-- can_access/can_score already includes the game owner.
drop policy if exists "owners manage live visits" on public.live_visits;

drop policy if exists "owners manage live throws" on public.live_throws;
create policy "owners update live throws"
on public.live_throws for update to authenticated
using (
  exists (
    select 1
    from public.live_visits v
    join public.live_legs l on l.id = v.leg_id
    join public.live_games g on g.id = l.game_id
    where v.id = live_throws.visit_id
      and g.created_by = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.live_visits v
    join public.live_legs l on l.id = v.leg_id
    join public.live_games g on g.id = l.game_id
    where v.id = live_throws.visit_id
      and g.created_by = (select auth.uid())
  )
);

drop policy if exists "live_game_members_select_v19" on public.live_game_members;
create policy "live_game_members_select_v19"
on public.live_game_members for select to authenticated
using (
  user_id = (select auth.uid())
  or public.can_access_live_game(game_id)
);

commit;
