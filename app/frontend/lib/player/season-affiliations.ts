import { canonicalTeamName } from "../team-identity";
import { officialPlayerRoster2027 } from "../team-roster";
import { seasonYear } from "../season-label";
import type { PlayerDashboard } from "./dashboard-types";

type Affiliation = { team: string; club: string | null };

// Official 2026 clubs from the championship catalogue. Some legacy team rows have no club_id.
const CLUBS_2026: Record<string, string> = {
  "Kazadarts A": "Kazadarts", "Kazadarts B": "Kazadarts",
  "PDC Fournaise": "Papangue Darts Club", "PDC Neige": "Papangue Darts Club",
  TDC: "Tampon Darts Club", "3BDC": "3 Brasseurs Darts Club",
};

export function playerSeasonAffiliations(player: PlayerDashboard["player"], historical: PlayerDashboard | null) {
  const roster = officialPlayerRoster2027(player.name);
  const current: Affiliation | null = roster ? { team: roster.name, club: roster.club } : null;
  const historicalTeam = historical?.player.team;
  const canonicalTeam = canonicalTeamName(historicalTeam);
  // A dashboard without 2026 data may fall back to the database's current team: do not call it history.
  const previous: Affiliation | null = historical?.player.id === player.id
    && seasonYear(historical.season?.name) === "2026" && historical.meta.has_data === true && historicalTeam
    ? { team: historicalTeam, club: historical.player.club || (Object.hasOwn(CLUBS_2026, canonicalTeam) ? CLUBS_2026[canonicalTeam] : null) }
    : null;
  return { previous, current };
}
