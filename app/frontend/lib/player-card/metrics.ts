import type { CardFormat, CardMetricId, CardStats } from "./types";
import { formatNumber, winRate } from "./data";

export const MAX_CARD_METRICS = 12;
export const DEFAULT_CARD_METRICS: CardMetricId[] = ["average", "finish", "winRate", "first9", "bestAverage", "scores100", "scores140"];
export const CARD_METRICS: ReadonlyArray<{ id: CardMetricId; label: string; cardLabel: string; decimals: number }> = [
  { id: "average", label: "Moyenne 3 fléchettes", cardLabel: "MOYENNE 3 FLÉCHETTES", decimals: 2 },
  { id: "finish", label: "Meilleur finish", cardLabel: "MEILLEUR FINISH", decimals: 0 },
  { id: "winRate", label: "Taux de legs gagnés", cardLabel: "LEGS GAGNÉS (%)", decimals: 1 },
  { id: "won", label: "Legs gagnés", cardLabel: "LEGS GAGNÉS", decimals: 0 },
  { id: "played", label: "Legs joués", cardLabel: "LEGS JOUÉS", decimals: 0 },
  { id: "first9", label: "First 9", cardLabel: "FIRST 9", decimals: 2 },
  { id: "bestAverage", label: "Meilleure moyenne", cardLabel: "MEILLEURE MOYENNE", decimals: 2 },
  { id: "averageFinish", label: "Finish moyen", cardLabel: "FINISH MOYEN", decimals: 2 },
  { id: "scores100", label: "Scores 100+", cardLabel: "100+", decimals: 0 },
  { id: "scores140", label: "Scores 140+", cardLabel: "140+", decimals: 0 },
  { id: "scores180", label: "Scores 180", cardLabel: "180", decimals: 0 },
  { id: "scores170", label: "Scores 170+", cardLabel: "170+", decimals: 0 },
  { id: "scores80", label: "Scores 80+", cardLabel: "80+", decimals: 0 },
  { id: "noScore", label: "Volées sans score", cardLabel: "SANS SCORE", decimals: 0 },
];

export function selectedMetrics(ids?: readonly string[]): CardMetricId[] {
  const selection = new Set(ids ?? DEFAULT_CARD_METRICS);
  return CARD_METRICS.filter(metric => selection.has(metric.id)).slice(0, MAX_CARD_METRICS).map(metric => metric.id);
}
export function metricValue(id: CardMetricId, stats: CardStats): string {
  const metric = CARD_METRICS.find(item => item.id === id)!;
  const value = id === "winRate" ? winRate(stats.won, stats.played) : stats[id] ?? null;
  return formatNumber(value, metric.decimals) + (id === "winRate" && value !== null ? " %" : "");
}

// The same measured cells drive the canvas and the layout validation.
export function metricCells(ids: readonly CardMetricId[], format: CardFormat) {
  const y = format === "story" ? 1120 : 777;
  const rows = ids.length <= 3 ? 1 : ids.length <= 8 ? 2 : 3;
  const perRow = Math.ceil(ids.length / rows), gap = 16;
  const height = rows === 1 ? 340 : rows === 2 ? 168 : 112;
  return ids.map((id, index) => {
    const row = Math.floor(index / perRow), column = index % perRow;
    const rowCount = Math.min(perRow, ids.length - row * perRow);
    const width = (952 - gap * (rowCount - 1)) / rowCount;
    return { id, x: 64 + (width + gap) * column, y: y + (height + gap) * row, width, height, compact: rows === 3 };
  });
}
