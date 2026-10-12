import { BDC_RESULTS, BDC_ROUNDS, bdcPoints, type BdcRoundResult } from "../bdc";
import { bdcSeasonAffiliation } from "../bdc-profile-links";
import roundOne from "../bdc-round-one-details.json";
import roundTwo from "../bdc-round-two.json";
import type { PartnerData, PartnerMatch, PartnerMatchSide, PartnerParticipation, PartnerPlayer, RecordedPlayerStats } from "./types";

export const BDC_PARTNER_SEASON = 2027;
export const canonicalPairKey = (a: string, b: string): string => JSON.stringify([a, b].sort());

type RawPlayer = {
  id?: string; name: string; teamId?: string;
  score?: number | null; darts?: number | null; first9Score?: number | null; first9Darts?: number | null;
  visits100?: number | null; visits140?: number | null; visits170?: number | null; visits180?: number | null;
  zeroVisits?: number | null;
  finishes?: { value: number; darts: number | null; leg: number | null; matchId?: string }[] | null;
};
type RawSide = { teamId: string; name: string; score: number | null; players: RawPlayer[] | null };
type RawMatch = {
  id: string; phase: string; scoreUnit?: string; recordedLegs?: number; officialLegs?: number;
  legs?: number; dataStatus?: string; startedAt?: number; teamA: RawSide; teamB: RawSide;
};
type SourceSelection = { matches: RawMatch[]; playerStats?: RawPlayer[] };
export type PartnerSource = {
  round: number; season: number; sourceFile: string; statisticsStatus: string;
  selection: SourceSelection;
  /** Explicit audited spelling correspondences, never fuzzy or position based. */
  names?: Readonly<Record<string, string>>;
};

/** M2 auditable identity spellings. The local ID is read from audited playerStats. */
const ROUND_TWO_NAMES: Readonly<Record<string, string>> = {
  Yoann: "yoann-kaz", "Stéphane": "abrousse-tdc", "Aléxandre": "alexandre-pdc", "Kévin": "kevin-tdc",
  Vincent: "vincent-tdc", Kozu: "kozu", Benjamin: "benjamin-tdc", Nicolas: "nicolas-pdc",
  Mario: "super-mario-tdc", Guillaume: "guillaume-tdc", Maxime: "maxime-bdc",
  Dominique: "dominique-bdc", Laurent: "laurent-bdc", Coralie: "coralie-bdc",
};

/** Register another audited local selection here; aggregation/UI remain unchanged. */
export const BDC_PARTNER_SOURCES: readonly PartnerSource[] = [
  { round: 1, season: BDC_PARTNER_SEASON, sourceFile: "bdc-round-one-details.json", statisticsStatus: "partial-individual", selection: roundOne as SourceSelection },
  { round: 2, season: BDC_PARTNER_SEASON, sourceFile: "bdc-round-two.json", statisticsStatus: "verified-individual", selection: roundTwo as SourceSelection, names: ROUND_TWO_NAMES },
];

function numeric(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function playerStats(raw: RawPlayer, playerId: string, matchId: string): RecordedPlayerStats {
  return {
    playerId, score: numeric(raw.score), darts: numeric(raw.darts),
    first9Score: numeric(raw.first9Score), first9Darts: numeric(raw.first9Darts),
    visits100: numeric(raw.visits100), visits140: numeric(raw.visits140),
    visits170: numeric(raw.visits170), visits180: numeric(raw.visits180), zeroVisits: numeric(raw.zeroVisits),
    // Public normalized selections preserve counts, but no actual visit or double-attempt denominator.
    visits: null, doubleAttempts: null,
    finishes: raw.finishes == null ? null : raw.finishes.map((finish) => ({
      value: finish.value, darts: numeric(finish.darts), leg: numeric(finish.leg), matchId,
    })),
  };
}

function identities(source: PartnerSource, result: BdcRoundResult): Map<string, string> {
  const mapping = new Map<string, string>();
  if (source.names) {
    for (const row of source.selection.playerStats ?? []) {
      const canonical = source.names[row.name];
      const team = result.teams.find((entry) => entry.id === row.teamId);
      if (!row.id || !canonical || !team?.players.some((player) => player.id === canonical) || mapping.has(row.id)) {
        throw new Error(`Identité BDC M${source.round} non auditée : ${row.name}`);
      }
      mapping.set(row.id, canonical);
    }
  } else {
    for (const team of result.teams) for (const player of team.players) mapping.set(player.name, player.id);
  }
  return mapping;
}

function normalizedSide(raw: RawSide, result: BdcRoundResult, mapping: Map<string, string>, source: PartnerSource, matchId: string): PartnerMatchSide {
  const team = result.teams.find((entry) => entry.id === raw.teamId);
  if (!team) throw new Error(`Doublette BDC M${source.round} inconnue : ${raw.teamId}`);
  const playerIds: [string, string] = [team.players[0].id, team.players[1].id];
  const stats = new Map<string, RecordedPlayerStats>();
  for (const row of raw.players ?? []) {
    const id = mapping.get(source.names ? row.id ?? "" : row.name);
    if (!id || !playerIds.includes(id) || stats.has(id)) throw new Error(`Attribution BDC inconnue ou dupliquée : ${matchId} / ${row.name}`);
    // M2 row IDs originate from per-leg Nakka oid attribution, not the duo title order.
    stats.set(id, playerStats(row, id, matchId));
  }
  return { teamId: team.id, name: raw.name, playerIds, score: numeric(raw.score), players: [stats.get(playerIds[0]) ?? null, stats.get(playerIds[1]) ?? null] };
}

export function normalizeBdcPartnerSources(sources: readonly PartnerSource[] = BDC_PARTNER_SOURCES, results: BdcRoundResult[] = BDC_RESULTS): PartnerData {
  const players = new Map<string, PartnerPlayer>();
  const participations: PartnerParticipation[] = [];
  const matches: PartnerMatch[] = [];
  const rounds: PartnerData["rounds"] = [];
  const seenMatches = new Set<string>();
  const seenRounds = new Set<number>();
  for (const source of sources) {
    const result = results.find((entry) => entry.round === source.round);
    const round = BDC_ROUNDS.find((entry) => entry.number === source.round);
    if (!result || !round?.sourceUrl || seenRounds.has(source.round)) throw new Error(`Source BDC absente ou dupliquée : M${source.round}`);
    seenRounds.add(source.round);
    rounds.push({ number: source.round, date: round.date, season: source.season, sourceUrl: round.sourceUrl });
    const mapping = identities(source, result);
    for (const team of result.teams) {
      for (const player of team.players) {
        const affiliation = bdcSeasonAffiliation(player.id, source.season);
        players.set(player.id, { ...player, club: affiliation?.club ?? null, team: affiliation?.team ?? null });
      }
      const points = team.place === null || team.poolWins === null ? null : bdcPoints(team.place, team.poolWins, result.teamCount);
      participations.push({
        round: source.round, season: source.season, date: round.date, teamId: team.id,
        pairKey: canonicalPairKey(team.players[0].id, team.players[1].id),
        playerIds: [team.players[0].id, team.players[1].id], place: team.place, points,
        pointsStatus: points === null ? "unavailable" : result.provisional ? "provisional" : "validated",
      });
    }
    for (const raw of source.selection.matches) {
      if (seenMatches.has(raw.id)) throw new Error(`Match BDC compté deux fois : ${raw.id}`);
      seenMatches.add(raw.id);
      if (raw.phase !== "Poule" && !["Demi-finale", "3e place", "Finale"].includes(raw.phase)) throw new Error(`Phase BDC inconnue : ${raw.phase}`);
      if (raw.scoreUnit !== undefined && raw.scoreUnit !== "legs" && raw.scoreUnit !== "sets") throw new Error(`Unité de score BDC inconnue : ${raw.scoreUnit}`);
      const teamA = normalizedSide(raw.teamA, result, mapping, source, raw.id);
      const teamB = normalizedSide(raw.teamB, result, mapping, source, raw.id);
      const status = raw.dataStatus ?? source.statisticsStatus;
      const recordedLegs = numeric(raw.recordedLegs ?? raw.legs) ?? 0;
      const officialLegs = numeric(raw.officialLegs ?? raw.legs);
      const allPlayersPresent = [...teamA.players, ...teamB.players].every((row) => row !== null);
      matches.push({
        id: raw.id, round: source.round, season: source.season, date: round.date,
        phase: raw.phase === "Poule" ? "pool" : "finals", phaseLabel: raw.phase,
        startedAt: numeric(raw.startedAt), scoreUnit: raw.scoreUnit === "sets" ? "sets" : "legs",
        recordedLegs, officialLegs,
        // `partial-individual` is a locally complete sheet; the round remains partial.
        statisticsComplete: allPlayersPresent && !status.includes("incomplete") && !status.includes("unavailable") && officialLegs !== null && recordedLegs === officialLegs,
        sourceStatus: status, sourceUrl: round.sourceUrl, sourceFile: source.sourceFile, teamA, teamB,
      });
    }
  }
  return { players: [...players.values()].sort((a, b) => a.name.localeCompare(b.name, "fr")), rounds, matches, participations };
}

let cachedData: PartnerData | undefined;
export function getBdcPartnerData(): PartnerData {
  return cachedData ??= normalizeBdcPartnerSources();
}
