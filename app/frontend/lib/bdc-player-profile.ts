import { bdcPoints, type BdcRoundResult } from "@/lib/bdc";

export const BDC_UNAVAILABLE = "Donnée indisponible – incident Nakka";

export type BdcFinish = {
  leg: number | null;
  value: number;
  darts: number | null;
  matchId?: string;
  validation?: string;
};

export type BdcPlayerMatchStats = {
  name: string;
  score: number;
  darts: number;
  first9Score: number;
  first9Darts: number;
  visits100: number;
  visits140: number;
  visits170: number;
  visits180: number;
  finishes: BdcFinish[];
  average3: number | null;
  first9: number | null;
  bestFinish: number | null;
};

export type BdcMatchSide = {
  teamId: string;
  name: string;
  score: number;
  average3: number;
  recordedDarts: number;
  players: BdcPlayerMatchStats[] | null;
  validatedFinishes?: Array<BdcFinish & { player: string }>;
};

export type BdcRoundMatch = {
  id: string;
  phase: string;
  scoreUnit: string;
  recordedDarts: number;
  dataStatus: string;
  teamA: BdcMatchSide;
  teamB: BdcMatchSide;
};

export type BdcPlayerGlobalStats = BdcPlayerMatchStats & {
  matches: number;
  duoScore: number;
  contribution: number | null;
};

export type BdcRoundDetails = {
  round: number;
  status: string;
  quality: { individualMatches: number; totalMatches: number };
  poolStandings: Array<{
    rank: number;
    teamId: string;
    name: string;
    played: number;
    wins: number;
    losses: number;
    setsDiff: number;
    legsFor: number;
    legsAgainst: number;
    legsDiff: number;
    points: number;
    average3: number;
  }>;
  matches: BdcRoundMatch[];
  playerStats: BdcPlayerGlobalStats[];
};

export type BdcRoundSource = {
  entries: { tpid: string; name: string }[];
  stats: Record<string, {
    score: number;
    darts: number;
    f9Score: number;
    f9Darts: number;
    ton00: number;
    ton40: number;
    ton70: number;
    ton80: number;
    highOut: number;
    match: number;
    winMatch: number;
    leg: number;
    winLeg: number;
  }>;
};

export type BdcPlayerMatchProfile = {
  id: string;
  number: number;
  phase: string;
  opponents: string;
  partner: string;
  result: "Victoire" | "Défaite";
  playerScore: number;
  opponentScore: number;
  scoreUnit: string;
  duoAverage3: number;
  available: boolean;
  contribution: number | null;
  stats: BdcPlayerMatchStats | null;
  validatedFinishes: BdcFinish[];
  zeroVisits: null;
};

export type BdcPlayerRoundProfile = {
  round: number;
  player: { id: string; name: string };
  partner: { id: string; name: string };
  teamId: string;
  teamName: string;
  place: number;
  points: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesCovered: number;
  duoAverage3: number | null;
  summary: BdcPlayerGlobalStats | null;
  zeroVisits: null;
  matches: BdcPlayerMatchProfile[];
};

type BdcValidatedFinishEvent = BdcFinish & {
  teamId: string;
  player: string;
};

// Finishes from the 15 surviving partial sheets. Attribution uses the
// organiser-confirmed, fixed player order inside every duo. The missing legs
// that were entered manually after the incident are deliberately absent.
export const BDC_ROUND_ONE_VALIDATED_FINISHES: BdcValidatedFinishEvent[] = [
  { matchId: "m1-rr_0_r2c7_wAHs", teamId: "wAHs", player: "Fabien (PDC)", leg: 1, value: 10, darts: 1, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_r2c7_wAHs", teamId: "wAHs", player: "Kevin (TDC)", leg: 2, value: 22, darts: 2, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_bGDE_meYa", teamId: "meYa", player: "Super Mario (TDC)", leg: 1, value: 44, darts: 3, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_bGDE_meYa", teamId: "bGDE", player: "Vincent (TDC)", leg: 2, value: 2, darts: 1, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_bGDE_meYa", teamId: "bGDE", player: "Guillaume (TDC)", leg: 3, value: 4, darts: 3, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_Y9AH_kCe9", teamId: "kCe9", player: "Alexandre (PDC)", leg: 1, value: 8, darts: 1, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_Y9AH_kCe9", teamId: "Y9AH", player: "Gary (TDC)", leg: 2, value: 20, darts: 2, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_Y9AH_kCe9", teamId: "kCe9", player: "Abrousse (TDC)", leg: 3, value: 39, darts: 3, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_8Htt_iTep", teamId: "iTep", player: "Nicolas (PDC)", leg: 1, value: 8, darts: 3, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_8Htt_iTep", teamId: "8Htt", player: "Julien (KAZ)", leg: 2, value: 16, darts: 1, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_8Htt_iTep", teamId: "iTep", player: "Nicolas (PDC)", leg: 3, value: 4, darts: 2, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_bGDE_wAHs", teamId: "wAHs", player: "Fabien (PDC)", leg: 1, value: 32, darts: 1, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_bGDE_wAHs", teamId: "bGDE", player: "Vincent (TDC)", leg: 2, value: 8, darts: 1, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_bGDE_wAHs", teamId: "wAHs", player: "Fabien (PDC)", leg: 3, value: 88, darts: 3, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_kCe9_meYa", teamId: "kCe9", player: "Abrousse (TDC)", leg: 1, value: 40, darts: 1, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_kCe9_meYa", teamId: "kCe9", player: "Alexandre (PDC)", leg: 2, value: 39, darts: 2, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_8Htt_r2c7", teamId: "r2c7", player: "Fran (PDC)", leg: 1, value: 40, darts: 3, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_8Htt_r2c7", teamId: "r2c7", player: "Fran (PDC)", leg: 2, value: 75, darts: 2, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_Y9AH_iTep", teamId: "Y9AH", player: "Yoann (KAZ)", leg: 1, value: 10, darts: 2, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_Y9AH_iTep", teamId: "Y9AH", player: "Yoann (KAZ)", leg: 2, value: 16, darts: 1, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_kCe9_wAHs", teamId: "wAHs", player: "Kevin (TDC)", leg: 1, value: 46, darts: 3, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_kCe9_wAHs", teamId: "kCe9", player: "Alexandre (PDC)", leg: 2, value: 6, darts: 3, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_kCe9_wAHs", teamId: "wAHs", player: "Kevin (TDC)", leg: 3, value: 16, darts: 2, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_bGDE_r2c7", teamId: "bGDE", player: "Vincent (TDC)", leg: 1, value: 2, darts: 1, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_bGDE_r2c7", teamId: "bGDE", player: "Vincent (TDC)", leg: 2, value: 9, darts: 2, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_iTep_meYa", teamId: "meYa", player: "Pierre (TDC)", leg: 1, value: 51, darts: 2, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_iTep_meYa", teamId: "meYa", player: "Pierre (TDC)", leg: 2, value: 6, darts: 3, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_8Htt_Y9AH", teamId: "Y9AH", player: "Gary (TDC)", leg: 1, value: 16, darts: 1, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_8Htt_Y9AH", teamId: "8Htt", player: "Julien (KAZ)", leg: 2, value: 40, darts: 2, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_8Htt_Y9AH", teamId: "Y9AH", player: "Gary (TDC)", leg: 3, value: 16, darts: 3, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_bGDE_kCe9", teamId: "bGDE", player: "Guillaume (TDC)", leg: 1, value: 36, darts: 1, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_bGDE_kCe9", teamId: "kCe9", player: "Alexandre (PDC)", leg: 2, value: 16, darts: 3, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_iTep_wAHs", teamId: "iTep", player: "Nicolas (PDC)", leg: 1, value: 10, darts: 2, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_iTep_wAHs", teamId: "wAHs", player: "Kevin (TDC)", leg: 2, value: 56, darts: 2, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_Y9AH_r2c7", teamId: "r2c7", player: "Fran (PDC)", leg: 1, value: 8, darts: 1, validation: "recorded-order-confirmed" },
  { matchId: "m1-rr_0_Y9AH_r2c7", teamId: "Y9AH", player: "Yoann (KAZ)", leg: 2, value: 32, darts: 1, validation: "recorded-order-confirmed" },
];

export function applyBdcRoundOneValidatedFinishes(details: BdcRoundDetails): BdcRoundDetails {
  const eventsForMatch = (matchId: string) =>
    BDC_ROUND_ONE_VALIDATED_FINISHES.filter((finish) => finish.matchId === matchId);

  const matches = details.matches.map((match) => {
    const events = eventsForMatch(match.id);
    const enrichSide = (side: BdcMatchSide): BdcMatchSide => ({
      ...side,
      validatedFinishes: events
        .filter((finish) => finish.teamId === side.teamId)
        .map(({ teamId: _teamId, ...finish }) => finish),
    });
    return { ...match, teamA: enrichSide(match.teamA), teamB: enrichSide(match.teamB) };
  });

  const playerStats = details.playerStats.map((stats) => {
    const additions = BDC_ROUND_ONE_VALIDATED_FINISHES
      .filter((finish) => finish.player === stats.name)
      .map(({ teamId: _teamId, player: _player, ...finish }) => finish)
      .filter((finish) => !stats.finishes.some((current) =>
        current.matchId === finish.matchId && current.leg === finish.leg,
      ));
    const finishes = [...stats.finishes, ...additions];
    return {
      ...stats,
      finishes,
      bestFinish: finishes.length ? Math.max(...finishes.map((finish) => finish.value)) : null,
    };
  });

  return { ...details, matches, playerStats };
}

const average = (score: number, darts: number) =>
  darts > 0 ? Math.round((score * 3 / darts) * 100) / 100 : null;

function orderedMatches(matches: BdcRoundMatch[]) {
  const pools = matches.filter((match) => match.phase === "Poule").reverse();
  const phases = ["Demi-finale", "3e place", "Finale"];
  return [
    ...pools,
    ...phases.flatMap((phase) => matches.filter((match) => match.phase === phase)),
  ];
}

export function buildBdcPlayerRoundProfile(
  playerId: string,
  result: BdcRoundResult,
  details: BdcRoundDetails,
  source: BdcRoundSource,
): BdcPlayerRoundProfile | null {
  const team = result.teams.find((entry) =>
    entry.players.some((player) => player.id === playerId),
  );
  if (!team || team.place === null || team.poolWins === null) return null;

  const player = team.players.find((entry) => entry.id === playerId)!;
  const partner = team.players.find((entry) => entry.id !== playerId)!;
  const teamStats = source.stats[team.id];
  if (!teamStats) return null;

  const relevantMatches = orderedMatches(details.matches).filter((match) =>
    match.teamA.teamId === team.id || match.teamB.teamId === team.id,
  );

  const matches = relevantMatches.map((match, index): BdcPlayerMatchProfile => {
    const playerSide = match.teamA.teamId === team.id ? match.teamA : match.teamB;
    const opponentSide = playerSide === match.teamA ? match.teamB : match.teamA;
    const stats = playerSide.players?.find((entry) => entry.name === player.name) ?? null;
    const validatedFinishes = playerSide.validatedFinishes
      ?.filter((finish) => finish.player === player.name)
      .map(({ player: _player, ...finish }) => finish) ?? [];
    const recordedDuoScore = playerSide.players?.reduce((sum, entry) => sum + entry.score, 0) ?? 0;

    return {
      id: match.id,
      number: index + 1,
      phase: match.phase,
      opponents: opponentSide.name,
      partner: partner.name,
      result: playerSide.score > opponentSide.score ? "Victoire" : "Défaite",
      playerScore: playerSide.score,
      opponentScore: opponentSide.score,
      scoreUnit: match.scoreUnit,
      duoAverage3: playerSide.average3,
      available: stats !== null,
      contribution: stats && recordedDuoScore > 0
        ? Math.round((stats.score / recordedDuoScore) * 1000) / 10
        : null,
      stats,
      validatedFinishes,
      // The available aggregate does not include the score of every visit.
      // Do not infer zero-score visits from darts or total score.
      zeroVisits: null,
    };
  });

  const summary = details.playerStats.find((entry) => entry.name === player.name) ?? null;

  return {
    round: details.round,
    player,
    partner,
    teamId: team.id,
    teamName: source.entries.find((entry) => entry.tpid === team.id)?.name
      ?? team.players.map((entry) => entry.name).join(" / "),
    place: team.place,
    points: bdcPoints(team.place, team.poolWins, result.teamCount),
    matchesPlayed: teamStats.match,
    matchesWon: teamStats.winMatch,
    matchesCovered: matches.filter((match) => match.available).length,
    duoAverage3: average(teamStats.score, teamStats.darts),
    summary,
    zeroVisits: null,
    matches,
  };
}
