import { seasonYear } from "./season-label";
import { officialPlayerRoster2027 } from "./team-roster";
import { canonicalTeamName } from "./team-identity";
import { TEAM_ROSTERS_2027 } from "./team-rosters-2027";
import type { PlayerOverview } from "./types/sprint4";
import type { CompetitionCatalog } from "./types/sprint14";

export const RECORD_YEARS = [2026, 2027, 2028] as const;
export const PLAYER_YEARS = [2026, 2027, 2028, 2029] as const;
export const firstQueryValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export function selectedStatisticsYear(value: string | string[] | undefined, catalog: CompetitionCatalog | null, years: readonly number[] = RECORD_YEARS) {
  const requested = firstQueryValue(value);
  if (requested && years.map(String).includes(requested)) return requested;
  const active = catalog?.active_championship?.year;
  if (active && years.includes(active)) return String(active);
  const published = catalog?.championships.filter(item => item.has_data && years.includes(item.year)).sort((a,b) => b.year-a.year)[0];
  return String(published?.year ?? (years.includes(new Date().getFullYear()) ? new Date().getFullYear() : years[0]));
}

export function statisticsHref(path: string, year: string | number, extra: Record<string, string | undefined> = {}) {
  const query = new URLSearchParams({ season: String(year) });
  for (const [key, value] of Object.entries(extra)) if (value) query.set(key, value);
  return `${path}?${query}`;
}

export function tournamentRecordYear(record: { season?: string | null; date: string | null }) {
  return seasonYear(record.season) ?? record.date?.match(/^(20\d{2})-\d{2}-\d{2}(?:$|T)/)?.[1] ?? null;
}

export function playersInCurrentTeam(players: PlayerOverview[], team: string | undefined, activeYear: number | undefined) {
  if (!team) return players;
  return players.filter(player => {
    const currentTeam = activeYear === 2027 ? officialPlayerRoster2027(player.name)?.name : undefined;
    return canonicalTeamName(currentTeam ?? player.team) === canonicalTeamName(team);
  });
}

// Exact names and aliases from the published roster only; ambiguous aliases stay unresolved.
export function recordPlayerLookup(players: PlayerOverview[]) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").replace(/[^a-z0-9]/g, "");
  const byId = new Map(players.map(player => [player.player_id, player]));
  const names = new Map<string, Map<string, PlayerOverview>>();
  function add(name: string, player: PlayerOverview) {
    const key = normalize(name), matches = names.get(key) ?? new Map<string, PlayerOverview>();
    matches.set(player.player_id, player); names.set(key, matches);
  }
  for (const player of byId.values()) add(player.name, player);
  for (const roster of TEAM_ROSTERS_2027) for (const member of roster.players) {
    const matches = names.get(normalize(member.officialName));
    if (matches?.size === 1) add(member.nakkaName, [...matches.values()][0]);
  }
  return (record: { canonical_player_id?: string | null; name: string }) => {
    if (record.canonical_player_id && byId.has(record.canonical_player_id)) return byId.get(record.canonical_player_id);
    const matches = names.get(normalize(record.name));
    return matches?.size === 1 ? [...matches.values()][0] : undefined;
  };
}
