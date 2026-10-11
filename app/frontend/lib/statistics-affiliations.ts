import { canonicalTeamName } from "./team-identity";
import { officialPlayerRoster2027 } from "./team-roster";
import type { PlayerOverview } from "./types/sprint4";

export function playerForStatisticsSeason<T extends PlayerOverview>(player: T, year: string): T {
  // The published roster also covers registered players with tournament results
  // but no championship match yet. It belongs to 2027 only.
  const roster = year === "2027" ? officialPlayerRoster2027(player.name) : undefined;
  // An overview includes identities with zero season legs and may then return
  // their global, older team. That is not evidence of an affiliation this year.
  const playedTeam = (player.legs_played ?? 0) > 0 ? player.team : undefined;
  return { ...player, team: canonicalTeamName(roster?.name ?? playedTeam) };
}
