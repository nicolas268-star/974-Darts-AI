import type { PlayerDashboard } from "../player/dashboard-types";
import type { CardData } from "./types";

export function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
export function count(value: unknown): number | null {
  const n = finite(value);
  return n !== null && Number.isInteger(n) ? n : null;
}
export function winRate(won: number | null, played: number | null): number | null {
  return count(won) !== null && count(played) !== null && played! > 0 && won! <= played! ? won! / played! * 100 : null;
}
export function formatNumber(value: number | null, decimals = 2): string {
  return finite(value) === null ? "—" : new Intl.NumberFormat("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value!);
}
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words.at(-1)![0] : words[0]?.slice(0, 2) || "?").toLocaleUpperCase("fr-FR");
}
export function adaptDashboard(source: PlayerDashboard, competition: string | null): CardData {
  if (source.player.public_profile !== true) throw new Error("Ce profil n’est pas public.");
  if (!source.player.id || !source.player.name?.trim()) throw new Error("Identité du joueur indisponible.");
  const hasData = source.meta.has_data === true;
  const scoringAvailable = hasData && source.meta.data_quality?.player_stat_rows !== 0;
  return {
    name: source.player.name.trim(), nickname: null, initials: initials(source.player.name),
    club: source.player.club || null, team: source.player.team || null,
    period: source.season?.id === "all" ? "Toute la carrière" : source.season?.name ? `Saison ${source.season.name}` : "Période non renseignée",
    competition, hasData, demonstration: false,
    stats: {
      average: hasData ? finite(source.kpis.average_3_darts) : null,
      finish: hasData ? count(source.kpis.best_finish) : null,
      won: hasData ? count(source.kpis.legs_won) : null, played: hasData ? count(source.kpis.legs_played) : null,
      first9: hasData ? finite(source.kpis.first_9) : null,
      // The profile API does not define a best-average record. Do not substitute a recent-match maximum.
      bestAverage: null,
      scores100: scoringAvailable ? count(source.scoring.scores_100_plus) : null,
      scores140: scoringAvailable ? count(source.scoring.scores_140_plus) : null,
    },
  };
}
export function parseSeason(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (value === "all" || ["2026", "2027", "2028", "2029"].includes(value)) return value;
  throw new Error("Période invalide.");
}
