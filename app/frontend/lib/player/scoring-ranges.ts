export type Scoring120139 = {
  scores_120_139?: number | null;
  scores_120_139_observed?: number | null;
  scores_120_139_coverage?: {
    covered_player_legs: number;
    total_player_legs: number;
    status: "complete" | "partial" | "unavailable";
  };
};

export function scoring120139Description(data: Scoring120139): string {
  const coverage = data.scores_120_139_coverage;
  if (coverage?.status === "partial") {
    return `Couverture partielle : ${data.scores_120_139_observed ?? "—"} volée(s) observée(s) sur ${coverage.covered_player_legs}/${coverage.total_player_legs} participations à un leg. Total de la période indisponible.`;
  }
  if (data.scores_120_139 == null) return "Détail des volées indisponible : aucun total 120–139 ne peut être calculé.";
  return "Volées de 120 à 139 points inclus. Sous-ensemble du compteur Nakka 100–139 affiché 100+ ; ne pas additionner ces deux compteurs.";
}
