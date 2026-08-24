export interface PlayerDNAResponse {
  player: { id: string; name: string; team_id: string | null; team: string | null; club_id: string | null; club: string | null; };
  season: { id: string; name: string; is_active?: boolean; } | null;
  indices: { power: number; consistency: number; finishes: number; progression: number; volume: number; mastery: number; };
  dominance: { score: number; label: string; };
  style: { key: string; label: string; description: string; };
  strengths: string[];
  development_areas: string[];
  heatmap: Array<{ key: string; label: string; value: number; weight: number; }>;
  observed: { average_3_darts: number | null; first_9: number | null; win_rate: number; legs_played: number; best_finish: number | null; progression_delta: number; };
  meta: { contract_version: string; frontend_ready: boolean; index_type: "internal_analytical"; methodology: string; no_invented_data: boolean; nakka_note: string; };
}
