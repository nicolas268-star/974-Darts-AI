export type PlayerDashboard = {
  player: {
    id: string;
    name: string;
    public_profile: boolean;
    team_id: string | null;
    team: string | null;
    club_id: string | null;
    club: string | null;
  };
  season: { id: string; name: string; is_active: boolean } | null;
  affiliations?: {
    current: { club?: string | null; team?: string | null; start_date?: string | null };
    upcoming: Array<{ club?: string | null; team?: string | null; effective_date: string }>;
    history: Array<{ club?: string | null; team?: string | null; start_date?: string | null; end_date?: string | null }>;
    has_history: boolean;
  };
  kpis: {
    legs_played: number;
    legs_won: number;
    win_rate: number;
    average_3_darts: number | null;
    first_9: number | null;
    best_finish: number | null;
    average_finish: number | null;
  };
  scoring: {
    scores_80_plus: number;
    scores_100_plus: number;
    scores_140_plus: number;
    scores_170_plus: number;
    scores_180: number;
    no_score: number;
  };
  trends: Array<{
    round_id: string;
    round: string;
    played_on: string | null;
    legs_played: number;
    legs_won: number;
    win_rate: number;
    average_3_darts: number | null;
    first_9: number | null;
    best_finish: number | null;
    average_finish: number | null;
    scores_100_plus: number;
    scores_140_plus: number;
    scores_180: number;
  }>;
  recent_matches: Array<{
    match_id: string;
    round: string;
    played_on: string | null;
    encounter: string;
    match_number: number | null;
    nakka_match_number: number | null;
    mode: string | null;
    opponent_team_id: string | null;
    opponent_team: string | null;
    opponent_names: string | null;
    legs_played: number;
    legs_won: number;
    win_rate: number;
    average_3_darts: number | null;
    first_9: number | null;
    best_finish: number | null;
    average_finish: number | null;
    scores_100_plus: number;
    scores_140_plus: number;
    scores_180: number;
  }>;
  elo: { available: boolean; value: number | null; history: unknown[] };
  meta: {
    has_data: boolean;
    nakka_note: string;
    scope?: Record<string, unknown>;
    data_quality?: Record<string, unknown>;
  };
};
