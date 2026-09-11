/** BDC Saison 1: rules published by Tampon Darts Club on AssoConnect.
 * Championship points belong to each player; they are never divided by two.
 * Nakka access and result import are deliberately pending the authorised draw.
 */
export const BDC_URL = "/tournaments/blind-draw-championship";
export const BDC_RULES_URL = "https://tampon-darts-club.assoconnect.com/collect/description/706462-n-blind-draw-championship-by-tdc-saison-1";
export const BDC_ROUNDS = [
  { number: 1, date: "2026-09-11", location: "Bar Le Cham’Ô · Le Tampon", sourceUrl: "https://n01darts.com/n01/league/season.php?id=t_iIQi_5560" },
  { number: 2, date: "2026-10-09", location: "Lieu à confirmer", sourceUrl: null },
  { number: 3, date: "2026-11-06", location: "Lieu à confirmer", sourceUrl: null },
  { number: 4, date: "2026-12-11", location: "Lieu à confirmer", sourceUrl: null },
  { number: 5, date: "2027-01-08", location: "Lieu à confirmer", sourceUrl: null },
  { number: 6, date: "2027-02-05", location: "Lieu à confirmer", sourceUrl: null },
] as const;

export type BdcPlayer = { id: string; name: string };
export type BdcRoundResult = {
  round: number;
  teamCount: 8 | 12;
  /** Keep stable player IDs across rounds, even when their partners change. */
  teams: {
    id: string;
    players: [BdcPlayer, BdcPlayer];
    /** Null means not yet validated, never zero points. */
    place: number | null;
    poolWins: number | null;
  }[];
};

// No fabricated entrants, pairings or results before the draw.
export const BDC_RESULTS: BdcRoundResult[] = [];

export function bdcPoints(place: number, poolWins: number, teamCount: 8 | 12): number {
  if (![8, 12].includes(teamCount) || !Number.isInteger(place) || place < 1 || place > teamCount || !Number.isInteger(poolWins) || poolWins < 0) {
    throw new Error("Résultat BDC invalide");
  }
  const base = place === 1 ? 8 : place === 2 ? 6 : place === 3 ? 5 : place === 4 ? 4 : place <= 8 ? 2 : 1;
  return base + Math.min(poolWins, 3);
}

export function bdcStandings(results: BdcRoundResult[]) {
  const players = new Map<string, { id: string; name: string; points: (number | null)[]; participations: number; total: number; pending: boolean }>();
  const seenRounds = new Set<number>();
  for (const result of results) {
    if (!Number.isInteger(result.round) || result.round < 1 || result.round > 6 || seenRounds.has(result.round) || ![8, 12].includes(result.teamCount) || result.teams.length > result.teamCount) {
      throw new Error("Manche BDC invalide ou dupliquée");
    }
    seenRounds.add(result.round);
    const seenPlayers = new Set<string>();
    const seenTeams = new Set<string>();
    for (const team of result.teams) {
      if (!team.id || seenTeams.has(team.id) || team.players.length !== 2) throw new Error("Doublette BDC invalide");
      seenTeams.add(team.id);
      const points = team.place === null || team.poolWins === null ? null : bdcPoints(team.place, team.poolWins, result.teamCount);
      for (const player of team.players) {
        if (!player.id.trim() || !player.name.trim() || seenPlayers.has(player.id)) throw new Error("Joueur BDC invalide ou présent dans deux doublettes");
        seenPlayers.add(player.id);
        const row = players.get(player.id) ?? { ...player, points: Array<number | null>(6).fill(null), participations: 0, total: 0, pending: false };
        row.points[result.round - 1] = points;
        row.participations += 1;
        row.total += points ?? 0;
        row.pending ||= points === null;
        players.set(player.id, row);
      }
    }
  }
  const sorted = [...players.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "fr"));
  return sorted.map((row) => ({
    ...row,
    // Equal totals stay tied; do not invent an official tie-break or qualification.
    rank: 1 + sorted.filter((other) => other.total > row.total).length,
    eligible: row.participations >= 3,
  }));
}

export function bdcCalendarRound(title: string, date: string) {
  if (!title.toLowerCase().includes("blind draw championship")) return undefined;
  return BDC_ROUNDS.find((round) => round.date === date);
}

export function bdcDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Indian/Reunion" }).format(new Date(`${date}T12:00:00+04:00`));
}
