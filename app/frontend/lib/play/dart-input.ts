import { makeDart, type DartThrow } from "../x01/engine";

/** Bare 1–20 values are segments; S/D/T may also be typed on a keyboard. */
export function parseDartInput(raw: string, multiplier: 1 | 2 | 3 = 1): DartThrow | null {
  const text = raw.trim().toUpperCase();
  if (["0", "MISS", "RATE", "RATÉ"].includes(text)) return makeDart(0, 0);
  if (["BULL", "DB", "50", "D25"].includes(text)) return makeDart(25, 2);
  if (["SB", "S25"].includes(text)) return makeDart(25, 1);
  const match = /^([SDT]?)(\d{1,2})$/.exec(text);
  if (!match) return null;
  const value = Number(match[2]);
  const prefix = match[1];
  const factor = prefix ? (prefix === "S" ? 1 : prefix === "D" ? 2 : 3) : multiplier;
  if (value === 25) return factor === 3 ? null : makeDart(25, factor);
  if (value >= 1 && value <= 20) return makeDart(value, factor);
  // A total such as 60 can identify one dart. Ambiguous totals need D/T notation.
  if (!prefix && multiplier === 1) {
    const candidates = ([2, 3] as const).filter((m) => value % m === 0 && value / m >= 1 && value / m <= 20);
    if (candidates.length === 1) return makeDart(value / candidates[0], candidates[0]);
  }
  return null;
}

export function parseVisitScore(raw: string): number | null {
  if (!/^\d{1,3}$/.test(raw.trim())) return null;
  const score = Number(raw);
  return score <= 180 ? score : null;
}

export function isPossibleVisitScore(score: number, darts: number): boolean {
  if (!Number.isInteger(score) || score < 0 || ![1, 2, 3].includes(darts)) return false;
  const singles = [0, 25, 50, ...Array.from({ length: 20 }, (_, i) => i + 1).flatMap((n) => [n, n * 2, n * 3])];
  let totals = new Set([0]);
  for (let i = 0; i < darts; i += 1) totals = new Set([...totals].flatMap((total) => singles.map((dart) => total + dart)));
  return totals.has(score);
}

export function isPossibleDoubleCheckout(score: number, darts: number): boolean {
  if (![1, 2, 3].includes(darts)) return false;
  const doubles = [50, ...Array.from({ length: 20 }, (_, i) => (i + 1) * 2)];
  return doubles.some((last) => darts === 1 ? score === last : isPossibleVisitScore(score - last, darts - 1));
}
