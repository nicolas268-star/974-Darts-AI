export type RelationshipTier =
  | "elite"
  | "excellent"
  | "good"
  | "average"
  | "poor"
  | "unconfirmed";

export type RelationshipColor =
  | "gold"
  | "green"
  | "lime"
  | "orange"
  | "red"
  | "slate";

export type SampleStatus = "reliable" | "limited" | "very_limited";

export interface PlayerRelationship {
  player_id: string;
  name: string;
  team_id: string | null;
  team: string | null;
  club_id: string | null;
  club: string | null;
  relation_type: "partner" | "opponent";
  matches_played: number;
  legs_played: number;
  legs_won: number;
  legs_lost: number;
  win_rate: number;
  wilson_lower_bound: number;
  player_average_3_darts: number | null;
  related_player_average_3_darts: number | null;
  relationship_index: number;
  badge: string;
  tier: RelationshipTier;
  color: RelationshipColor;
  percentile: number;
  sample_status: SampleStatus;
  rank: number;
}

export interface PlayerNetworkResponse {
  player: {
    id: string;
    name: string;
    team_id: string | null;
    team: string | null;
    club_id: string | null;
    club: string | null;
  };
  season: {
    id: string;
    name: string;
    is_active?: boolean;
  } | null;
  partners: PlayerRelationship[];
  opponents: PlayerRelationship[];
  best_partners: PlayerRelationship[];
  worst_partners: PlayerRelationship[];
  favorite_opponents: PlayerRelationship[];
  toughest_opponents: PlayerRelationship[];
  highlights: {
    best_partner: PlayerRelationship | null;
    difficult_partner: PlayerRelationship | null;
    favorite_opponent: PlayerRelationship | null;
    toughest_opponent: PlayerRelationship | null;
  };
  meta: {
    contract_version: string;
    frontend_ready: boolean;
    partner_count: number;
    opponent_count: number;
    has_partner_data: boolean;
    has_opponent_data: boolean;
    nakka_note: string;
  };
}
