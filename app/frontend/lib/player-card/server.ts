import type { PlayerDashboard } from "../player/dashboard-types";
import type { CompetitionCatalog } from "../types/sprint14";
import type { CardPayload } from "./types";
import { adaptDashboard, parseSeason } from "./data";
import { defaultTheme, parseBindings } from "./themes";

export class CardSourceError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function loadCard(playerId: string, requestedSeason?: string): Promise<CardPayload> {
  const season = parseSeason(requestedSeason);
  const backend = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";
  const response = await fetch(`${backend}/api/v1/players/${encodeURIComponent(playerId)}/dashboard${season ? `?season_id=${encodeURIComponent(season)}` : ""}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (response.status === 404) throw new CardSourceError("Joueur introuvable.", 404);
  if (!response.ok) throw new CardSourceError("Statistiques indisponibles. Réessayez.", 503);
  const dashboard: PlayerDashboard = await response.json();
  if (dashboard.player.public_profile !== true) throw new CardSourceError("La carte est réservée aux profils publics.", 403);
  let catalog: CompetitionCatalog | null = null;
  try {
    const r = await fetch(`${backend}/api/v1/competitions`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (r.ok) catalog = await r.json();
  } catch { /* Statistics are usable without the optional catalog. */ }
  const year = dashboard.season?.name.match(/20\d{2}/g)?.at(-1);
  const selectedSeason = season ?? (dashboard.season?.id === "all" ? "all" : year ?? "all");
  const championship = catalog?.championships.find(item => item.id === dashboard.season?.id);
  const seasons = [{ value: "all", label: "Toute la carrière" }, ...["2026", "2027", "2028", "2029"].filter(y => catalog?.championships.some(c => String(c.year) === y && c.has_data) || y === selectedSeason).map(y => ({ value: y, label: `Saison ${y}` }))];
  return { data: adaptDashboard(dashboard, championship?.name ?? null), theme: defaultTheme(dashboard.player.team_id, dashboard.player.club_id, parseBindings(process.env.PLAYER_CARD_THEME_BINDINGS)), seasons, selectedSeason };
}
