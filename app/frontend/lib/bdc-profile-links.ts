import { BDC_RESULTS, BDC_URL } from "./bdc";
import { bdcCanonicalNames, normalizedPlayerName } from "./tournament-records";
import { officialPlayerRoster2027 } from "./team-roster";
import { TEAM_ROSTERS_2027 } from "./team-rosters-2027";

/** Reuse the published BDC aliases. Unmapped participants stay unlinked. */
function canonicalAlias(playerId: string) {
  const player = BDC_RESULTS.flatMap(round => round.teams.flatMap(team => team.players))
    .find(player => player.id === playerId);
  return player ? bdcCanonicalNames[normalizedPlayerName(player.name)] ?? null : null;
}

export function bdcSeasonAffiliation(playerId: string, season: number): { team: string; club: string } | null {
  if (season !== 2027) return null;
  const alias = canonicalAlias(playerId);
  const roster = alias ? officialPlayerRoster2027(alias) : null;
  return roster ? { team: roster.name, club: roster.club } : null;
}

export function bdcPlayerForPublicProfile(name: string): string | null {
  const normalized = normalizedPlayerName(name);
  const members = TEAM_ROSTERS_2027.flatMap(team => team.players).filter(member =>
    [member.officialName, member.nakkaName].some(value => normalizedPlayerName(value) === normalized));
  if (members.length !== 1) return null;
  const alias = normalizedPlayerName(members[0].nakkaName);
  const ids = new Set(BDC_RESULTS.flatMap(round => round.teams.flatMap(team => team.players))
    .filter(player => normalizedPlayerName(canonicalAlias(player.id)) === alias).map(player => player.id));
  return ids.size === 1 ? [...ids][0] : null;
}

export function bdcPartnerHref(playerId?: string) {
  const query = new URLSearchParams({ season: "2027", phase: "pool" });
  if (playerId) query.set("player", playerId);
  return `${BDC_URL}/partenaires?${query}`;
}
