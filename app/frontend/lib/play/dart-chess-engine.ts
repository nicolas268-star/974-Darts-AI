import type { PieceSymbol, Square } from "chess.js";
import { makeDart, type DartThrow } from "../x01/engine";
import { chessPosition, legalMove, passTurn, positionKey, type ChessMove } from "./chess-adapter";

export const PIECE_NAMES: Record<PieceSymbol, string> = { p: "Pion", n: "Cavalier", b: "Fou", r: "Tour", q: "Dame", k: "Roi" };
// Pion: any ring of the target sector. Cavalier: single only. No king capture.
export const BATTLE_RULES = { p: [1, 2, 3], n: [1], b: [2], r: [2], q: [3] } as const;
export type DartEvent = { source: "manual" | "autoscoring"; dart: DartThrow };
export type Target = { segment: number; multipliers: readonly number[] };
export type CaptureChallenge = { move: ChessMove; piece: Exclude<PieceSymbol, "k">; target: Target; darts: DartEvent[] };
type Base = {
  kind: "dartchess"; version: 1; format: "DUEL"; participants: { name: string; side: number }[]; sideNames: string[];
  activeParticipant: number; fen: string; seed: number; lastTarget: number; ply: number;
  positions: string[]; captured: { piece: PieceSymbol; by: number }[]; lastMove: ChessMove | null;
  log: { id: number; participant: number; dart: string; result: string }[]; eventNumber: number;
};
export type DartChessState = Base & (
  | { phase: "SELECT_MOVE"; challenge: null; winnerSide: null }
  | { phase: "CAPTURE_CHALLENGE"; challenge: CaptureChallenge; winnerSide: null }
  | { phase: "KING_CHECKOUT"; challenge: { target: Target; darts: DartEvent[] }; winnerSide: null }
  | { phase: "GAME_OVER"; challenge: null; winnerSide: number | "DRAW" }
);
export function createDartChess(names: string[], seed = 1): DartChessState {
  const fen = chessPosition().fen();
  const sideNames = [names[0]?.trim().slice(0, 80) || "Blancs", names[1]?.trim().slice(0, 80) || "Noirs"];
  return { kind: "dartchess", version: 1, format: "DUEL", participants: sideNames.map((name, side) => ({ name, side })), sideNames,
    activeParticipant: 0, fen, seed: seed >>> 0, lastTarget: 0, ply: 0, positions: [positionKey(fen)], captured: [], lastMove: null,
    log: [], eventNumber: 0, phase: "SELECT_MOVE", challenge: null, winnerSide: null };
}
function log(state: DartChessState, result: string, dart = "—", participant = state.activeParticipant): DartChessState {
  return { ...state, eventNumber: state.eventNumber + 1, log: [{ id: state.eventNumber + 1, participant, dart, result }, ...state.log].slice(0, 30) };
}
export function targetLabel(target: Target): string {
  return target.multipliers.length === 3 ? `Secteur ${target.segment}` : `${target.multipliers[0] === 1 ? "S" : target.multipliers[0] === 2 ? "D" : "T"}${target.segment}`;
}
const hit = (target: Target, dart: DartThrow) => dart.segment === target.segment && target.multipliers.includes(dart.multiplier);
function settle(state: DartChessState, fen: string, lastMove: ChessMove | null): DartChessState {
  const chess = chessPosition(fen), activeParticipant = chess.turn() === "w" ? 0 : 1;
  const positions = [...state.positions, positionKey(fen)].slice(-101);
  const next: DartChessState = { ...state, fen, positions, lastMove, ply: state.ply + 1, activeParticipant, phase: "SELECT_MOVE", challenge: null, winnerSide: null };
  if (chess.isCheckmate()) return log({ ...next, phase: "KING_CHECKOUT", activeParticipant: 1 - activeParticipant, challenge: { target: { segment: 20, multipliers: [2] }, darts: [] } }, "Échec et mat · échiquier figé · King Checkout : D20");
  if (chess.isDraw() || positions.filter(p => p === positionKey(fen)).length >= 3) return log({ ...next, phase: "GAME_OVER", winnerSide: "DRAW" }, chess.isStalemate() ? "Pat · match nul" : "Match nul · répétition, matériel insuffisant ou règle des 50 coups");
  return chess.isCheck() ? log(next, "Échec · sauvez votre roi ; les captures de défense sont automatiques") : next;
}
function commitMove(state: DartChessState, move: ChessMove): DartChessState {
  const chess = chessPosition(state.fen), result = chess.move(move);
  const captured = result.captured ? [...state.captured, { piece: result.captured, by: state.activeParticipant }] : state.captured;
  return settle(log({ ...state, captured }, `${result.san} · ${result.from} → ${result.to}${result.captured ? " · capture réussie" : ""}`), chess.fen(), move);
}
export function requestChessMove(state: DartChessState, input: ChessMove): DartChessState {
  if (state.phase !== "SELECT_MOVE") return state;
  const move = legalMove(state.fen, input);
  if (!move) return state;
  if (!move.captured || chessPosition(state.fen).isCheck()) return commitMove(state, input);
  if (move.captured === "k") return state;
  const seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  let segment = Math.floor(seed / 4294967296 * 20) + 1;
  if (segment === state.lastTarget) segment = segment % 20 + 1;
  const target = { segment, multipliers: [...BATTLE_RULES[move.captured]] };
  return log({ ...state, seed, lastTarget: segment, phase: "CAPTURE_CHALLENGE", challenge: { move: input, piece: move.captured, target, darts: [] } }, `${input.from} → ${input.to} · capture du ${PIECE_NAMES[move.captured]} · ${targetLabel(target)}`);
}
function validDartEvent(value: unknown): value is DartEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as DartEvent, d = event.dart;
  if (!["manual", "autoscoring"].includes(event.source) || !d || !Number.isInteger(d.segment) || !Number.isInteger(d.multiplier)) return false;
  if (!(d.segment === 0 ? d.multiplier === 0 : d.segment === 25 ? [1, 2].includes(d.multiplier) : d.segment >= 1 && d.segment <= 20 && [1, 2, 3].includes(d.multiplier))) return false;
  const canonical = makeDart(d.segment, d.multiplier);
  return (Object.keys(canonical) as (keyof DartThrow)[]).every(k => canonical[k] === d[k]);
}
export function applyChessDart(state: DartChessState, event: DartEvent): DartChessState {
  if ((state.phase !== "CAPTURE_CHALLENGE" && state.phase !== "KING_CHECKOUT") || state.challenge.darts.length >= 3 || !validDartEvent(event)) return state;
  const success = hit(state.challenge.target, event.dart);
  const next = log(state, success ? "Objectif atteint" : "Objectif manqué", event.dart.label);
  if (success) {
    if (state.phase === "KING_CHECKOUT") return log({ ...next, phase: "GAME_OVER", challenge: null, winnerSide: state.activeParticipant }, "KING DOWN · victoire");
    return commitMove(next, state.challenge.move);
  }
  const darts = [...state.challenge.darts, event];
  if (state.phase === "KING_CHECKOUT") return log({ ...next, phase: "KING_CHECKOUT", challenge: { ...state.challenge, darts }, winnerSide: null }, darts.length === 3 ? "D20 manqué · retirez les fléchettes puis recommencez" : `${3 - darts.length} fléchette(s) restante(s)`);
  if (darts.length === 3) return settle(log(next, "Capture échouée · mouvement annulé · tour perdu"), passTurn(state.fen), null);
  return { ...next, phase: "CAPTURE_CHALLENGE", challenge: { ...state.challenge, darts }, winnerSide: null };
}
export function retryKingCheckout(state: DartChessState): DartChessState {
  if (state.phase !== "KING_CHECKOUT" || state.challenge.darts.length !== 3) return state;
  return log({ ...state, challenge: { ...state.challenge, darts: [] } }, "King Checkout · nouvelle volée de 3 fléchettes sur D20");
}
export function resignDartChess(state: DartChessState): DartChessState {
  if (state.phase === "GAME_OVER") return state;
  return log({ ...state, phase: "GAME_OVER", challenge: null, winnerSide: 1 - state.activeParticipant }, "Abandon");
}

/** Validate persisted state before any board/UI access; do not trust a FEN alone. */
export function validDartChess(value: unknown): value is DartChessState {
  try {
    if (!value || typeof value !== "object") return false;
    const s = value as DartChessState;
    const integer = (n: unknown, max = 1_000_000) => Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= max;
    const moveShape = (m: ChessMove) => m && /^[a-h][1-8]$/.test(m.from) && /^[a-h][1-8]$/.test(m.to) && (m.promotion === undefined || ["q", "r", "b", "n"].includes(m.promotion));
    if (s.kind !== "dartchess" || s.version !== 1 || s.format !== "DUEL" || ![0, 1].includes(s.activeParticipant) ||
      !Array.isArray(s.sideNames) || s.sideNames.length !== 2 || !s.sideNames.every(n => typeof n === "string" && n.length > 0 && n.length <= 80) ||
      !Array.isArray(s.participants) || s.participants.length !== 2 || !s.participants.every((p, i) => p?.name === s.sideNames[i] && p.side === i) ||
      !integer(s.seed, 4294967295) || !integer(s.lastTarget, 20) || !integer(s.ply) || !integer(s.eventNumber) ||
      typeof s.fen !== "string" || s.fen.length > 150 || !Array.isArray(s.positions) || !s.positions.length || s.positions.length > 101 ||
      !s.positions.every(p => typeof p === "string" && p.length <= 120) || s.positions.at(-1) !== positionKey(s.fen) ||
      !Array.isArray(s.captured) || s.captured.length > 30 || !s.captured.every(c => c && ["p", "n", "b", "r", "q"].includes(c.piece) && [0, 1].includes(c.by)) ||
      (s.lastMove !== null && !moveShape(s.lastMove)) || !Array.isArray(s.log) || s.log.length > 30 || !s.log.every(e => e && integer(e.id) && e.id <= s.eventNumber && [0, 1].includes(e.participant) && typeof e.dart === "string" && e.dart.length <= 20 && typeof e.result === "string" && e.result.length <= 500)) return false;
    const chess = chessPosition(s.fen), active = chess.turn() === "w" ? 0 : 1;
    const opponent = chess.turn() === "w" ? "b" : "w";
    const king = chess.board().flat().find(p => p?.type === "k" && p.color === opponent);
    if (!king || chess.isAttacked(king.square, chess.turn())) return false;
    if (s.phase === "GAME_OVER") return s.challenge === null && (s.winnerSide === "DRAW" || s.winnerSide === 0 || s.winnerSide === 1);
    if (s.winnerSide !== null) return false;
    if (s.phase === "SELECT_MOVE") return s.challenge === null && active === s.activeParticipant && !chess.isGameOver() && s.positions.filter(p => p === positionKey(s.fen)).length < 3;
    if (s.phase !== "CAPTURE_CHALLENGE" && s.phase !== "KING_CHECKOUT") return false;
    const c = s.challenge;
    if (!c || !Array.isArray(c.darts) || c.darts.length > (s.phase === "KING_CHECKOUT" ? 3 : 2) || !c.darts.every(validDartEvent) || !c.target || !integer(c.target.segment, 20) || c.target.segment < 1 || !Array.isArray(c.target.multipliers) || c.darts.some(d => hit(c.target, d.dart))) return false;
    if (s.phase === "KING_CHECKOUT") return chess.isCheckmate() && s.activeParticipant === 1 - active && c.target.segment === 20 && JSON.stringify(c.target.multipliers) === "[2]";
    const challenge = s.challenge;
    if (active !== s.activeParticipant || chess.isCheck() || chess.isGameOver() || !moveShape(challenge.move)) return false;
    const move = legalMove(s.fen, challenge.move);
    return Boolean(move?.captured && move.captured !== "k" && move.captured === challenge.piece && challenge.target.segment === s.lastTarget && JSON.stringify(challenge.target.multipliers) === JSON.stringify(BATTLE_RULES[move.captured]));
  } catch { return false; }
}
export type { ChessMove, Square };
