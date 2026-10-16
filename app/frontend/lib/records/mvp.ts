import type { PlayerOverview } from "../types/sprint4";

export const MINIMUM_LEGS = 20;
export const MVP_WEIGHTS = { scoring: 0.4, results: 0.35, impact: 0.15, finish: 0.1 } as const;
export const MVP_SCORING_WEIGHTS = { average: 0.65, first9: 0.2, highScores: 0.15 } as const;
export const MVP_HIGH_SCORE_WEIGHTS = { scores_100: 1, scores_140: 2, scores_170: 3, scores_180: 4 } as const;
export const MVP_REFERENCES = { average: 70, first9: 80, legs: 100, finish: 170, wilsonZ: 1.96 } as const;
export type MvpSeason = "2026" | "2027" | "2028";
export type SeasonPlayer = PlayerOverview & { season_id: string | null };
export type MvpCalculation = {
  averageIndex: number; first9Index: number; highScoreWeight: number;
  highScoreRate: number; bestHighScoreRate: number; highScoreIndex: number;
  scoringIndex: number; resultsIndex: number; impactIndex: number; finishIndex: number;
  contributions: Record<keyof typeof MVP_WEIGHTS, number>;
  total: number;
};
export type MvpPlayer = PlayerOverview & { score: number; scoringIndex: number; resultsIndex: number; impactIndex: number; finishIndex: number; calculation: MvpCalculation };

function validPerformance(player: PlayerOverview): boolean {
  const legs = player.legs_played, won = player.legs_won;
  return legs != null && Number.isInteger(legs) && legs > 0
    && won != null && Number.isInteger(won) && won >= 0 && won <= legs
    && player.average_3_darts != null && Number.isFinite(player.average_3_darts) && player.average_3_darts >= 0
    && [player.scores_100, player.scores_140, player.scores_170, player.scores_180].every(value => Number.isInteger(value) && value >= 0)
    && (player.first_9 == null || Number.isFinite(player.first_9) && player.first_9 >= 0)
    && (player.best_finish == null || Number.isFinite(player.best_finish) && player.best_finish >= 0);
}

const clamp = (value: number) => Math.min(100, Math.max(0, value));
function weightedHighScores(player: PlayerOverview): number {
  return player.scores_100 * MVP_HIGH_SCORE_WEIGHTS.scores_100
    + player.scores_140 * MVP_HIGH_SCORE_WEIGHTS.scores_140
    + player.scores_170 * MVP_HIGH_SCORE_WEIGHTS.scores_170
    + player.scores_180 * MVP_HIGH_SCORE_WEIGHTS.scores_180;
}
function wilsonLowerBound(wins: number, played: number) {
  if (!played) return 0;
  const z = MVP_REFERENCES.wilsonZ;
  const proportion = wins / played;
  const denominator = 1 + (z * z) / played;
  const centre = proportion + (z * z) / (2 * played);
  const margin =
    z *
    Math.sqrt(
      (proportion * (1 - proportion) + (z * z) / (4 * played)) / played,
    );
  return ((centre - margin) / denominator) * 100;
}

export function buildMvpPlayers(players: PlayerOverview[], minimumLegs = MINIMUM_LEGS): MvpPlayer[] {
  const eligible = players.filter(
    (player) =>
      validPerformance(player) && (player.legs_played ?? 0) >= minimumLegs,
  );
  const highScoreRates = eligible.map((player) => {
    const legs = player.legs_played || 1;
    return (weightedHighScores(player) / legs) * 100;
  });
  const bestHighScoreRate = Math.max(1, ...highScoreRates);

  return eligible
    .map((player) => {
      const legs = player.legs_played || 1;
      const won = player.legs_won || 0;
      const highScoreWeight = weightedHighScores(player);
      const highScoreRate = (highScoreWeight / legs) * 100;
      const highScoreIndex = clamp((highScoreRate / bestHighScoreRate) * 100);
      const averageIndex = clamp(((player.average_3_darts ?? 0) / MVP_REFERENCES.average) * 100);
      const first9Index =
        player.first_9 == null
          ? averageIndex
          : clamp((player.first_9 / MVP_REFERENCES.first9) * 100);
      const scoringIndex = clamp(
        averageIndex * MVP_SCORING_WEIGHTS.average +
          first9Index * MVP_SCORING_WEIGHTS.first9 +
          highScoreIndex * MVP_SCORING_WEIGHTS.highScores,
      );
      const resultsIndex = clamp(wilsonLowerBound(won, legs));
      const impactIndex = clamp((legs / MVP_REFERENCES.legs) * 100);
      const finishIndex = clamp(((player.best_finish ?? 0) / MVP_REFERENCES.finish) * 100);
      const contributions = {
        scoring: scoringIndex * MVP_WEIGHTS.scoring,
        results: resultsIndex * MVP_WEIGHTS.results,
        impact: impactIndex * MVP_WEIGHTS.impact,
        finish: finishIndex * MVP_WEIGHTS.finish,
      };
      const total = contributions.scoring + contributions.results + contributions.impact + contributions.finish;
      const score = Math.round(total);
      return {
        ...player,
        score,
        scoringIndex: Math.round(scoringIndex),
        resultsIndex: Math.round(resultsIndex),
        impactIndex: Math.round(impactIndex),
        finishIndex: Math.round(finishIndex),
        calculation: {
          averageIndex, first9Index, highScoreWeight, highScoreRate, bestHighScoreRate, highScoreIndex,
          scoringIndex, resultsIndex, impactIndex, finishIndex, contributions, total,
        },
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.resultsIndex - left.resultsIndex ||
        (right.average_3_darts ?? 0) - (left.average_3_darts ?? 0) ||
        left.name.localeCompare(right.name, "fr"),
    );
}

export function mvpStanding(players: PlayerOverview[]) {
  const confirmed = buildMvpPlayers(players);
  const displayed = confirmed.length ? confirmed : buildMvpPlayers(players, 1);
  return {
    confirmed,
    displayed,
    provisional: confirmed.length === 0 && displayed.length > 0,
    developing: players.filter(player => (player.legs_played ?? 0) > 0 && (player.legs_played ?? 0) < MINIMUM_LEGS),
    observed: players.filter(player => (player.legs_played ?? 0) > 0).length,
  };
}

// A response for another season must never populate this season's MVP.
export function playersForMvpSeason(payload: unknown, seasonId: string): SeasonPlayer[] | null {
  if (!payload || typeof payload !== "object" || !("players" in payload) || !Array.isArray(payload.players)) return null;
  if (payload.players.some(player => !player || typeof player !== "object" || player.season_id !== seasonId)) return null;
  return payload.players as SeasonPlayer[];
}
