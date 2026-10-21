import { sameTeam } from "@/lib/team-identity";
import { TEAM_ROSTERS_2027, type TeamRoster2027 } from "@/lib/team-rosters-2027";
import type { PlayerOverview } from "@/lib/types/sprint4";

const normalizedName = (name: string) => name.normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function officialPlayerRoster2027(name: string, rosters: TeamRoster2027[] = TEAM_ROSTERS_2027) {
  const normalized = normalizedName(name);
  if (!normalized) return undefined;
  const entries = rosters.flatMap(team => team.players.map(player => ({ team, player })));
  const official = entries.filter(({ player }) => normalizedName(player.officialName) === normalized);
  if (official.length) return official.length === 1 ? official[0].team : undefined;
  // Only exact aliases published in the official roster; never guess from a first name or a substring.
  const aliases = entries.filter(({ player }) => normalizedName(player.nakkaName) === normalized);
  return aliases.length === 1 ? aliases[0].team : undefined;
}

export function officialTeamRoster(teamName: string, year?: number, rosters?: TeamRoster2027[]) {
  return (rosters ?? (year === 2027 ? TEAM_ROSTERS_2027 : []))
    .find((team) => sameTeam(team.name, teamName));
}

export function teamPlayers(players: PlayerOverview[], teamName: string, year?: number, rosters?: TeamRoster2027[]) {
  const official = officialTeamRoster(teamName, year, rosters);
  const names = official && new Set(official.players.map((player) => normalizedName(player.officialName)));
  return players.filter((player) => player.affiliation_source === "ADMIN_REGISTRATION" ? sameTeam(player.team, teamName) : names
    ? names.has(normalizedName(player.name))
    : sameTeam(player.team, teamName));
}
