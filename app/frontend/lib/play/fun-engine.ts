import type { DartThrow } from "../x01/engine";
import { buildParticipants, participantCount, sideCount, sideName, type PlayFormat, type PlayParticipant } from "./format";
import { CONQUEST_LINKS, CONQUEST_WORLD_LINKS } from "./conquest-map";

export type FunKind = "connect4" | "conquest" | "bull500";
export type FunOptions = {
  connectRule?: "ANY" | "DOUBLE";
  conquestGoal?: 5 | 7 | 10;
  conquestMode?: "CLASSIC" | "CONNECTED" | "FULL";
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
  campaign?: {
    version: 2; mode: "CLASSIC" | "CONNECTED" | "FULL"; goal: 5 | 7 | 10 | 12 | 18 | 24;
    bonuses: number[]; pending: number[];
  };
};
export type Bull500State = BaseState & {
  kind: "bull500"; unlock: "50" | "25_OR_50"; target: "20" | "19" | "19_OR_20";
  unlocked: boolean; scores: number[];
};
export type FunState = Connect4State | ConquestState | Bull500State;

export function createFunGame(kind: FunKind, format: PlayFormat, names: string[], options: FunOptions = {}, random: () => number = Math.random): FunState {
  const participants = buildParticipants(format, Array.from({ length: participantCount(format) }, (_, i) => names[i] ?? ""));
  const sides = sideCount(format);
  const base: BaseState = {
    format, participants, sideNames: Array.from({ length: sides }, (_, i) => sideName(format, i, participants)),
    activeParticipant: 0, visitNumber: 1, visitDarts: [], visitClosed: false, winnerSide: null, totalDarts: 0, log: [],
  };
  if (kind === "connect4") return { ...base, kind, rule: options.connectRule ?? "ANY", board: Array(42).fill(null), winningCells: [] };
  if (kind === "conquest") {
    const targets = Array.from({ length: 20 }, (_, i) => i + 1);
    for (let i = targets.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [targets[i], targets[j]] = [targets[j], targets[i]];
    }
    const mode = options.conquestMode ?? "CLASSIC";
    return { ...base, kind, goal: options.conquestGoal ?? 7,
      campaign: { version: 2, mode, goal: mode === "CLASSIC" ? options.conquestGoal ?? 7 : options.conquestPointsGoal ?? 18, bonuses: Array(sides).fill(0), pending: [] },
      territories: [...targets, 25].map(target => ({ target, owner: null, marks: Array(sides).fill(0) })),
    };
  }
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
  return conquestLinks(state).filter(([a,b]) => state.territories[a-1].owner === side && state.territories[b-1].owner === side).length;
}
export function conquestLinks(state: ConquestState) {
  return state.campaign ? CONQUEST_WORLD_LINKS : CONQUEST_LINKS;
}
export function conquestNeighborRegions(state: ConquestState, region: number): number[] {
  return conquestLinks(state).flatMap(([a,b]) => a === region ? [b] : b === region ? [a] : []).sort((a,b) => a-b);
}
export function conquestUsesLinks(state: ConquestState): boolean {
  return state.campaign ? state.campaign.mode !== "CLASSIC" : Boolean(state.strategy);
}
export function conquestGoal(state: ConquestState): number | null {
  return state.campaign?.mode === "FULL" ? null : state.campaign?.goal ?? state.strategy?.goal ?? state.goal;
}
export function conquestTargetLabel(target: number): string {
  return target === 25 ? "Bull" : String(target);
}
export function conquestScores(state: ConquestState): number[] {
  return conquestCounts(state).map((count, side) => (conquestUsesLinks(state) ? count * 2 + conquestAlliedLinks(state, side) : count) + (state.campaign?.bonuses[side] ?? 0));
}
export function conquestCaptureValue(state: ConquestState, target: number, side: number): number {
  const index = state.territories.findIndex(t => t.target === target);
  if (index < 0 || state.territories[index].owner === side) return 0;
  return conquestUsesLinks(state) ? 2 + conquestNeighborRegions(state, index + 1).filter((id) => state.territories[id-1].owner === side).length : 1;
}
export function conquestWinner(state: ConquestState): number | "DRAW" | null {
  const scores = conquestScores(state), goal = conquestGoal(state);
  if (state.campaign) {
    if (!state.visitClosed || (goal === null ? state.territories.some(t => t.owner === null) : Math.max(...scores) < goal)) return null;
    const leaders = scores.flatMap((score, side) => score === Math.max(...scores) ? [side] : []);
    return leaders.length === 1 ? leaders[0] : "DRAW";
  }
  const winner = scores.findIndex(score => score >= (goal ?? state.goal));
  return winner < 0 ? null : winner;
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
    const index = state.territories.findIndex(t => t.target === dart.segment);
    if (!dart.isMiss && index >= 0) {
      const territory = state.territories[index];
      if (territory.owner === side) result = "Territoire déjà à votre camp";
      else {
        const marks = [...territory.marks];
        marks[side] = Math.min(3, marks[side] + dart.multiplier);
        const captured = marks[side] === 3;
        const territories = [...state.territories];
        territories[index] = { ...territory, marks: captured ? marks.map(() => 0) : marks, owner: captured ? side : territory.owner };
        const conquest: ConquestState = { ...state, territories };
        if (state.campaign) {
          const region = index + 1;
          const pending = state.campaign.pending.filter(id => id !== region);
          if (!captured && territory.owner !== null) pending.push(region);
          conquest.campaign = { ...state.campaign, pending };
        } else if (conquestScores(conquest)[side] >= (state.strategy?.goal ?? state.goal)) conquest.winnerSide = side;
        next = conquest;
        result = captured ? (territory.owner === null ? "Territoire conquis : " : "Territoire repris : ") + conquestTargetLabel(dart.segment) : marks[side] + "/3 marques sur le " + conquestTargetLabel(dart.segment);
        if (captured && (state.strategy || state.campaign)) {
          const gain = conquestCaptureValue(state, dart.segment, side);
          result += " · +" + gain + " points" + (conquestUsesLinks(state) && gain > 2 ? " dont " + (gain - 2) + " de liaison" : "");
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
  if (next.kind === "conquest" && next.campaign && (visitDarts.length === 3 || (next.campaign.mode === "FULL" && next.territories.every(t => t.owner !== null)))) {
    const bonuses = [...next.campaign.bonuses], awarded = Array(bonuses.length).fill(0) as number[];
    for (const region of next.campaign.pending) {
      const owner = next.territories[region - 1].owner;
      if (owner !== null && owner !== side) { bonuses[owner]++; awarded[owner]++; }
    }
    const settled: ConquestState = { ...next, campaign: { ...next.campaign, bonuses, pending: [] }, visitClosed: true };
    settled.winnerSide = conquestWinner(settled);
    next = settled;
    if (awarded.some(Boolean)) result += " · Bonus défense : " + awarded.flatMap((points, owner) => points ? [`camp ${owner + 1} +${points}`] : []).join(", ");
  }
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
