import { buildParticipants, nextParticipantIndex, sideCount, sideName, type PlayFormat, type PlayParticipant } from "./format";

export type CricketMode = "BASIC" | "TACTIC" | "MAGIC";
export type CricketScoring = "STANDARD" | "CUT_THROAT";
export type CricketMultiplier = 1 | 2 | 3;

export type CricketTarget = { id: string; value: number; label: string };
export type CricketSide = { name: string; score: number; marks: Record<string, number> };
export type CricketLogEntry = { id: string; participant: number; side: number; dart: string; result: string };
export type CricketState = {
  mode: CricketMode;
  scoring: CricketScoring;
  format: PlayFormat;
  targets: CricketTarget[];
  participants: PlayParticipant[];
  sides: CricketSide[];
  activeParticipant: number;
  dartsInVisit: number;
  visitNumber: number;
  winnerSide: number | null;
  log: CricketLogEntry[];
  magicTouchedTargetIds: string[];
};

const BASE_VALUES = [20, 19, 18, 17, 16, 15, 25];
const TACTIC_VALUES = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 25];

export function targetLabel(value: number) { return value === 25 ? "BULL" : String(value); }

function shuffled<T>(values: T[], random = Math.random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function makeTargets(values: number[], prefix: string): CricketTarget[] {
  return values.map((value, index) => ({ id: `${prefix}-${index}`, value, label: targetLabel(value) }));
}

export function createCricketTargets(mode: CricketMode, random = Math.random) {
  if (mode === "TACTIC") return makeTargets(TACTIC_VALUES, "tactic");
  if (mode === "MAGIC") return makeTargets([...shuffled(Array.from({ length: 20 }, (_, i) => i + 1), random).slice(0, 6), 25], "magic");
  return makeTargets(BASE_VALUES, "cricket");
}

function emptyMarks(targets: CricketTarget[]) { return Object.fromEntries(targets.map((target) => [target.id, 0])); }

export function createCricketGame(mode: CricketMode, scoring: CricketScoring, format: PlayFormat, names: string[], random = Math.random): CricketState {
  const targets = createCricketTargets(mode, random);
  const participants = buildParticipants(format, names);
  const effectiveScoring: CricketScoring = format === "SOLO" ? "STANDARD" : scoring;
  const sides = Array.from({ length: sideCount(format) }, (_, side) => ({
    name: sideName(format, side, participants), score: 0, marks: emptyMarks(targets),
  }));
  return { mode, scoring: effectiveScoring, format, targets, participants, sides, activeParticipant: 0, dartsInVisit: 0, visitNumber: 1, winnerSide: null, log: [], magicTouchedTargetIds: [] };
}

function hitsFor(value: number, multiplier: CricketMultiplier) { return value === 25 ? Math.min(multiplier, 2) : multiplier; }
function multiplierLabel(multiplier: CricketMultiplier) { return multiplier === 1 ? "S" : multiplier === 2 ? "D" : "T"; }

function cloneState(state: CricketState): CricketState {
  return {
    ...state,
    targets: state.targets.map((target) => ({ ...target })),
    participants: state.participants.map((participant) => ({ ...participant })),
    sides: state.sides.map((side) => ({ ...side, marks: { ...side.marks } })),
    log: state.log.map((entry) => ({ ...entry })),
    magicTouchedTargetIds: [...(state.magicTouchedTargetIds ?? [])],
  };
}

function rerollMagicTarget(state: CricketState, targetId: string, random = Math.random) {
  const target = state.targets.find((item) => item.id === targetId);
  if (!target || target.value === 25) return;
  const used = new Set(state.targets.map((item) => item.value));
  const candidates = Array.from({ length: 20 }, (_, i) => i + 1).filter((value) => !used.has(value));
  if (!candidates.length) return;
  target.value = candidates[Math.floor(random() * candidates.length)];
  target.label = targetLabel(target.value);
}

function finishMagicVisit(state: CricketState, participantIndex: number, random = Math.random) {
  if (state.mode !== "MAGIC") {
    state.magicTouchedTargetIds = [];
    return;
  }
  const participant = state.participants[participantIndex];
  const side = participant ? state.sides[participant.side] : null;
  if (!side) {
    state.magicTouchedTargetIds = [];
    return;
  }
  for (const targetId of state.magicTouchedTargetIds ?? []) {
    const marks = side.marks[targetId] ?? 0;
    if (marks > 0 && marks < 3) rerollMagicTarget(state, targetId, random);
  }
  state.magicTouchedTargetIds = [];
}

export function cricketWinner(state: CricketState, sideIndex: number) {
  const side = state.sides[sideIndex];
  if (!side || !state.targets.every((target) => (side.marks[target.id] ?? 0) >= 3)) return false;
  if (state.sides.length === 1) return true;
  const opponents = state.sides.filter((_, index) => index !== sideIndex);
  return state.scoring === "CUT_THROAT"
    ? opponents.every((opponent) => side.score <= opponent.score)
    : opponents.every((opponent) => side.score >= opponent.score);
}

export function applyCricketDart(current: CricketState, value: number, multiplier: CricketMultiplier, random = Math.random): CricketState {
  if (current.winnerSide != null) return current;
  const state = cloneState(current);
  const participantIndex = state.activeParticipant;
  const participant = state.participants[participantIndex];
  const sideIndex = participant.side;
  const side = state.sides[sideIndex];
  const target = state.targets.find((item) => item.value === value);
  const dart = value === 0 ? "MISS" : value === 25 ? (multiplier === 2 ? "BULL 50" : "25") : `${multiplierLabel(multiplier)}${value}`;
  let result = "Hors cible Cricket";

  if (target) {
    const hits = hitsFor(value, multiplier);
    const currentMarks = side.marks[target.id] ?? 0;
    const marksNeeded = Math.max(0, 3 - currentMarks);
    const marksAdded = Math.min(marksNeeded, hits);
    const overflow = Math.max(0, hits - marksAdded);
    const nextMarks = Math.min(3, currentMarks + marksAdded);
    side.marks[target.id] = nextMarks;

    let points = 0;
    if (overflow > 0 && state.sides.length > 1) {
      if (state.scoring === "CUT_THROAT") {
        const openOpponents = state.sides.filter((opponent, index) => index !== sideIndex && (opponent.marks[target.id] ?? 0) < 3);
        points = overflow * value;
        openOpponents.forEach((opponent) => { opponent.score += points; });
        if (!openOpponents.length) points = 0;
      } else {
        const canScore = state.sides.some((opponent, index) => index !== sideIndex && (opponent.marks[target.id] ?? 0) < 3);
        if (canScore) { points = overflow * value; side.score += points; }
      }
    }

    if (state.mode === "MAGIC" && currentMarks < 3 && nextMarks > 0 && nextMarks < 3) {
      if (!state.magicTouchedTargetIds.includes(target.id)) state.magicTouchedTargetIds.push(target.id);
      result = `${marksAdded} marque${marksAdded > 1 ? "s" : ""} · cible conservée jusqu’à la fin de la volée`;
    } else if (nextMarks >= 3 && currentMarks < 3) {
      result = points ? `Fermé · ${points} point${points > 1 ? "s" : ""}` : "Numéro fermé";
    } else if (points) {
      result = state.scoring === "CUT_THROAT" ? `+${points} aux adversaires ouverts` : `+${points} points`;
    } else {
      result = `${marksAdded || hits} marque${(marksAdded || hits) > 1 ? "s" : ""}`;
    }
  }

  state.log.unshift({ id: `${Date.now()}-${Math.random()}`, participant: participantIndex, side: sideIndex, dart, result });
  state.log = state.log.slice(0, 24);
  state.dartsInVisit += 1;

  if (cricketWinner(state, sideIndex)) { state.winnerSide = sideIndex; return state; }
  if (state.dartsInVisit >= 3) {
    finishMagicVisit(state, participantIndex, random);
    state.activeParticipant = nextParticipantIndex(participantIndex, state.participants);
    state.dartsInVisit = 0;
    state.visitNumber += 1;
  }
  return state;
}

export function endCricketVisit(current: CricketState, random = Math.random): CricketState {
  if (current.winnerSide != null) return current;
  const state = cloneState(current);
  const participantIndex = state.activeParticipant;
  finishMagicVisit(state, participantIndex, random);
  state.activeParticipant = nextParticipantIndex(participantIndex, state.participants);
  state.dartsInVisit = 0;
  state.visitNumber += 1;
  return state;
}

export function marksGlyph(value: number) { if (value <= 0) return "·"; if (value === 1) return "/"; if (value === 2) return "×"; return "⊗"; }
