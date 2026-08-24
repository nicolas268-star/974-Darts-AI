export type DuoPlayer = {
  id: string;
  name: string;
  team_id: string | null;
  team: string | null;
};

export type DuoContribution = {
  player: DuoPlayer;
  score: number;
  scoring_share: number;
  average_3_darts: number | null;
  first_9: number | null;
  finishes: number;
  best_finish: number | null;
  scores_80_plus: number;
  scores_100_plus: number;
  scores_140_plus: number;
  scores_170_plus: number;
  scores_180: number;
};

export type DuoOverview = {
  duo_id: string;
  player_1: DuoPlayer;
  player_2: DuoPlayer;
  team_id: string | null;
  team: string | null;
  matches_played: number;
  legs_played: number;
  legs_won: number;
  win_rate: number;
  average_3_darts: number | null;
  first_9: number | null;
  score: number;
  finishes: number;
  best_finish: number | null;
  scores_80_plus: number;
  scores_100_plus: number;
  scores_140_plus: number;
  scores_170_plus: number;
  scores_180: number;
  contributions: DuoContribution[];
  rank?: number;
};

export type DuoTrend = Omit<DuoOverview, "duo_id" | "player_1" | "player_2" | "team_id" | "team" | "rank"> & {
  round_id: string;
  round: string | null;
  played_on: string | null;
};

export type DuoMatch = Omit<DuoOverview, "duo_id" | "player_1" | "player_2" | "team_id" | "team" | "rank"> & {
  match_id: string;
  round_id: string;
  round: string | null;
  played_on: string | null;
  encounter: string | null;
  match_number: number | null;
  nakka_match_number: number | null;
  mode: string | null;
  opponent_team_id: string | null;
  opponent_team: string | null;
  opponent_player_1: DuoPlayer | null;
  opponent_player_2: DuoPlayer | null;
  opponent_duo_id: string | null;
  opponent_wilson_score: number;
  opponent_difficulty_stars: number;
  opponent_difficulty_label: string;
  opponent_matches_played: number;
  opponent_legs_played: number;
  opponent_win_rate: number;
  result: "win" | "draw" | "loss";
  performance_label: string;
  prestige_points: number;
};

export type DuoApiResponse = {
  season: { id: string; name: string; is_active: boolean } | null;
  duos: DuoOverview[];
  meta?: { count?: number; nakka_note?: string };
};

export type DuoDashboardResponse = {
  season: { id: string; name: string; is_active: boolean } | null;
  duo: DuoOverview;
  trends: DuoTrend[];
  recent_matches: DuoMatch[];
  meta: {
    has_data: boolean;
    nakka_note: string;
    duo_detection?: string;
    scope?: unknown;
  };
};
