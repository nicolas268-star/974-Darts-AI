import type { MatchSnapshot, Side, TeamMetricId, TeamStats } from "./types";

export const DEFAULT_TEAM_METRICS: TeamMetricId[] = ["rank", "average", "points"];
export const TEAM_METRICS: ReadonlyArray<{ id: TeamMetricId; label: string; cardLabel: string; key: keyof TeamStats; decimals: number; signed?: boolean }> = [
  { id: "rank", label: "Classement", cardLabel: "CLASSEMENT", key: "rank", decimals: 0 },
  { id: "average", label: "Moyenne d’équipe (3 fléchettes)", cardLabel: "MOYENNE D’ÉQUIPE", key: "average_3_darts", decimals: 2 },
  { id: "points", label: "Points au classement", cardLabel: "POINTS", key: "points", decimals: 0 },
  { id: "played", label: "Rencontres jouées", cardLabel: "RENCONTRES JOUÉES", key: "played", decimals: 0 },
  { id: "wins", label: "Victoires", cardLabel: "VICTOIRES", key: "wins", decimals: 0 },
  { id: "draws", label: "Matchs nuls", cardLabel: "MATCHS NULS", key: "draws", decimals: 0 },
  { id: "losses", label: "Défaites", cardLabel: "DÉFAITES", key: "losses", decimals: 0 },
  { id: "winRate", label: "Taux de victoires", cardLabel: "VICTOIRES (%)", key: "win_rate", decimals: 1 },
  { id: "setsWon", label: "Sets gagnés", cardLabel: "SETS GAGNÉS", key: "sets_won", decimals: 0 },
  { id: "setsLost", label: "Sets perdus", cardLabel: "SETS PERDUS", key: "sets_lost", decimals: 0 },
  { id: "setDifference", label: "Différence de sets", cardLabel: "DIFFÉRENCE DE SETS", key: "set_difference", decimals: 0, signed: true },
  { id: "legsWon", label: "Legs gagnés", cardLabel: "LEGS GAGNÉS", key: "legs_won", decimals: 0 },
  { id: "legsLost", label: "Legs perdus", cardLabel: "LEGS PERDUS", key: "legs_lost", decimals: 0 },
];
export function teamMetricValue(side: Side, id: TeamMetricId, masked = false): string {
  const metric = TEAM_METRICS.find(item => item.id === id)!;
  const value = masked ? null : side.team_stats?.[metric.key];
  if (typeof value !== "number" || !Number.isFinite(value) || (!metric.signed && value < 0) || (id === "rank" && value < 1) || (id === "average" && !side.team_stats?.average_players)) return "—";
  if (id === "winRate" && value > 100) return "—";
  if ((id === "legsWon" || id === "legsLost") && side.team_stats?.detail_complete === false) return "—";
  const formatted = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: metric.decimals, maximumFractionDigits: metric.decimals }).format(value);
  return id === "rank" ? `#${formatted}` : id === "winRate" ? `${formatted} %` : formatted;
}
export function teamMetricSelection(s: MatchSnapshot): TeamMetricId[] { return s.team_metrics ?? DEFAULT_TEAM_METRICS; }
