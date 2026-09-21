-- A018 rollback
-- Restaure exactement les politiques observées avant A018.
begin;

drop policy if exists "public read public players" on public.players;
create policy "public read public players" on public.players
for select to public
using (public_profile = true or auth.uid() is not null);

drop policy if exists "public read published rounds" on public.rounds;
create policy "public read published rounds" on public.rounds
for select to public
using (published = true or auth.uid() is not null);

drop policy if exists "public read allowed player profiles" on public.player_profiles;
drop policy if exists "authenticated read allowed player profiles" on public.player_profiles;
create policy "players read own statistics" on public.player_profiles
for select to public
using (
  player_id in (
    select pr.player_id from public.profiles pr
    where pr.user_id = auth.uid()
  )
);
create policy "public read allowed player profiles" on public.player_profiles
for select to public
using (
  player_id in (
    select p.id from public.players p where p.public_profile = true
  )
);
create policy "captains read team profiles" on public.player_profiles
for select to authenticated
using (
  public.current_app_role() = 'ADMIN'::public.app_role
  or player_id in (
    select p.id from public.players p
    where p.team_id = public.current_captain_team_id()
  )
);

drop policy if exists "public read allowed daily stats" on public.player_daily_stats;
drop policy if exists "authenticated read allowed daily stats" on public.player_daily_stats;
create policy "players read own daily statistics" on public.player_daily_stats
for select to public
using (
  player_id in (
    select pr.player_id from public.profiles pr
    where pr.user_id = auth.uid()
  )
);
create policy "public read allowed daily stats" on public.player_daily_stats
for select to public
using (
  player_id in (
    select p.id from public.players p where p.public_profile = true
  )
);
create policy "captains read team daily stats" on public.player_daily_stats
for select to authenticated
using (
  public.current_app_role() = 'ADMIN'::public.app_role
  or team_id = public.current_captain_team_id()
);

drop policy if exists "profiles read own or admin" on public.profiles;
create policy "profiles read own or admin" on public.profiles
for select to authenticated
using (
  user_id = auth.uid()
  or public.current_app_role() = 'ADMIN'::public.app_role
);

drop policy if exists "profiles update own or admin" on public.profiles;
create policy "profiles admin update" on public.profiles
for update to authenticated
using (public.current_app_role() = 'ADMIN'::public.app_role)
with check (public.current_app_role() = 'ADMIN'::public.app_role);
create policy "profiles update own display name" on public.profiles
for update to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and role = public.current_app_role()
);

drop policy if exists "admins insert competition rules" on public.competition_rules;
drop policy if exists "admins update competition rules" on public.competition_rules;
drop policy if exists "admins delete competition rules" on public.competition_rules;
drop policy if exists "public read competition rules" on public.competition_rules;
create policy "admins manage competition rules" on public.competition_rules
for all to public
using (
  exists (
    select 1 from public.profiles pr
    where pr.user_id = auth.uid() and pr.role = 'ADMIN'::public.app_role
  )
)
with check (
  exists (
    select 1 from public.profiles pr
    where pr.user_id = auth.uid() and pr.role = 'ADMIN'::public.app_role
  )
);
create policy "public read competition rules" on public.competition_rules
for select to public using (true);

drop policy if exists "admins insert championship results" on public.championship_results;
drop policy if exists "admins update championship results" on public.championship_results;
drop policy if exists "admins delete championship results" on public.championship_results;
drop policy if exists "public read championship results" on public.championship_results;
create policy "admins manage championship results" on public.championship_results
for all to public
using (
  exists (
    select 1 from public.profiles pr
    where pr.user_id = auth.uid() and pr.role = 'ADMIN'::public.app_role
  )
)
with check (
  exists (
    select 1 from public.profiles pr
    where pr.user_id = auth.uid() and pr.role = 'ADMIN'::public.app_role
  )
);
create policy "public read championship results" on public.championship_results
for select to public using (true);

drop policy if exists "owners insert live games" on public.live_games;
drop policy if exists "owners delete live games" on public.live_games;
create policy "owners manage live games" on public.live_games
for all to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

drop policy if exists "owners delete live game players" on public.live_game_players;
create policy "owners manage live game players" on public.live_game_players
for all to authenticated
using (
  exists (
    select 1 from public.live_games g
    where g.id = live_game_players.game_id and g.created_by = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.live_games g
    where g.id = live_game_players.game_id and g.created_by = auth.uid()
  )
);

drop policy if exists "owners delete live legs" on public.live_legs;
create policy "owners manage live legs" on public.live_legs
for all to authenticated
using (
  exists (
    select 1 from public.live_games g
    where g.id = live_legs.game_id and g.created_by = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.live_games g
    where g.id = live_legs.game_id and g.created_by = auth.uid()
  )
);

create policy "owners manage live visits" on public.live_visits
for all to authenticated
using (
  exists (
    select 1
    from public.live_legs l
    join public.live_games g on g.id = l.game_id
    where l.id = live_visits.leg_id and g.created_by = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.live_legs l
    join public.live_games g on g.id = l.game_id
    where l.id = live_visits.leg_id and g.created_by = auth.uid()
  )
);

drop policy if exists "owners update live throws" on public.live_throws;
create policy "owners manage live throws" on public.live_throws
for all to authenticated
using (
  exists (
    select 1
    from public.live_visits v
    join public.live_legs l on l.id = v.leg_id
    join public.live_games g on g.id = l.game_id
    where v.id = live_throws.visit_id and g.created_by = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.live_visits v
    join public.live_legs l on l.id = v.leg_id
    join public.live_games g on g.id = l.game_id
    where v.id = live_throws.visit_id and g.created_by = auth.uid()
  )
);

drop policy if exists "live_game_members_select_v19" on public.live_game_members;
create policy "live_game_members_select_v19" on public.live_game_members
for select to authenticated
using (user_id = auth.uid() or public.can_access_live_game(game_id));

commit;
