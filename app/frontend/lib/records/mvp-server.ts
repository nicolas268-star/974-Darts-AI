import type { CompetitionCatalog } from "../types/sprint14";
import { playersForMvpSeason, type MvpSeason, type SeasonPlayer } from "./mvp";
import { playerForStatisticsSeason } from "../statistics-affiliations";

export type MvpSource = { status: "ready" | "awaiting" | "unavailable"; players: SeasonPlayer[]; publishedRounds: number };
const backend = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";

export async function loadMvpCatalog(): Promise<CompetitionCatalog | null> {
  try {
    const response = await fetch(`${backend}/api/v1/competitions`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const data = await response.json();
    return Array.isArray(data?.championships) ? data : null;
  } catch { return null; }
}

export async function loadMvpSeason(season: MvpSeason): Promise<MvpSource> {
  const unavailable: MvpSource = { status: "unavailable", players: [], publishedRounds: 0 };
  const catalog = await loadMvpCatalog();
  if (!catalog) return unavailable;
  const championship = catalog.championships.find(item => item.year === Number(season));
  if (!championship?.id) return { status: "awaiting", players: [], publishedRounds: 0 };
  try {
    // Use the catalog's season UUID, never the active/default season or a career total.
    const response = await fetch(`${backend}/api/v1/players?season_id=${encodeURIComponent(championship.id)}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return unavailable;
    const players = playersForMvpSeason(await response.json(), championship.id);
    return players ? { status: "ready", players: players.map(player => playerForStatisticsSeason(player, season)), publishedRounds: championship.published_rounds } : unavailable;
  } catch { return unavailable; }
}
