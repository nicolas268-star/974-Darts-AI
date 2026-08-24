export type TeamMatchHistoryRow = {
  result_id: string;
  encounter_id: string | null;
  round_id: string;
  round_code: string;
  played_on: string | null;
  date_source: "NAKKA_OFFICIAL" | "DATABASE" | "UNCONFIRMED";
  nakka_event_id: string | null;
  venue: "HOME" | "AWAY";
  team_id: string;
  team_name: string;
  opponent_id: string;
  opponent_name: string;
  home_team_id: string;
  home_team_name: string;
  away_team_id: string;
  away_team_name: string;
  home_score: number;
  away_score: number;
  score_for: number;
  score_against: number;
  outcome: "WIN" | "DRAW" | "LOSS";
  detail_status: "DETAILED" | "COLLECTIVE_ONLY";
  detail_available: boolean;
  quality_status: "VERIFIED" | "CHECK";
  quality_note: string | null;
  hub_path: string;
};

export type TeamMatchHistory = {
  season: {
    id: string;
    name: string;
    is_active: boolean;
  } | null;
  team: {
    id: string;
    name: string;
  } | null;
  matches: TeamMatchHistoryRow[];
  summary: {
    played: number;
    wins: number;
    draws: number;
    losses: number;
    detailed: number;
    collective_only: number;
  };
  data_quality_notes: string[];
  source: "CALENDRIER_SCORE";
};

export type MatchHubPlayer = {
  player_id: string;
  name: string;
};

export type MatchHubLeg = {
  leg_id: string;
  match_id: string;
  match_number: number | null;
  mode: "SIMPLE" | "DOUBLE";
  leg_number: number | null;
  winner_team_id: string | null;
  winner_team_name: string;
  loser_team_id: string | null;
  loser_team_name: string;
  finisher_id: string | null;
  finisher_name: string;
  opponent_names: string;
  finish: number | null;
  darts: number | null;
  no_score: number;
  opponent_remaining: number | null;
};

export type MatchHubSingle = {
  player_id: string;
  name: string;
  matches_played: number;
  matches_won: number;
  match_win_rate: number;
  legs_played: number;
  legs_won: number;
  leg_win_rate: number;
  finishes: number;
  no_score: number;
  average_3_darts: number | null;
  first_9: number | null;
  best_leg: number | null;
};

export type MatchHubDouble = MatchHubLeg & {
  winning_duo: string;
  losing_duo: string;
};

export type MatchHubPayload = {
  result: {
    id: string;
    season_id: string;
    round_id: string;
    round_code: string;
    played_on: string | null;
    date_source: "NAKKA_OFFICIAL" | "DATABASE" | "UNCONFIRMED";
    nakka_event_id: string | null;
    home_team_id: string;
    home_team_name: string;
    away_team_id: string;
    away_team_name: string;
    home_score: number;
    away_score: number;
    detail_status: "DETAILED" | "COLLECTIVE_ONLY";
    quality_status: "VERIFIED" | "CHECK";
    quality_note: string | null;
  };
  season: {
    id: string;
    name: string;
    is_active: boolean;
  } | null;
  detail_available: boolean;
  singles: MatchHubSingle[];
  doubles: MatchHubDouble[];
  legs: MatchHubLeg[];
  summary: {
    matches: number;
    singles: number;
    doubles: number;
    legs_analysed: number;
    finishes_recorded: number;
    finish_coverage: number;
    best_leg: number | null;
    no_score: number;
    average_finish: number | null;
    average_opponent_remaining: number | null;
    home_average_3_darts: number | null;
    away_average_3_darts: number | null;
    home_matches_won: number;
    away_matches_won: number;
  };
  finish_pressure: Array<{
    label: string;
    count: number;
  }>;
  highlights: {
    top_player: MatchHubSingle | null;
    best_leg: number | null;
    average_opponent_remaining: number | null;
  };
  data_quality_notes: string[];
};
