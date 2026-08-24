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
  win_rate: number;
  detailed_encounters: number;
  collective_only_encounters: number;
  detail_complete: boolean;
};

export type RankingPayload = {
  season: {
    id: string;
    name: string;
    is_active: boolean;
  } | null;
  rules: {
    win_points: number;
    draw_points: number;
    loss_points: number;
    ranking_order?: string[];
  };
  standings: Standing[];
  summary: {
    rounds?: number;
    teams?: number;
    encounters?: number;
    official_results?: number;
    collective_only_encounters?: number;
    score_warnings?: number;
    valid_legs?: number;
    detailed_leg_wins?: number;
  };
  data_quality_notes: string[];
  ranking_source: "CALENDRIER_SCORE" | "PVP_FALLBACK" | "NONE";
};

export type PlayerOverview = {
  player_id: string;
  name: string;
  team: string;
  legs_played: number | null;
  legs_won: number | null;
  average_3_darts: number | null;
  win_rate: number | null;
  first_9: number | null;
  best_finish: number | null;
  elo: number | null;
  scores_180: number;
  scores_170: number;
  scores_140: number;
  scores_100: number;
  finishes: number;
  nakka_note: string;
};
