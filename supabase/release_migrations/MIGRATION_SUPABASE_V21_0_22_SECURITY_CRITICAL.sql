-- 974 Darts AI - V21.0.22
-- Audit NDX Performance Lab : actions A-001 et A-002.
-- Objectif : appliquer le moindre privilege aux fonctions SECURITY DEFINER
-- et neutraliser la vue SECURITY DEFINER d'identites.
-- Validee par simulation transactionnelle (assertions puis ROLLBACK) sur le
-- schema de production, le plan Free ne permettant pas les branches Supabase.

begin;

-- Eviter que les futures fonctions creees par le role de migration soient
-- automatiquement executables par les roles exposes au Data API.
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

-- A-001 : cette RPC modifie le championnat et ne doit etre appelee que par le
-- backend, qui utilise la cle service_role.
revoke all on function public.apply_incremental_publication(
  uuid,
  text,
  text,
  uuid,
  jsonb
) from public, anon, authenticated;
grant execute on function public.apply_incremental_publication(
  uuid,
  text,
  text,
  uuid,
  jsonb
) to service_role;

-- A-002 : la resolution canonique est consommee par les services backend.
-- security_invoker empeche la vue de contourner les RLS des tables sources.
alter view public.player_identity_resolution
  set (security_invoker = true);
revoke all on table public.player_identity_resolution
  from public, anon, authenticated;
grant select on table public.player_identity_resolution to service_role;

-- Les helpers RLS ci-dessous restent SECURITY DEFINER pour eviter la recursion
-- entre politiques. Ils sont necessaires aux joueurs connectes, mais n'ont
-- aucune raison d'etre appelables anonymement.
revoke all on function public.can_access_live_game(uuid)
  from public, anon;
revoke all on function public.can_access_live_leg(uuid)
  from public, anon;
revoke all on function public.can_access_live_visit(uuid)
  from public, anon;
revoke all on function public.can_score_live_game(uuid)
  from public, anon;
revoke all on function public.can_score_live_leg(uuid)
  from public, anon;
revoke all on function public.can_score_live_visit(uuid)
  from public, anon;
revoke all on function public.current_app_role()
  from public, anon;
revoke all on function public.current_captain_team_id()
  from public, anon;

grant execute on function public.can_access_live_game(uuid) to authenticated, service_role;
grant execute on function public.can_access_live_leg(uuid) to authenticated, service_role;
grant execute on function public.can_access_live_visit(uuid) to authenticated, service_role;
grant execute on function public.can_score_live_game(uuid) to authenticated, service_role;
grant execute on function public.can_score_live_leg(uuid) to authenticated, service_role;
grant execute on function public.can_score_live_visit(uuid) to authenticated, service_role;
grant execute on function public.current_app_role() to authenticated, service_role;
grant execute on function public.current_captain_team_id() to authenticated, service_role;

-- RPC explicitement destinees aux joueurs authentifies.
revoke all on function public.join_live_game_session(text, text)
  from public, anon;
revoke all on function public.list_my_live_game_sessions()
  from public, anon;
grant execute on function public.join_live_game_session(text, text)
  to authenticated, service_role;
grant execute on function public.list_my_live_game_sessions()
  to authenticated, service_role;

-- Generateur utilise par la valeur par defaut de live_games. Le role
-- authenticated doit pouvoir l'executer pendant un INSERT autorise par RLS.
revoke all on function public.generate_live_game_session_code()
  from public, anon;
grant execute on function public.generate_live_game_session_code()
  to authenticated, service_role;

-- Fonctions de trigger : aucune invocation directe depuis le Data API.
revoke all on function public.handle_new_user()
  from public, anon, authenticated;
revoke all on function public.live_game_add_host_member()
  from public, anon, authenticated;
grant execute on function public.handle_new_user()
  to supabase_auth_admin, service_role;
grant execute on function public.live_game_add_host_member()
  to service_role;

-- L'ancienne politique etait TO public et appelait current_app_role().
-- La separer permet aux visiteurs anonymes de lire uniquement les profils
-- publics sans conserver EXECUTE sur le helper privilegie.
drop policy if exists "public player leg stats readable"
  on public.player_leg_stats;
drop policy if exists "anonymous public player leg stats readable"
  on public.player_leg_stats;
drop policy if exists "authenticated player leg stats readable"
  on public.player_leg_stats;

create policy "anonymous public player leg stats readable"
on public.player_leg_stats
for select
to anon
using (
  player_id in (
    select public.players.id
    from public.players
    where public.players.public_profile = true
  )
);

create policy "authenticated player leg stats readable"
on public.player_leg_stats
for select
to authenticated
using (
  player_id in (
    select public.players.id
    from public.players
    where public.players.public_profile = true
  )
  or player_id in (
    select public.profiles.player_id
    from public.profiles
    where public.profiles.user_id = (select auth.uid())
  )
  or public.current_app_role() in ('CAPTAIN'::public.app_role, 'ADMIN'::public.app_role)
);

commit;
