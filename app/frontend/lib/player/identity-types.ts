export interface PlayerAlias {
  id: string;
  source_player_id: string | null;
  alias_name: string;
  normalized_alias: string;
  source: string;
  confirmed: boolean;
  created_at: string;
}

export interface PlayerMembership {
  id: string;
  team_id: string;
  team: string | null;
  club_id: string | null;
  season_id: string | null;
  season: string | null;
  valid_from: string | null;
  valid_to: string | null;
  is_current: boolean;
  source: string;
  notes: string | null;
}

export interface CareerAggregate {
  legs_played: number;
  legs_won: number;
  win_rate: number;
  average_3_darts: number | null;
  best_finish: number | null;
  scores_180: number;
  scores_140_plus: number;
  scores_100_plus: number;
}

export interface PlayerCareerResponse {
  identity: {
    id: string;
    canonical_player_id: string;
    canonical_display_name: string;
    notes: string | null;
    is_active: boolean;
  };
  aliases: PlayerAlias[];
  memberships: PlayerMembership[];
  career: CareerAggregate;
  by_team: Array<CareerAggregate & {
    team_id: string;
    team: string;
  }>;
  source_player_ids: string[];
  meta: {
    contract_version: string;
    scope: string;
    historical_team_source: string;
    no_historical_rewrite: boolean;
  };
}
