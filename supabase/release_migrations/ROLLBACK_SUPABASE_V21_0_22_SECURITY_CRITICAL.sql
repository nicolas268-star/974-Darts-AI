-- Retour arriere d'urgence vers les ACL observees avant V21.0.22.
-- Ce fichier restaure volontairement les expositions signalees par l'audit.
-- Ne l'executer qu'en cas de regression confirmee.

begin;

alter default privileges in schema public
  grant execute on functions to anon, authenticated;

alter view public.player_identity_resolution
  reset (security_invoker);
grant all on table public.player_identity_resolution
  to anon, authenticated;

grant execute on function public.apply_incremental_publication(uuid,text,text,uuid,jsonb)
  to anon, authenticated;

grant execute on function public.can_access_live_game(uuid) to anon, authenticated;
grant execute on function public.can_access_live_leg(uuid) to anon, authenticated;
grant execute on function public.can_access_live_visit(uuid) to anon, authenticated;
grant execute on function public.can_score_live_game(uuid) to anon, authenticated;
grant execute on function public.can_score_live_leg(uuid) to anon, authenticated;
grant execute on function public.can_score_live_visit(uuid) to anon, authenticated;
grant execute on function public.current_app_role() to anon, authenticated;
grant execute on function public.current_captain_team_id() to anon, authenticated;
grant execute on function public.join_live_game_session(text,text) to anon, authenticated;
grant execute on function public.list_my_live_game_sessions() to anon, authenticated;

grant execute on function public.generate_live_game_session_code()
  to public, anon, authenticated;
grant execute on function public.handle_new_user()
  to public, anon, authenticated;
grant execute on function public.live_game_add_host_member()
  to public, anon, authenticated;

drop policy if exists "anonymous public player leg stats readable"
  on public.player_leg_stats;
drop policy if exists "authenticated player leg stats readable"
  on public.player_leg_stats;

create policy "public player leg stats readable"
on public.player_leg_stats
for select
to public
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
