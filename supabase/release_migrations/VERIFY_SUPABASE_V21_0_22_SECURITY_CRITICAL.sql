-- Verification en lecture seule de la migration V21.0.22.

-- A-001 : attendu false / false / false / true.
select
  has_function_privilege('public', 'public.apply_incremental_publication(uuid,text,text,uuid,jsonb)', 'EXECUTE') as public_execute,
  has_function_privilege('anon', 'public.apply_incremental_publication(uuid,text,text,uuid,jsonb)', 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', 'public.apply_incremental_publication(uuid,text,text,uuid,jsonb)', 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', 'public.apply_incremental_publication(uuid,text,text,uuid,jsonb)', 'EXECUTE') as service_role_execute;

-- A-002 vue : attendu security_invoker=true, anon=false, authenticated=false,
-- service_role=true.
select
  c.reloptions,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
  has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
  has_table_privilege('service_role', c.oid, 'SELECT') as service_role_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'player_identity_resolution'
  and c.relkind = 'v';

-- Matrice des 13 autres fonctions examinees. Aucune ne doit rester anonyme.
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'can_access_live_game',
    'can_access_live_leg',
    'can_access_live_visit',
    'can_score_live_game',
    'can_score_live_leg',
    'can_score_live_visit',
    'current_app_role',
    'current_captain_team_id',
    'generate_live_game_session_code',
    'handle_new_user',
    'join_live_game_session',
    'list_my_live_game_sessions',
    'live_game_add_host_member'
  )
order by p.proname, arguments;

-- Les deux politiques doivent remplacer l'ancienne politique TO public.
select policyname, roles, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename = 'player_leg_stats'
  and policyname in (
    'public player leg stats readable',
    'anonymous public player leg stats readable',
    'authenticated player leg stats readable'
  )
order by policyname;

