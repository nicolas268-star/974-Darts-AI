import type { PlayerOverview } from "./types/sprint4";
import type { CompetitionCatalog, ChampionshipHub } from "./types/sprint14";
import { TEAM_ROSTERS_2027 } from "./team-rosters-2027";
import { selectedStatisticsYear } from "./statistics-filters";
import { getTournamentRecords } from "./tournament-records";

const backend = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";
async function read(path: string) {
  try {
    const response = await fetch(`${backend}/api/v1/${path}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

export async function getStatisticsCatalog(): Promise<CompetitionCatalog | null> {
  const data = await read("competitions");
  return Array.isArray(data?.championships) ? data : null;
}

export async function getPlayerIdentities(): Promise<PlayerOverview[]> {
  const data = await read("players");
  return Array.isArray(data?.players) ? data.players : [];
}

export async function getStatisticsPlayers(catalog: CompetitionCatalog | null, year: string): Promise<PlayerOverview[]> {
  const seasonId = catalog?.championships.find(item => item.year === Number(year))?.id;
  if (!seasonId) return [];
  const data = await read(`players?season_id=${encodeURIComponent(seasonId)}`);
  if (!Array.isArray(data?.players) || data.players.some((player: { season_id?: string } | null) => player?.season_id !== seasonId)) return [];
  return data.players;
}

export async function getCurrentChampionshipTeams(catalog: CompetitionCatalog | null): Promise<string[]> {
  const active = catalog?.active_championship;
  if (!active) return [];
  // Same complete official list as /teams, including teams with no published match yet.
  if (active.year === 2027) return TEAM_ROSTERS_2027.map(team => team.name).sort((a,b) => a.localeCompare(b,"fr"));
  const data: ChampionshipHub | null = await read(`competitions/championships/${active.year}`);
  return [...new Set((data?.standings ?? []).map(team => team.name))].sort((a,b) => a.localeCompare(b,"fr"));
}

export async function getRecordSeasonData(requested: string | string[] | undefined) {
  const catalog = await getStatisticsCatalog();
  const season = selectedStatisticsYear(requested, catalog);
  const [players, identities, tournamentRecords] = await Promise.all([getStatisticsPlayers(catalog, season), getPlayerIdentities(), getTournamentRecords(season)]);
  // Season-specific profiles take precedence for team attribution; identity reads add no statistics.
  const knownPlayers = [...new Map([...identities, ...players].map(player => [player.player_id, player])).values()];
  return { season, players, knownPlayers, tournamentRecords };
}
