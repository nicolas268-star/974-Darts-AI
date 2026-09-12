import { bdcPoints, type BdcRoundResult } from "@/lib/bdc";

export const BDC_UNAVAILABLE = "Donnée indisponible – incident Nakka";

export type BdcFinish = {
  leg: number;
  value: number;
  darts: number;
  matchId?: string;
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
