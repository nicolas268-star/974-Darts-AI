-- A-015 — Index prioritaires sur les relations les plus sollicitées
-- Mesures du 21/09/2026 : 37 FK non couvertes au total.
-- Ce lot couvre 23 FK sur les tables les plus lues et les parcours métier actifs.
-- Les tables concernées font moins de 1 Mo : CREATE INDEX standard limite la
-- complexité et reste compatible avec l'exécution transactionnelle.

create index if not exists idx_player_leg_stats_player_id
  on public.player_leg_stats (player_id);
create index if not exists idx_player_leg_stats_team_id
  on public.player_leg_stats (team_id);
create index if not exists idx_player_leg_stats_import_id
  on public.player_leg_stats (import_id);

create index if not exists idx_legs_match_id
  on public.legs (match_id);
create index if not exists idx_legs_import_id
  on public.legs (import_id);
create index if not exists idx_legs_winner_team_id
  on public.legs (winner_team_id);

create index if not exists idx_matches_encounter_id
  on public.matches (encounter_id);
create index if not exists idx_matches_import_id
  on public.matches (import_id);
create index if not exists idx_matches_team_1_id
  on public.matches (team_1_id);
create index if not exists idx_matches_team_2_id
  on public.matches (team_2_id);
create index if not exists idx_matches_winner_team_id
  on public.matches (winner_team_id);

create index if not exists idx_encounters_round_id
  on public.encounters (round_id);
create index if not exists idx_encounters_home_team_id
  on public.encounters (home_team_id);
create index if not exists idx_encounters_away_team_id
  on public.encounters (away_team_id);
create index if not exists idx_encounters_import_id
  on public.encounters (import_id);

create index if not exists idx_players_team_id
  on public.players (team_id);

create index if not exists idx_player_profiles_season_id
  on public.player_profiles (season_id);

create index if not exists idx_player_team_memberships_season_id
  on public.player_team_memberships (season_id);
create index if not exists idx_player_team_memberships_team_id
  on public.player_team_memberships (team_id);

create index if not exists idx_championship_results_round_id
  on public.championship_results (round_id);
create index if not exists idx_championship_results_home_team_id
  on public.championship_results (home_team_id);
create index if not exists idx_championship_results_away_team_id
  on public.championship_results (away_team_id);

create index if not exists idx_teams_club_id
  on public.teams (club_id);

analyze public.player_leg_stats;
analyze public.legs;
analyze public.matches;
analyze public.encounters;
analyze public.players;
analyze public.player_profiles;
analyze public.player_team_memberships;
analyze public.championship_results;
analyze public.teams;
