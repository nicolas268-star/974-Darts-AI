export type IdentitySuggestionLevel = "very_high" | "high" | "review" | "low";

export interface IdentitySuggestionPlayer {
  player_id: string;
  display_name: string;
  team_id: string | null;
  team: string | null;
  identity_id: string | null;
}

export interface IdentitySuggestion {
  suggestion_id: string;
  left: IdentitySuggestionPlayer;
  right: IdentitySuggestionPlayer;
  score: number;
  level: IdentitySuggestionLevel;
  label: string;
  reasons: string[];
  already_same_identity: boolean;
  requires_admin_confirmation: true;
}

export interface IdentitySuggestionsResponse {
  suggestions: IdentitySuggestion[];
  meta: {
    contract_version: string;
    engine_type: "deterministic_identity_assistant";
    automatic_merge: false;
    requires_admin_confirmation: true;
    minimum_score: number;
    no_invented_identity: true;
  };
}


export interface CanonicalMergePreview {
  already_same_identity: boolean;
  keep_identity: {
    identity_id: string;
    canonical_player_id: string;
    display_name: string;
    status: string;
  };
  merge_identity: {
    identity_id: string;
    canonical_player_id: string;
    display_name: string;
    status: string;
  };
  impact: {
    aliases_after_merge: number;
    aliases_moved: number;
    duplicate_aliases_removed: number;
    memberships_after_merge: number;
    memberships_moved: number;
    source_player_ids_after_merge: number;
    legs_compiled_after_merge: number;
  };
  non_destructive: boolean;
  statistics_rewritten: false;
  source_identity_archived: boolean;
}
