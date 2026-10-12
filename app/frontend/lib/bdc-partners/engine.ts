import { canonicalPairKey, getBdcPartnerData } from "./sources";
import type {
  BdcPartnerAnalysis, BdcPartnerFilters, MetricCoverage, PartnerAnalysis, PartnerConclusion,
  PartnerData, PartnerDuoStats, PartnerMatch, PartnerMatchObservation, PartnerObservation,
  PartnerReference, PartnerResult, PartnerStats, RecordedPlayerStats,
} from "./types";

const ratio = (numerator: number | null, denominator: number | null, factor = 1): number | null => {
  if (numerator === null || denominator === null || !Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  const result = factor * numerator / denominator;
  return Number.isFinite(result) ? result : null;
};
export const weightedAverage3 = (score: number | null, darts: number | null): number | null => ratio(score, darts, 3);
type Row = { match: PartnerMatch; stats: RecordedPlayerStats | null; other: RecordedPlayerStats | null };
const scoring = (stats: RecordedPlayerStats | null): stats is RecordedPlayerStats => stats?.score != null && stats.darts != null;
const first9 = (stats: RecordedPlayerStats | null): stats is RecordedPlayerStats => stats?.first9Score != null && stats.first9Darts != null;
const highVisits = (stats: RecordedPlayerStats | null): stats is RecordedPlayerStats =>
  stats !== null && [stats.visits100, stats.visits140, stats.visits170, stats.visits180].every(value => value !== null);
const sum = (rows: Row[], select: (stats: RecordedPlayerStats) => number | null): number | null =>
  rows.length ? rows.reduce((total, row) => total + (select(row.stats!) ?? 0), 0) : null;

function coverage(rows: Row[], include: (row: Row) => boolean): MetricCoverage {
  const covered = rows.filter(include);
  return {
    matches: covered.length, completeMatches: covered.filter(row => row.match.statisticsComplete).length,
    totalMatches: rows.length, recordedLegs: covered.reduce((total, row) => total + row.match.recordedLegs, 0),
    partial: covered.length !== rows.length || covered.some(row => !row.match.statisticsComplete),
    matchIds: covered.map(row => row.match.id), missingMatchIds: rows.filter(row => !include(row)).map(row => row.match.id),
  };
}

function summarizeStats(rows: Row[]): PartnerStats {
  const scoreRows = rows.filter(row => scoring(row.stats));
  const firstRows = rows.filter(row => first9(row.stats));
  const visitRows = rows.filter(row => highVisits(row.stats));
  const finishRows = rows.filter(row => row.stats?.finishes != null);
  const zeroRows = rows.filter(row => row.stats?.zeroVisits != null);
  const commonRows = rows.filter(row => scoring(row.stats) && scoring(row.other));
  const commonFinishes = rows.filter(row => row.stats?.finishes != null && row.other?.finishes != null);
  const completeRows = scoreRows.filter(row => row.match.statisticsComplete && row.stats!.darts! > 0);
  const score = sum(scoreRows, stats => stats.score);
  const darts = sum(scoreRows, stats => stats.darts);
  const first9Score = sum(firstRows, stats => stats.first9Score);
  const first9Darts = sum(firstRows, stats => stats.first9Darts);
  const visits100 = sum(visitRows, stats => stats.visits100);
  const visits140 = sum(visitRows, stats => stats.visits140);
  const visits170 = sum(visitRows, stats => stats.visits170);
  const visits180 = sum(visitRows, stats => stats.visits180);
  const visits100Plus = visits100 === null ? null : visits100 + visits140! + visits170! + visits180!;
  const knownVisitRows = visitRows.filter(row => row.stats!.visits !== null);
  const actualVisitRows = knownVisitRows.filter(row => row.stats!.visits! > 0);
  const visits = sum(knownVisitRows, stats => stats.visits);
  const frequencyVisits = sum(actualVisitRows, stats => stats.visits);
  const frequencyNumerator = actualVisitRows.length ? actualVisitRows.reduce((total, row) => {
    const s = row.stats!; return total + s.visits100! + s.visits140! + s.visits170! + s.visits180!;
  }, 0) : null;
  const finishes = finishRows.flatMap(row => row.stats!.finishes!);
  const finishCount = finishRows.length ? finishes.length : null;
  const checkoutRows = finishRows.filter(row => row.stats!.doubleAttempts !== null && row.stats!.doubleAttempts! > 0);
  const checkoutFinishes = checkoutRows.length ? checkoutRows.reduce((total, row) => total + row.stats!.finishes!.length, 0) : null;
  const completeDarts = sum(completeRows, stats => stats.darts) ?? 0;
  const completeScore = sum(completeRows, stats => stats.score);
  const completeMean = weightedAverage3(completeScore, completeDarts);
  const dispersion = completeRows.length >= 3 && completeMean !== null
    ? Math.sqrt(completeRows.reduce((total, row) => total + row.stats!.darts! * (weightedAverage3(row.stats!.score, row.stats!.darts)! - completeMean) ** 2, 0) / completeDarts)
    : null;
  const commonScore = sum(commonRows, stats => stats.score);
  const commonDarts = sum(commonRows, stats => stats.darts);
  const duoScore = commonRows.length ? commonRows.reduce((total, row) => total + row.stats!.score! + row.other!.score!, 0) : null;
  const duoDarts = commonRows.length ? commonRows.reduce((total, row) => total + row.stats!.darts! + row.other!.darts!, 0) : null;
  const ownFinishCount = commonFinishes.length ? commonFinishes.reduce((total, row) => total + row.stats!.finishes!.length, 0) : null;
  const duoFinishCount = commonFinishes.length ? commonFinishes.reduce((total, row) => total + row.stats!.finishes!.length + row.other!.finishes!.length, 0) : null;
  return {
    score, darts, average3: weightedAverage3(score, darts), first9Score, first9Darts, first9: weightedAverage3(first9Score, first9Darts),
    visits100, visits140, visits170, visits180, visits100Plus, visits, frequency100Plus: ratio(frequencyNumerator, frequencyVisits, 100),
    zeroVisits: sum(zeroRows, stats => stats.zeroVisits), finishCount, finishes,
    bestFinish: finishes.length ? Math.max(...finishes.map(finish => finish.value)) : null,
    checkoutPercent: ratio(checkoutFinishes, sum(checkoutRows, stats => stats.doubleAttempts), 100),
    scoringShare: ratio(commonScore, duoScore, 100), dartsShare: ratio(commonDarts, duoDarts, 100), finishShare: ratio(ownFinishCount, duoFinishCount, 100),
    dispersion: { value: dispersion, matches: completeRows.length, darts: completeDarts },
    coverage: {
      average3: coverage(rows, row => scoring(row.stats)), first9: coverage(rows, row => first9(row.stats)),
      highVisits: coverage(rows, row => highVisits(row.stats)), finishes: coverage(rows, row => row.stats?.finishes != null),
      zeroVisits: coverage(rows, row => row.stats?.zeroVisits != null), contribution: coverage(rows, row => scoring(row.stats) && scoring(row.other)),
      finishShare: coverage(rows, row => row.stats?.finishes != null && row.other?.finishes != null),
      frequency100Plus: coverage(rows, row => highVisits(row.stats) && row.stats.visits !== null && row.stats.visits > 0),
      checkoutPercent: coverage(rows, row => row.stats?.finishes != null && row.stats.doubleAttempts !== null && row.stats.doubleAttempts > 0),
      dispersion: coverage(rows, row => scoring(row.stats) && row.stats.darts! > 0 && row.match.statisticsComplete),
    },
  };
}

function summarizeDuo(rows: Row[]): PartnerDuoStats {
  const common = rows.filter(row => scoring(row.stats) && scoring(row.other));
  const finishRows = rows.filter(row => row.stats?.finishes != null && row.other?.finishes != null);
  const playerScore = sum(common, stats => stats.score);
  const playerDarts = sum(common, stats => stats.darts);
  const partnerScore = common.length ? common.reduce((total, row) => total + row.other!.score!, 0) : null;
  const partnerDarts = common.length ? common.reduce((total, row) => total + row.other!.darts!, 0) : null;
  const score = playerScore === null ? null : playerScore + partnerScore!;
  const darts = playerDarts === null ? null : playerDarts + partnerDarts!;
  const playerFinishes = finishRows.length ? finishRows.reduce((total, row) => total + row.stats!.finishes!.length, 0) : null;
  const partnerFinishes = finishRows.length ? finishRows.reduce((total, row) => total + row.other!.finishes!.length, 0) : null;
  return {
    score, darts, average3: weightedAverage3(score, darts),
    playerScore, partnerScore, playerDarts, partnerDarts,
    playerAverage3: weightedAverage3(playerScore, playerDarts), partnerAverage3: weightedAverage3(partnerScore, partnerDarts),
    finishCount: playerFinishes === null ? null : playerFinishes + partnerFinishes!, playerFinishes, partnerFinishes,
    coverage: coverage(rows, row => scoring(row.stats) && scoring(row.other)),
    finishCoverage: coverage(rows, row => row.stats?.finishes != null && row.other?.finishes != null),
  };
}

function filtered(matches: PartnerMatch[], filters: BdcPartnerFilters): PartnerMatch[] {
  const rounds = new Set(filters.rounds);
  return matches.filter(match => match.season === filters.season && rounds.has(match.round) && (filters.phase === "all" || match.phase === filters.phase));
}

function ownRows(playerId: string, matches: PartnerMatch[], excludedPartnerId?: string): Row[] {
  return matches.flatMap(match => {
    const side = [match.teamA, match.teamB].find(entry => entry.playerIds.includes(playerId));
    if (!side || (excludedPartnerId && side.playerIds.includes(excludedPartnerId))) return [];
    const index = side.playerIds[0] === playerId ? 0 : 1;
    return [{ match, stats: side.players[index], other: side.players[index === 0 ? 1 : 0] }];
  });
}

function reference(playerId: string, partnerId: string, matches: PartnerMatch[], currentAverage: number | null): PartnerReference {
  const rows = ownRows(playerId, matches, partnerId);
  const stats = summarizeStats(rows);
  const partnerIds = [...new Set(rows.flatMap(row => {
    const side = [row.match.teamA, row.match.teamB].find(entry => entry.playerIds.includes(playerId))!;
    return side.playerIds.filter(id => id !== playerId);
  }))].sort();
  return {
    average3: stats.average3, score: stats.score, darts: stats.darts,
    matches: stats.coverage.average3.matches, completeMatches: stats.coverage.average3.completeMatches,
    evenings: new Set(rows.map(row => row.match.date)).size, partnerIds,
    difference: currentAverage !== null && stats.average3 !== null ? currentAverage - stats.average3 : null,
    coverage: stats.coverage.average3,
  };
}

function matchObservations(playerId: string, rows: Row[]): PartnerMatchObservation[] {
  // Dates are known; within a round only true source timestamps establish chronology.
  const ordered = [...rows].sort((a, b) => a.match.date.localeCompare(b.match.date) ||
    (a.match.startedAt !== null && b.match.startedAt !== null ? a.match.startedAt - b.match.startedAt : a.match.id.localeCompare(b.match.id)));
  return ordered.map(row => {
    const own = row.match.teamA.playerIds.includes(playerId) ? row.match.teamA : row.match.teamB;
    const opponent = own === row.match.teamA ? row.match.teamB : row.match.teamA;
    const ownScore = own.score;
    const opponentScore = opponent.score;
    return {
      match: row.match, opponents: opponent.name, ownScore, opponentScore,
      result: ownScore === null || opponentScore === null ? "unknown" : ownScore > opponentScore ? "win" : ownScore < opponentScore ? "loss" : "draw",
      playerStats: row.stats, partnerStats: row.other,
      playerAverage3: weightedAverage3(row.stats?.score ?? null, row.stats?.darts ?? null),
      partnerAverage3: weightedAverage3(row.other?.score ?? null, row.other?.darts ?? null),
      duoAverage3: scoring(row.stats) && scoring(row.other) ? weightedAverage3(row.stats.score! + row.other.score!, row.stats.darts! + row.other.darts!) : null,
    };
  });
}

function results(matches: PartnerMatchObservation[]): PartnerResult {
  const known = matches.filter(row => row.result !== "unknown");
  const legRows = known.filter(row => row.match.scoreUnit === "legs");
  const wins = known.filter(row => row.result === "win").length;
  const legsWon = legRows.length ? legRows.reduce((total, row) => total + row.ownScore!, 0) : null;
  const legsLost = legRows.length ? legRows.reduce((total, row) => total + row.opponentScore!, 0) : null;
  return {
    matches: matches.length, knownMatches: known.length, wins,
    losses: known.filter(row => row.result === "loss").length, draws: known.filter(row => row.result === "draw").length,
    winRate: ratio(wins, known.length, 100), legsWon, legsLost,
    legWinRate: ratio(legsWon, legsWon === null ? null : legsWon + legsLost!, 100),
    legMatches: legRows.length, unknownLegMatches: matches.length - legRows.length,
    legsComparable: matches.length > 0 && legRows.length === matches.length,
  };
}

const format = (value: number): string => value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function partnerObservations(analysis: PartnerAnalysis, matches: PartnerMatch[]): PartnerObservation[] {
  const observations: PartnerObservation[] = [];
  const roundByMatch = new Map(matches.map(match => [match.id, match.round]));
  const add = (text: string, metric: string, matchIds: string[]) => observations.push({
    text, metric, matchIds,
    rounds: [...new Set(matchIds.flatMap(id => roundByMatch.has(id) ? [roundByMatch.get(id)!] : []))].sort((a, b) => a - b),
  });
  const { playerStats: player, partnerStats: partner, duoStats: duo } = analysis;
  if (player.average3 !== null) add(`Avec ${analysis.partner.name}, ta moyenne est de ${format(player.average3)} sur ${player.coverage.average3.matches} matchs enregistrés.`, "player.average3", player.coverage.average3.matchIds);
  if (analysis.playerReference.difference !== null) {
    const difference = analysis.playerReference.difference;
    add(`Ta moyenne est ${difference >= 0 ? "supérieure" : "inférieure"} de ${format(Math.abs(difference))} points avec ce partenaire par rapport à tes autres associations BDC, sur les rencontres observées.`, "playerReference.difference", [...player.coverage.average3.matchIds, ...analysis.playerReference.coverage.matchIds]);
  }
  if (player.first9 !== null && partner.first9 !== null) add(`First 9 individuel enregistré : ${format(player.first9)} pour ${analysis.player.name}, ${format(partner.first9)} pour ${analysis.partner.name}.`, "first9", [...new Set([...player.coverage.first9.matchIds, ...partner.coverage.first9.matchIds])]);
  if (duo.finishCount !== null) add(`${analysis.partner.name} a réalisé ${duo.partnerFinishes} des ${duo.finishCount} finishes enregistrés du duo.`, "duo.finishes", duo.finishCoverage.matchIds);
  if (player.scoringShare !== null && player.dartsShare !== null) add(`Ta part des points marqués est de ${format(player.scoringShare)} %, pour ${format(player.dartsShare)} % des fléchettes enregistrées.`, "player.contribution", player.coverage.contribution.matchIds);
  if (analysis.coverage.partial) add(`Les statistiques couvrent ${analysis.coverage.matches}/${analysis.coverage.totalMatches} matchs, dont ${analysis.coverage.completeMatches} feuilles complètes ; les résultats corrigés restent la référence sportive.`, "coverage", analysis.coverage.matchIds);
  return observations;
}

function conclude(partners: PartnerAnalysis[]): PartnerConclusion[] {
  const titles = { results: "Meilleurs résultats observés", individual: "Mon meilleur rendement individuel", collective: "Meilleur scoring collectif" };
  const legs = partners.every(partner => partner.result.legsComparable);
  const resultMetric = legs ? "legWinRate" : "winRate";
  return (["results", "individual", "collective"] as const).map(criterion => {
    const metric = criterion === "results" ? resultMetric : "average3";
    const values = partners.map(partner => ({ partner, value: criterion === "results" ? partner.result[resultMetric] : criterion === "individual" ? partner.playerStats.average3 : partner.duoStats.average3 }));
    const available = values.filter((entry): entry is { partner: PartnerAnalysis; value: number } => entry.value !== null &&
      (criterion !== "results" || entry.partner.result.knownMatches === entry.partner.result.matches));
    const insufficient = available.length < 2 || available.length !== partners.length;
    const single = partners.length === 1;
    const bestValue = !single && !insufficient ? Math.max(...available.map(entry => entry.value)) : null;
    const winners = bestValue === null ? [] : available.filter(entry => Math.abs(entry.value - bestValue) <= 1e-10).map(entry => entry.partner.partner.id);
    const partial = criterion === "individual" ? partners.some(partner => partner.playerStats.coverage.average3.partial) : criterion === "collective" ? partners.some(partner => partner.duoStats.coverage.partial) : false;
    return {
      criterion, title: titles[criterion], partnerIds: winners, value: bestValue, metric,
      status: single ? "single-partner" : insufficient ? "insufficient" : "available",
      onAvailableData: partial,
      explanation: single ? "Une seule association observée : aucune alternative pour désigner un meilleur partenaire." : insufficient ? "Données insuffisantes pour départager." :
        criterion === "results" ? legs ? "Critère : taux de legs gagnés sur les scores sportifs corrigés." : "Critère : taux de victoires en matchs ; les legs ne sont pas comparables sur toutes les associations (sets ou scores indisponibles)." :
          `Critère : moyenne 3 fléchettes pondérée par les fléchettes${partial ? ", sur les données disponibles" : ""}.`,
    };
  });
}

/** All comparisons use this season/round/phase selection, including other-partner references. */
export function analyzeBdcPartners(playerId: string, filters: BdcPartnerFilters, data: PartnerData = getBdcPartnerData()): BdcPartnerAnalysis {
  const selection = { ...filters, rounds: [...new Set(filters.rounds)].sort((a, b) => a - b) };
  const player = data.players.find(entry => entry.id === playerId) ?? null;
  if (!player) return { player: null, filters: selection, partners: [], conclusions: conclude([]), observations: [], bestObservedPartnerIds: [] };
  const matches = filtered(data.matches, selection);
  const participations = data.participations.filter(entry => entry.season === selection.season && selection.rounds.includes(entry.round) && entry.playerIds.includes(player.id));
  const partnerIds = [...new Set(participations.flatMap(entry => entry.playerIds.filter(id => id !== player.id)))];
  const partners = partnerIds.flatMap(partnerId => {
    const partner = data.players.find(entry => entry.id === partnerId);
    if (!partner) return [];
    const pairKey = canonicalPairKey(player.id, partnerId);
    const roundResults = participations.filter(entry => entry.pairKey === pairKey);
    const pairMatches = matches.filter(match => [match.teamA, match.teamB].some(side => canonicalPairKey(...side.playerIds) === pairKey));
    const rows = ownRows(player.id, pairMatches);
    const observations = matchObservations(player.id, rows);
    const playerStats = summarizeStats(rows);
    const partnerStats = summarizeStats(rows.map(row => ({ ...row, stats: row.other, other: row.stats })));
    const analysis: PartnerAnalysis = {
      pairKey, player, partner, rounds: [...new Set(roundResults.map(entry => entry.round))].sort((a, b) => a - b),
      dates: [...new Set(roundResults.map(entry => entry.date))].sort(), evenings: new Set(roundResults.map(entry => entry.date)).size,
      matches: observations, coverage: coverage(rows, row => scoring(row.stats) && scoring(row.other)),
      result: results(observations), playerStats, partnerStats, duoStats: summarizeDuo(rows),
      playerReference: reference(player.id, partnerId, matches, playerStats.average3),
      partnerReference: reference(partnerId, player.id, matches, partnerStats.average3), roundResults, observations: [],
      chronological: observations.length > 0 && observations.every(row => row.match.startedAt !== null),
    };
    analysis.observations = partnerObservations(analysis, matches);
    return [analysis];
  }).sort((a, b) => a.partner.name.localeCompare(b.partner.name, "fr"));
  const conclusions = conclude(partners);
  const usable = conclusions.filter(conclusion => conclusion.status === "available");
  const bestObservedPartnerIds = usable.length === 3
    ? usable[0].partnerIds.filter(id => usable.every(conclusion => conclusion.partnerIds.includes(id))) : [];
  const observations: PartnerObservation[] = [];
  const ids = partners.flatMap(partner => partner.matches.map(row => row.match.id));
  if (bestObservedPartnerIds.length) observations.push({
    text: `Meilleure association observée à ce stade : ${partners.filter(partner => bestObservedPartnerIds.includes(partner.partner.id)).map(partner => partner.partner.name).join(" et ")}, sur les trois critères disponibles${partners.some(partner => partner.coverage.partial) ? " et les données disponibles" : ""}.`,
    metric: "conclusions", matchIds: ids, rounds: selection.rounds,
  });
  else if (usable.length >= 2 && new Set(usable.flatMap(conclusion => conclusion.partnerIds)).size > 1) observations.push({
    text: "Les critères désignent des associations différentes : aucune paire ne domine toutes les dimensions observées.", metric: "conclusions", matchIds: ids, rounds: selection.rounds,
  });
  else if (partners.length <= 1) observations.push({ text: partners.length ? "Une seule association observée : sa fiche est disponible, sans classement de partenaires." : "Aucune participation dans le périmètre sélectionné.", metric: "participations", matchIds: ids, rounds: selection.rounds });
  else observations.push({ text: "Données insuffisantes pour départager les associations sur tous les critères.", metric: "conclusions", matchIds: ids, rounds: selection.rounds });
  observations.push(...partners.flatMap(partner => partner.observations.slice(0, 1)));
  if (partners.length) observations.push({
    text: `Premières observations — les différences peuvent aussi refléter la forme du jour, les adversaires et le format. Chaque duo est observé sur ${partners.map(partner => `${partner.evenings} soirée${partner.evenings > 1 ? "s" : ""}`).join(" / ")}${partners.some(partner => partner.coverage.partial) ? ", avec une couverture partielle" : ""}.`,
    metric: "context", matchIds: ids, rounds: selection.rounds,
  });
  return { player, filters: selection, partners, conclusions, observations, bestObservedPartnerIds };
}
