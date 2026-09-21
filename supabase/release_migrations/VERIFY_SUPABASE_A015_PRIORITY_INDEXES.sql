-- Vérification A-015 — doit retourner 23 index valides et 14 FK non couvertes.

with expected(index_name) as (
  values
    ('idx_player_leg_stats_player_id'),
    ('idx_player_leg_stats_team_id'),
    ('idx_player_leg_stats_import_id'),
    ('idx_legs_match_id'),
    ('idx_legs_import_id'),
    ('idx_legs_winner_team_id'),
    ('idx_matches_encounter_id'),
    ('idx_matches_import_id'),
    ('idx_matches_team_1_id'),
    ('idx_matches_team_2_id'),
    ('idx_matches_winner_team_id'),
    ('idx_encounters_round_id'),
    ('idx_encounters_home_team_id'),
    ('idx_encounters_away_team_id'),
    ('idx_encounters_import_id'),
    ('idx_players_team_id'),
    ('idx_player_profiles_season_id'),
    ('idx_player_team_memberships_season_id'),
    ('idx_player_team_memberships_team_id'),
    ('idx_championship_results_round_id'),
    ('idx_championship_results_home_team_id'),
    ('idx_championship_results_away_team_id'),
    ('idx_teams_club_id')
),
actual as (
  select c.relname as index_name, i.indisvalid, i.indisready
  from pg_index i
  join pg_class c on c.oid = i.indexrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
),
uncovered_fk as (
  select con.oid
  from pg_constraint con
  where con.contype = 'f'
    and con.connamespace = 'public'::regnamespace
    and not exists (
      select 1
      from pg_index i
      where i.indrelid = con.conrelid
        and i.indisvalid
        and i.indisready
        and (i.indkey::smallint[])[0:cardinality(con.conkey)-1] @> con.conkey
    )
)
select
  count(*) filter (where a.index_name is not null) as indexes_found,
  count(*) filter (where a.indisvalid and a.indisready) as indexes_valid,
  count(*) filter (where a.index_name is null) as indexes_missing,
  (select count(*) from uncovered_fk) as remaining_uncovered_foreign_keys
from expected e
left join actual a using (index_name);

-- Plans représentatifs à comparer avec la mesure initiale.
explain (analyze, buffers)
select * from public.player_leg_stats
where player_id = (
  select player_id
  from public.player_leg_stats
  where player_id is not null
  group by player_id
  order by count(*) desc
  limit 1
);

explain (analyze, buffers)
select * from public.matches
where encounter_id = (
  select encounter_id
  from public.matches
  where encounter_id is not null
  limit 1
);
