-- Retour arrière A-015 — suppression du seul lot d'index ajouté.

drop index if exists public.idx_player_leg_stats_player_id;
drop index if exists public.idx_player_leg_stats_team_id;
drop index if exists public.idx_player_leg_stats_import_id;
drop index if exists public.idx_legs_match_id;
drop index if exists public.idx_legs_import_id;
drop index if exists public.idx_legs_winner_team_id;
drop index if exists public.idx_matches_encounter_id;
drop index if exists public.idx_matches_import_id;
drop index if exists public.idx_matches_team_1_id;
drop index if exists public.idx_matches_team_2_id;
drop index if exists public.idx_matches_winner_team_id;
drop index if exists public.idx_encounters_round_id;
drop index if exists public.idx_encounters_home_team_id;
drop index if exists public.idx_encounters_away_team_id;
drop index if exists public.idx_encounters_import_id;
drop index if exists public.idx_players_team_id;
drop index if exists public.idx_player_profiles_season_id;
drop index if exists public.idx_player_team_memberships_season_id;
drop index if exists public.idx_player_team_memberships_team_id;
drop index if exists public.idx_championship_results_round_id;
drop index if exists public.idx_championship_results_home_team_id;
drop index if exists public.idx_championship_results_away_team_id;
drop index if exists public.idx_teams_club_id;
