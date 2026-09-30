import type { DartThrow } from "../x01/engine";
import { buildParticipants, participantCount, sideCount, sideName, type PlayFormat, type PlayParticipant } from "./format";
import { CONQUEST_LINKS, conquestNeighbors } from "./conquest-map";

export type FunKind = "connect4" | "conquest" | "bull500";
export type FunOptions = {
  connectRule?: "ANY" | "DOUBLE";
  conquestGoal?: 5 | 7 | 10;
  conquestMode?: "CLASSIC" | "CONNECTED";
  conquestPointsGoal?: 12 | 18 | 24;
  bullUnlock?: "50" | "25_OR_50";
  bullTarget?: "20" | "19" | "19_OR_20";
};
type BaseState = {
  format: PlayFormat;
  participants: PlayParticipant[];
  sideNames: string[];
  activeParticipant: number;
  visitNumber: number;
  visitDarts: string[];
  visitClosed: boolean;
  winnerSide: number | "DRAW" | null;
  totalDarts: number;
  log: { id: number; participant: number; dart: string; result: string }[];
};
export const CONNECT_TARGETS = [14, 15, 16, 17, 18, 19, 20];
export type Connect4State = BaseState & {
  kind: "connect4"; rule: "ANY" | "DOUBLE"; board: (number | null)[]; winningCells: number[];
};
export type Territory = { target: number; owner: number | null; marks: number[] };
export type ConquestState = BaseState & {
  kind: "conquest"; goal: 5 | 7 | 10; territories: Territory[];
  strategy?: { version: 1; goal: 12 | 18 | 24 };
};
export type Bull500State = BaseState & {
  kind: "bull500"; unlock: "50" | "25_OR_50"; target: "20" | "19" | "19_OR_20";
  unlocked: boolean; scores: number[];
};
export type FunState = Connect4State | ConquestState | Bull500State;

export function createFunGame(kind: FunKind, format: PlayFormat, names: string[], options: FunOptions = {}): FunState {
  const participants = buildParticipants(format, Array.from({ length: participantCount(format) }, (_, i) => names[i] ?? ""));
  const sides = sideCount(format);
  const base: BaseState = {
    format, participants, sideNames: Array.from({ length: sides }, (_, i) => sideName(format, i, participants)),
    activeParticipant: 0, visitNumber: 1, visitDarts: [], visitClosed: false, winnerSide: null, totalDarts: 0, log: [],
  };
  if (kind === "connect4") return { ...base, kind, rule: options.connectRule ?? "ANY", board: Array(42).fill(null), winningCells: [] };
  if (kind === "conquest") return {
    ...base, kind, goal: options.conquestGoal ?? 7,
    ...(options.conquestMode === "CONNECTED" ? { strategy: { version: 1 as const, goal: options.conquestPointsGoal ?? 18 } } : {}),
    territories: Array.from({ length: 20 }, (_, i) => ({ target: i + 1, owner: null, marks: Array(sides).fill(0) })),
  };
  return { ...base, kind, unlock: options.bullUnlock ?? "50", target: options.bullTarget ?? "20", unlocked: false, scores: Array(sides).fill(0) };
}

function findFour(board: (number | null)[], index: number, side: number): number[] {
  const row = Math.floor(index / 7), column = index % 7;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [index];
    for (const direction of [-1, 1]) {
      for (let distance = 1; distance < 4; distance++) {
        const r = row + dr * distance * direction, c = column + dc * distance * direction;
        if (r < 0 || r >= 6 || c < 0 || c >= 7 || board[r * 7 + c] !== side) break;
        cells.push(r * 7 + c);
      }
    }
    if (cells.length >= 4) return cells;
  }
  return [];
}

export function conquestCounts(state: ConquestState): number[] {
  return state.sideNames.map((_, side) => state.territories.filter((t) => t.owner === side).length);
}

export function conquestAlliedLinks(state: ConquestState, side: number): number {
  return CONQUEST_LINKS.filter(([a,b]) => state.territories[a-1].owner === side && state.territories[b-1].owner === side).length;
}
export function conquestScores(state: ConquestState): number[] {
  return conquestCounts(state).map((count, side) => state.strategy ? count * 2 + conquestAlliedLinks(state, side) : count);
}
export function conquestCaptureValue(state: ConquestState, target: number, side: number): number {
  if (!state.territories[target-1] || state.territories[target-1].owner === side) return 0;
  return state.strategy ? 2 + conquestNeighbors(target).filter((id) => state.territories[id-1].owner === side).length : 1;
}

export function applyFunDart(state: FunState, dart: DartThrow): FunState {
  if (state.winnerSide !== null || state.visitClosed || state.visitDarts.length >= 3) return state;
  const side = state.participants[state.activeParticipant].side;
  let next: FunState = state;
  let result = "Sans effet";
  if (state.kind === "connect4") {
    const column = CONNECT_TARGETS.indexOf(dart.segment);
    const eligible = !dart.isMiss && column >= 0 && (state.rule === "ANY" || dart.multiplier === 2);
    if (eligible) {
      let index = -1;
      for (let row = 5; row >= 0; row--) if (state.board[row * 7 + column] === null) { index = row * 7 + column; break; }
      if (index >= 0) {
        const board = [...state.board];
        board[index] = side;
        const winningCells = findFour(board, index, side);
        next = { ...state, board, winningCells, visitClosed: true, winnerSide: winningCells.length ? side : board.every((cell) => cell !== null) ? "DRAW" : null };
        result = "Pion posé · colonne " + dart.segment + " · passez la main";
      } else result = "Colonne pleine · fléchette consommée";
    } else if (state.rule === "DOUBLE" && column >= 0) result = "Double requis · fléchette consommée";
  } else if (state.kind === "conquest") {
    const index = dart.segment - 1;
    if (!dart.isMiss && index >= 0 && index < 20) {
      const territory = state.territories[index];
      if (territory.owner === side) result = "Territoire déjà à votre camp";
      else {
        const marks = [...territory.marks];
        marks[side] = Math.min(3, marks[side] + dart.multiplier);
        const captured = marks[side] === 3;
        const territories = [...state.territories];
        territories[index] = { ...territory, marks: captured ? marks.map(() => 0) : marks, owner: captured ? side : territory.owner };
        const conquest: ConquestState = { ...state, territories };
        if (conquestScores(conquest)[side] >= (state.strategy?.goal ?? state.goal)) conquest.winnerSide = side;
        next = conquest;
        result = captured ? (territory.owner === null ? "Territoire conquis : " : "Territoire repris : ") + dart.segment : marks[side] + "/3 marques sur le " + dart.segment;
        if (captured && state.strategy) {
          const gain = conquestCaptureValue(state, dart.segment, side);
          result += " · +" + gain + " points" + (gain > 2 ? " dont " + (gain - 2) + " de liaison" : "");
          if (territory.owner !== null) result += " · " + state.sideNames[territory.owner] + " perd " + (conquestScores(state)[territory.owner] - conquestScores(conquest)[territory.owner]) + " points";
        }
      }
    }
  } else {
    const opens = dart.segment === 25 && (state.unlock === "25_OR_50" || dart.multiplier === 2);
    if (!state.unlocked && opens) {
      next = { ...state, unlocked: true };
      result = "Score débloqué pour cette volée · Bull sans points";
    } else if (!state.unlocked) result = "Touchez le " + (state.unlock === "50" ? "Bull 50" : "25 ou Bull 50") + " pour débloquer";
    else {
      const onTarget = state.target === "19_OR_20" ? dart.segment === 19 || dart.segment === 20 : dart.segment === Number(state.target);
      if (onTarget && !dart.isMiss) {
        const scores = [...state.scores];
        scores[side] += dart.score;
        next = { ...state, scores, winnerSide: scores[side] >= 500 ? side : null };
        result = "+" + dart.score + " points";
      } else result = "Cible de score : " + state.target.replace("_OR_", " ou ");
    }
  }
  const visitDarts = [...state.visitDarts, dart.label];
  return {
    ...next, visitDarts, visitClosed: next.visitClosed || visitDarts.length === 3 || next.winnerSide !== null,
    totalDarts: state.totalDarts + 1,
    log: [{ id: state.totalDarts + 1, participant: state.activeParticipant, dart: dart.label, result }, ...state.log].slice(0, 30),
  };
}

export function endFunVisit(state: FunState): FunState {
  if (!state.visitClosed || state.winnerSide !== null) return state;
  const next = { ...state, activeParticipant: (state.activeParticipant + 1) % state.participants.length, visitDarts: [], visitClosed: false, visitNumber: state.visitNumber + 1 };
  return next.kind === "bull500" ? { ...next, unlocked: false } : next;
}
