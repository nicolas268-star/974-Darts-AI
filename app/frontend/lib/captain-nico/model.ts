import type { PlayerOverview } from "@/lib/types/sprint4";
import type { DuoOverview } from "@/lib/duo/types";

export type Pair = [string, string];
export type Lineup = { starters: string[]; reserves: string[]; pairs: [Pair, Pair] };
export type Scenario = { home: Lineup; away: Lineup };
export type ModelInput = {
  players: PlayerOverview[];
  duos: DuoOverview[];
  assumptions: Record<string, number>;
};
export type MatchForecast = {
  number: number;
  home: string[];
  away: string[];
  homeStarts: boolean;
  kind: "single" | "double";
  probability: number | null;
  basis: string;
};
export type Forecast = {
  matches: MatchForecast[];
  expectedHome: number | null;
  expectedSingles: number | null;
  expectedDoubles: number | null;
  homeWin: number | null;
  draw: number | null;
  awayWin: number | null;
  mostLikelyScore: [number, number] | null;
  scoreDistribution: number[] | null;
  missingPlayerIds: string[];
  assumedPlayerIds: string[];
};
export type Simulation = {
  baseline: Forecast;
  candidates: { scenario: Scenario; forecast: Forecast }[];
  evaluated: number;
  missingPlayerIds: string[];
};

// Chronology and first-to-two format verified against the saved J2 Nakka
// schedule in tests/fixtures/interclub_j2_fournaise_ambree.json. First throw
// is displayed, but has no model bonus without observed evidence of its effect.
const SCHEDULE = [
  ["A", "F", true], ["B", "E", false], ["C", "H", true], ["D", "G", false],
  ["A", "E", false], ["B", "F", true], ["C", "G", false], ["D", "H", true],
  ["A1", "E1", true], ["A2", "E2", true], ["A", "G", true], ["C", "E", true],
  ["B", "H", false], ["D", "F", false], ["A", "H", false], ["D", "E", true],
  ["B", "G", true], ["C", "F", false], ["A1", "E2", false], ["A2", "E1", false],
] as const;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function observedRating(player: PlayerOverview): number | null {
  const average = player.average_3_darts;
  if (!finite(average) || average <= 0 || average > 180 ||
      !finite(player.legs_played) || !Number.isInteger(player.legs_played) || player.legs_played <= 0) return null;
  const first9 = player.first_9;
  return finite(first9) && first9 >= 0 && first9 <= 180 ? average * .8 + first9 * .2 : average;
}

/** A missing average is unknown, never zero skill. Assumptions cannot replace observations. */
export function playerRating(player: PlayerOverview, assumptions: Record<string, number>): number | null {
  const observed = observedRating(player);
  if (observed !== null) return observed;
  const manual = Object.hasOwn(assumptions, player.player_id) ? assumptions[player.player_id] : undefined;
  return finite(manual) && manual >= 1 && manual <= 180 ? manual : null;
}

function validateIds(ids: string[], label: string, minimum: number, maximum: number) {
  if (!Array.isArray(ids) || ids.length < minimum || ids.length > maximum ||
      ids.some(id => typeof id !== "string" || !id.trim()) || new Set(ids).size !== ids.length) {
    throw new Error(`${label} : sélectionne ${minimum === maximum ? minimum : `${minimum} à ${maximum}`} joueurs différents.`);
  }
}

/** The three unordered partitions of four players, preserving input order. */
export function pairings(ids: string[]): [Pair, Pair][] {
  validateIds(ids, "Doubles", 4, 4);
  const [a, b, c, d] = ids;
  return [[[a, b], [c, d]], [[a, c], [b, d]], [[a, d], [b, c]]];
}

export function makeLineup(ids: string[], pairingIndex = 0): Lineup {
  validateIds(ids, "Équipe", 4, 6);
  if (!Number.isInteger(pairingIndex) || pairingIndex < 0 || pairingIndex > 2) throw new Error("Répartition de doubles invalide.");
  const starters = ids.slice(0, 4);
  return { starters, reserves: ids.slice(4), pairs: pairings(starters)[pairingIndex] };
}

function playerMap(input: ModelInput) {
  const byId = new Map<string, PlayerOverview>();
  for (const player of input.players) {
    if (!player || typeof player.player_id !== "string" || !player.player_id.trim() || byId.has(player.player_id)) {
      throw new Error("Le catalogue contient une identité de joueur invalide ou en double.");
    }
    byId.set(player.player_id, player);
  }
  return byId;
}

function validateLineup(lineup: Lineup, label: string, byId: Map<string, PlayerOverview>) {
  if (!lineup || !Array.isArray(lineup.starters) || !Array.isArray(lineup.reserves)) throw new Error(`${label} : composition invalide.`);
  validateIds(lineup.starters, label, 4, 4);
  validateIds([...lineup.starters, ...lineup.reserves], label, 4, 6);
  for (const id of [...lineup.starters, ...lineup.reserves]) {
    if (!byId.has(id)) throw new Error(`${label} : un joueur n’est plus disponible. Sélectionne-le à nouveau.`);
  }
  if (!Array.isArray(lineup.pairs) || lineup.pairs.length !== 2 ||
      lineup.pairs.some(pair => !Array.isArray(pair) || pair.length !== 2) ||
      new Set(lineup.pairs.flat()).size !== 4 ||
      lineup.pairs.flat().some(id => !lineup.starters.includes(id))) {
    throw new Error(`${label} : chaque titulaire doit appartenir à une seule paire de doubles.`);
  }
}

function validateScenario(scenario: Scenario, byId: Map<string, PlayerOverview>) {
  validateLineup(scenario?.home, "Votre équipe", byId);
  validateLineup(scenario?.away, "Adversaires", byId);
  const home = new Set([...scenario.home.starters, ...scenario.home.reserves]);
  if ([...scenario.away.starters, ...scenario.away.reserves].some(id => home.has(id))) {
    throw new Error("Un joueur ne peut pas être sélectionné dans les deux équipes.");
  }
}

type Strength = { value: number | null; basis: string };
function singleStrength(id: string, byId: Map<string, PlayerOverview>, input: ModelInput): Strength {
  const player = byId.get(id)!;
  const value = playerRating(player, input.assumptions);
  return { value, basis: value === null ? "Statistiques insuffisantes" : observedRating(player) === null ? "Hypothèse de moyenne saisie" : "Statistiques individuelles observées" };
}

function duoStrength(ids: string[], byId: Map<string, PlayerOverview>, input: ModelInput): Strength {
  const individual = ids.map(id => singleStrength(id, byId, input));
  if (individual.some(item => item.value === null)) return { value: null, basis: "Statistiques individuelles insuffisantes pour ce double" };
  const average = (individual[0].value! + individual[1].value!) / 2;
  const observed = input.duos.filter(duo =>
    duo && new Set([duo.player_1?.id, duo.player_2?.id]).size === 2 &&
    ids.includes(duo.player_1?.id) && ids.includes(duo.player_2?.id) &&
    finite(duo.average_3_darts) && duo.average_3_darts > 0 && duo.average_3_darts <= 180 &&
    finite(duo.legs_played) && Number.isInteger(duo.legs_played) && duo.legs_played > 0,
  ).sort((a, b) => b.legs_played - a.legs_played)[0];
  const assumption = individual.some(item => item.basis === "Hypothèse de moyenne saisie");
  if (!observed) return {
    value: average,
    basis: assumption ? "Approximation individuelle avec hypothèse de moyenne" : "Approximation par les moyennes individuelles ; duo non observé",
  };
  const first9 = observed.first_9;
  const duoRating = finite(first9) && first9 >= 0 && first9 <= 180
    ? observed.average_3_darts! * .8 + first9 * .2 : observed.average_3_darts!;
  const weight = observed.legs_played / (observed.legs_played + 20);
  return {
    value: average * (1 - weight) + duoRating * weight,
    basis: `Statistiques de duo pondérées (${observed.legs_played} legs) et moyennes individuelles${assumption ? " avec hypothèse" : ""}`,
  };
}

// Heuristic leg-level logistic, not a fitted or calibrated probability model.
// Two winning legs (best of three) gives p² + 2p²(1-p), with equal independent
// leg probabilities. No finishing accuracy or first-throw effect is inferred.
function matchProbability(home: number, away: number) {
  const leg = 1 / (1 + Math.exp(-(home - away) / 8));
  return leg * leg * (3 - 2 * leg);
}

function total(matches: MatchForecast[]): number | null {
  return matches.some(match => match.probability === null) ? null : matches.reduce((sum, match) => sum + match.probability!, 0);
}

/** Exact convolution of the assumed independent party probabilities. */
function distribution(probabilities: number[]): number[] {
  let result = [1];
  for (const probability of probabilities) {
    const next = Array<number>(result.length + 1).fill(0);
    result.forEach((mass, wins) => {
      next[wins] += mass * (1 - probability);
      next[wins + 1] += mass * probability;
    });
    result = next;
  }
  return result;
}

export function forecast(scenario: Scenario, input: ModelInput): Forecast {
  const byId = playerMap(input);
  validateScenario(scenario, byId);
  const participants = [...scenario.home.starters, ...scenario.away.starters];
  const missingPlayerIds = participants.filter(id => playerRating(byId.get(id)!, input.assumptions) === null);
  const assumedPlayerIds = participants.filter(id => observedRating(byId.get(id)!) === null && playerRating(byId.get(id)!, input.assumptions) !== null);
  const homePositions: Record<string, string[]> = Object.fromEntries(scenario.home.starters.map((id, index) => [["A", "B", "C", "D"][index], [id]]));
  const awayPositions: Record<string, string[]> = Object.fromEntries(scenario.away.starters.map((id, index) => [["E", "F", "G", "H"][index], [id]]));
  homePositions.A1 = [...scenario.home.pairs[0]]; homePositions.A2 = [...scenario.home.pairs[1]];
  awayPositions.E1 = [...scenario.away.pairs[0]]; awayPositions.E2 = [...scenario.away.pairs[1]];
  const matches = SCHEDULE.map(([homePosition, awayPosition, homeStarts], index): MatchForecast => {
    const home = homePositions[homePosition], away = awayPositions[awayPosition];
    const kind = home.length === 2 ? "double" : "single";
    const left = kind === "double" ? duoStrength(home, byId, input) : singleStrength(home[0], byId, input);
    const right = kind === "double" ? duoStrength(away, byId, input) : singleStrength(away[0], byId, input);
    return {
      number: index + 1, home, away, homeStarts, kind,
      probability: left.value === null || right.value === null ? null : matchProbability(left.value, right.value),
      basis: `${left.basis} / ${right.basis}`,
    };
  });
  const expectedHome = total(matches);
  const scoreDistribution = expectedHome === null ? null : distribution(matches.map(match => match.probability!));
  let mostLikelyScore: [number, number] | null = null;
  if (scoreDistribution) {
    let modal = 0;
    scoreDistribution.forEach((mass, wins) => { if (mass > scoreDistribution[modal]) modal = wins; });
    mostLikelyScore = [modal, 20 - modal];
  }
  return {
    matches, expectedHome,
    expectedSingles: total(matches.filter(match => match.kind === "single")),
    expectedDoubles: total(matches.filter(match => match.kind === "double")),
    homeWin: scoreDistribution ? scoreDistribution.slice(11).reduce((sum, mass) => sum + mass, 0) : null,
    draw: scoreDistribution?.[10] ?? null,
    awayWin: scoreDistribution ? scoreDistribution.slice(0, 10).reduce((sum, mass) => sum + mass, 0) : null,
    mostLikelyScore, scoreDistribution, missingPlayerIds, assumedPlayerIds,
  };
}

function combinations(ids: string[], size: number): string[][] {
  if (size === 0) return [[]];
  return ids.flatMap((id, index) => combinations(ids.slice(index + 1), size - 1).map(rest => [id, ...rest]));
}

/** Choose starters and doubles, never manufacture a gain by permuting singles.
 * All four starters meet all four opponents: the singles total is order-invariant.
 * Every home candidate needs a rating, including reserves, to compare fairly.
 */
export function simulate(homeIds: string[], awayIds: string[], homePairing: number, awayPairing: number, input: ModelInput): Simulation {
  const home = makeLineup(homeIds, homePairing), away = makeLineup(awayIds, awayPairing);
  const baseline = forecast({ home, away }, input);
  const byId = playerMap(input);
  const missingPlayerIds = [...homeIds, ...away.starters].filter(id => playerRating(byId.get(id)!, input.assumptions) === null);
  if (missingPlayerIds.length) return { baseline, candidates: [], evaluated: 0, missingPlayerIds };
  const candidates = combinations(homeIds, 4).flatMap(starters => pairings(starters).map(pairs => {
    const scenario: Scenario = { home: { starters, reserves: homeIds.filter(id => !starters.includes(id)), pairs }, away };
    return { scenario, forecast: forecast(scenario, input) };
  }));
  const rounded = (value: number) => Math.round(value * 1e10) / 1e10;
  candidates.sort((left, right) => rounded(right.forecast.expectedHome!) - rounded(left.forecast.expectedHome!));
  return { baseline, candidates: candidates.slice(0, 3), evaluated: candidates.length, missingPlayerIds: [] };
}
