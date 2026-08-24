export type CompetitionSummary = {
  source_rows?: number;
  rounds?: number;
  teams?: number;
  encounters?: number;
  matches?: number;
  legs?: number;
  pool_matches?: number;
  knockout_matches?: number;
  valid_legs?: number;
  players?: number;
  tracked_players?: number;
  tracked_duos?: number;
  complete_results?: number;
};

export type ChampionshipCard = {
  id: string | null;
  slug: string;
  name: string;
  year: number;
  is_active: boolean;
  status: "ACTIVE" | "ARCHIVED" | "AVAILABLE" | "PLANNED";
  rounds: number;
  published_rounds: number;
  has_data: boolean;
  href: string;
};

export type TournamentCard = {
  code: string;
  name: string;
  date: string | null;
  date_label: string | null;
  event_name: string;
  season: string | null;
  status: "AVAILABLE" | "WAITING_DATA";
  summary: CompetitionSummary;
  href: string;
};

export type CompetitionCatalog = {
  contract_version: string;
  title: string;
  active_championship: ChampionshipCard | null;
  championships: ChampionshipCard[];
  tournaments: TournamentCard[];
  principles: {
    official_separation: boolean;
    tournaments_affect_official_ranking: boolean;
    tournaments_affect_official_elo: boolean;
    player_identity_shared: boolean;
  };
};

export type Standing = {
  rank: number;
  team_id: string;
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  sets_won: number;
  sets_lost: number;
  set_difference: number;
  legs_won: number;
  legs_lost: number;
  leg_difference: number;
  points: number;
};

export type PlayerLeader = {
  player_id: string;
  name: string;
  team: string;
  legs_played: number;
  legs_won: number;
  average_3_darts: number | null;
  first_9: number | null;
  best_finish: number | null;
};

export type ChampionshipHub = {
  contract_version: string;
  championship: ChampionshipCard;
  season: { id: string; name: string; is_active: boolean } | null;
  rules: {
    win_points: number;
    draw_points: number;
    loss_points: number;
  } | null;
  summary: CompetitionSummary;
  standings: Standing[];
  leaders: PlayerLeader[];
  schedule: Array<{
    round: string;
    played_on: string;
    home: string;
    away: string;
    nakka_event_id: string;
  }>;
  schedule_source: string | null;
  status_message: string | null;
  ranking_source?: string;
  data_quality_notes?: string[];
};

export type TournamentMatch = {
  id: string;
  match_number: string | number | null;
  encounter: string;
  mode: string;
  home: string;
  away: string;
  home_score: number;
  away_score: number;
  winner: string | null;
  legs: number;
  unresolved_legs: number;
  result_complete: boolean;
  tracked_teams: string[];
  tracked_players: string[];
  source_url: string | null;
  source_tournament_id: string | null;
  phase: "POOL" | "KNOCKOUT" | "UNKNOWN";
  stage_code: string | null;
  stage_index: number | null;
  stage_label: string;
  home_average_3_darts?: number | null;
  away_average_3_darts?: number | null;
};

export type TournamentRoundRobinCell = {
  opponent: string;
  played: boolean;
  score_for: number;
  score_against: number;
  average_3_darts: number | null;
  won: boolean;
  source_url: string | null;
};

export type TournamentRoundRobinStanding = {
  rank: number;
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  legs_for: number;
  legs_against: number;
  leg_difference: number;
  points: number;
  average_3_darts: number | null;
};

export type TournamentRoundRobinGroup = {
  code: string;
  name: string;
  format: "ROUND_ROBIN";
  format_label: string;
  best_of: number;
  first_to: number;
  win_points: number;
  draw_points: number;
  loss_points: number;
  participant_count: number;
  match_count: number;
  expected_match_count: number;
  complete: boolean;
  participants: string[];
  matrix: Array<{
    number: number;
    name: string;
    average_3_darts: number | null;
    rank: number;
    cells: Array<TournamentRoundRobinCell | null>;
  }>;
  standings: TournamentRoundRobinStanding[];
};

export type TournamentStage = {
  code: string;
  name: string;
  order: number;
  matches: TournamentMatch[];
};

export type TournamentParticipant = {
  name: string;
  team?: string;
  teams?: string[];
  players?: string[];
  legs_played: number;
  legs_won: number;
  average_3_darts: number | null;
  best_finish: number | null;
  scores_180: number;
  scores_140: number;
  scores_100: number;
  no_score: number;
};

export type TournamentHub = {
  contract_version: string;
  official_separation: boolean;
  code: string;
  name: string;
  date: string | null;
  date_label: string | null;
  event_name: string;
  season: string | null;
  status: "AVAILABLE" | "WAITING_DATA";
  summary: CompetitionSummary;
  matches: TournamentMatch[];
  pools: TournamentStage[];
  bracket: TournamentStage[];
  round_robin: TournamentRoundRobinGroup[];
  players: TournamentParticipant[];
  duos: TournamentParticipant[];
  data_quality_notes: string[];
};
