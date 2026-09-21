-- A018 verification (read-only)
-- Run before migration to capture the baseline, then after migration.
-- After migration, Supabase Performance Advisors must report:
-- auth_rls_initplan = 0 and multiple_permissive_policies = 0
-- for the policies covered by A018.

-- 1. Policy inventory and expressions.
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'players', 'rounds', 'player_profiles', 'player_daily_stats',
    'profiles', 'competition_rules', 'championship_results',
    'live_games', 'live_game_players', 'live_legs',
    'live_visits', 'live_throws', 'live_game_members'
  )
order by tablename, cmd, policyname;

-- 2. No legacy ALL policy may remain on tables that have action policies.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and policyname in (
    'admins manage competition rules',
    'admins manage championship results',
    'owners manage live games',
    'owners manage live game players',
    'owners manage live legs',
    'owners manage live visits',
    'owners manage live throws'
  );
-- Expected after A018: 0 row.

-- 3. Required replacement policies.
with expected(tablename, policyname, cmd) as (
  values
    ('player_profiles', 'authenticated read allowed player profiles', 'SELECT'),
    ('player_daily_stats', 'authenticated read allowed daily stats', 'SELECT'),
    ('profiles', 'profiles update own or admin', 'UPDATE'),
    ('competition_rules', 'admins insert competition rules', 'INSERT'),
    ('competition_rules', 'admins update competition rules', 'UPDATE'),
    ('competition_rules', 'admins delete competition rules', 'DELETE'),
    ('championship_results', 'admins insert championship results', 'INSERT'),
    ('championship_results', 'admins update championship results', 'UPDATE'),
    ('championship_results', 'admins delete championship results', 'DELETE'),
    ('live_games', 'owners insert live games', 'INSERT'),
    ('live_games', 'owners delete live games', 'DELETE'),
    ('live_game_players', 'owners delete live game players', 'DELETE'),
    ('live_legs', 'owners delete live legs', 'DELETE'),
    ('live_throws', 'owners update live throws', 'UPDATE')
)
select e.*
from expected e
left join pg_policies p
  on p.schemaname = 'public'
 and p.tablename = e.tablename
 and p.policyname = e.policyname
 and p.cmd = e.cmd
where p.policyname is null;
-- Expected after A018: 0 row.

-- 4. Authorization matrix to review.
select *
from (
  values
    ('player_profiles', 'anon', 'SELECT', 'public profiles only'),
    ('player_profiles', 'authenticated', 'SELECT', 'public OR own OR captain team OR admin'),
    ('player_daily_stats', 'anon', 'SELECT', 'public profiles only'),
    ('player_daily_stats', 'authenticated', 'SELECT', 'public OR own OR captain team OR admin'),
    ('profiles', 'authenticated', 'SELECT', 'own OR admin'),
    ('profiles', 'authenticated', 'UPDATE', 'own without role change OR admin'),
    ('competition_rules', 'public', 'SELECT', 'all rows'),
    ('competition_rules', 'authenticated admin', 'INSERT/UPDATE/DELETE', 'admin only'),
    ('championship_results', 'public', 'SELECT', 'all rows'),
    ('championship_results', 'authenticated admin', 'INSERT/UPDATE/DELETE', 'admin only'),
    ('live_games', 'authenticated owner/member', 'SELECT/UPDATE', 'session access'),
    ('live_games', 'authenticated owner', 'INSERT/DELETE', 'owner only'),
    ('live_game_players', 'authenticated owner/scorer', 'SELECT/INSERT/UPDATE', 'session access'),
    ('live_game_players', 'authenticated owner', 'DELETE', 'owner only'),
    ('live_legs', 'authenticated owner/scorer', 'SELECT/INSERT/UPDATE', 'session access'),
    ('live_legs', 'authenticated owner', 'DELETE', 'owner only'),
    ('live_visits', 'authenticated owner/scorer', 'SELECT/INSERT/UPDATE/DELETE', 'session access'),
    ('live_throws', 'authenticated owner/scorer', 'SELECT/INSERT/DELETE', 'session access'),
    ('live_throws', 'authenticated owner', 'UPDATE', 'owner only')
) as matrix(table_name, role_scope, actions, access_rule);

-- 5. Manual smoke tests required before production approval:
-- anon: public player/profile/stat reads succeed; private rows remain hidden.
-- player: own private profile/stat reads succeed; another private player stays hidden.
-- captain: team profiles/stats succeed; other teams stay hidden.
-- admin: competition rules/results CRUD succeeds.
-- live owner: create/read/update/delete game tree succeeds.
-- live scorer: permitted session scoring succeeds; owner-only deletion stays denied.
