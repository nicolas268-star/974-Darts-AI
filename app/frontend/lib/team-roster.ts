import { sameTeam } from "@/lib/team-identity";
import { TEAM_ROSTERS_2027 } from "@/lib/team-rosters-2027";
import type { PlayerOverview } from "@/lib/types/sprint4";

const normalizedName = (name: string) => name.normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function officialTeamRoster(teamName: string, year?: number) {
  return year === 2027
    ? TEAM_ROSTERS_2027.find((team) => sameTeam(team.name, teamName))
    : undefined;
}

export function teamPlayers(players: PlayerOverview[], teamName: string, year?: number) {
  const official = officialTeamRoster(teamName, year);
  const names = official && new Set(official.players.map((player) => normalizedName(player.officialName)));
  return players.filter((player) => names
    ? names.has(normalizedName(player.name))
    : sameTeam(player.team, teamName));
}
