import type { PieceSymbol, Square } from "chess.js";
import { makeDart, type DartThrow } from "../x01/engine";
import { chessPosition, legalMove, passTurn, positionKey, type ChessMove } from "./chess-adapter";

export const PIECE_NAMES: Record<PieceSymbol, string> = { p: "Pion", n: "Cavalier", b: "Fou", r: "Tour", q: "Dame", k: "Roi" };
export const BATTLE_RULES = { p: [1, 2, 3], n: [1], b: [2], r: [2], q: [3] } as const;
export type ChessMode = "CLASSIC" | "BATTLE" | "CHAOS";
export type AIDifficulty = "EASY" | "MEDIUM" | "HARD";
export type ChessSettings = { mode: ChessMode; aiSide: 0 | 1 | null; difficulty: AIDifficulty };
export const DEFAULT_SETTINGS: ChessSettings = { mode: "BATTLE", aiSide: null, difficulty: "MEDIUM" };
export const MODE_NAMES: Record<ChessMode, string> = { CLASSIC: "Classic", BATTLE: "Battle", CHAOS: "Chaos" };
export type DartEvent = { source: "manual" | "autoscoring" | "computer"; dart: DartThrow };
export type Target = { segment: number; multipliers: readonly number[] };
export type CaptureChallenge = {
  move: ChessMove; piece: Exclude<PieceSymbol, "k"> | null; target: Target; darts: DartEvent[];
  assisted?: boolean; extended?: boolean;
};
type Base = {
  kind: "dartchess"; version: 1 | 2; format: "DUEL";
  // Absent on legacy V1 saves: interpreted strictly as human Battle.
  settings?: ChessSettings; energy?: [number, number]; aiSeed?: number;
  participants: { name: string; side: number }[]; sideNames: string[];
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
export const chessSettings = (state: DartChessState): ChessSettings => state.version === 1 ? DEFAULT_SETTINGS : state.settings!;
export const isComputerTurn = (state: DartChessState): boolean => state.phase !== "GAME_OVER" && chessSettings(state).aiSide === state.activeParticipant;
export const dartLimit = (state: DartChessState): number => state.phase === "CAPTURE_CHALLENGE" && state.challenge.extended ? 4 : 3;
export function createDartChess(names: string[], seed = 1, settings: ChessSettings = DEFAULT_SETTINGS): DartChessState {
  const fen = chessPosition().fen();
  const sideNames = [names[0]?.trim().slice(0, 80) || "Blancs", names[1]?.trim().slice(0, 80) || "Noirs"];
  return { kind: "dartchess", version: 2, format: "DUEL", settings: { ...settings }, energy: [2, 2], aiSeed: (seed ^ 0x9e3779b9) >>> 0,
    participants: sideNames.map((name, side) => ({ name, side })), sideNames,
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
const chaosJoker = (state: DartChessState, dart: DartThrow) => chessSettings(state).mode === "CHAOS" && state.phase === "CAPTURE_CHALLENGE" && dart.segment === 25 && dart.multiplier === 2;
function settle(state: DartChessState, fen: string, lastMove: ChessMove | null): DartChessState {
  const chess = chessPosition(fen), activeParticipant = chess.turn() === "w" ? 0 : 1;
  const positions = [...state.positions, positionKey(fen)].slice(-101);
  const next: DartChessState = { ...state, fen, positions, lastMove, ply: state.ply + 1, activeParticipant, phase: "SELECT_MOVE", challenge: null, winnerSide: null };
  if (chess.isCheckmate()) {
    if (chessSettings(state).mode === "CLASSIC") return log({ ...next, phase: "GAME_OVER", winnerSide: 1 - activeParticipant }, "Échec et mat · victoire", "—", 1 - activeParticipant);
    return log({ ...next, phase: "KING_CHECKOUT", activeParticipant: 1 - activeParticipant, challenge: { target: { segment: 20, multipliers: [2] }, darts: [] } }, "Échec et mat · échiquier figé · King Checkout : D20");
  }
  if (chess.isDraw() || positions.filter(p => p === positionKey(fen)).length >= 3) return log({ ...next, phase: "GAME_OVER", winnerSide: "DRAW" }, chess.isStalemate() ? "Pat · match nul" : "Match nul · répétition, matériel insuffisant ou règle des 50 coups");
  return chess.isCheck() ? log(next, "Échec · sauvez votre roi ; les coups de défense sont automatiques") : next;
}
function commitMove(state: DartChessState, move: ChessMove): DartChessState {
  const chess = chessPosition(state.fen), result = chess.move(move);
  const captured = result.captured ? [...state.captured, { piece: result.captured, by: state.activeParticipant }] : state.captured;
  return settle(log({ ...state, captured }, `${result.san} · ${result.from} → ${result.to}${result.captured ? " · capture réussie" : ""}`), chess.fen(), move);
}
export function requestChessMove(state: DartChessState, input: ChessMove): DartChessState {
  if (state.phase !== "SELECT_MOVE") return state;
  const move = legalMove(state.fen, input);
  if (!move || move.captured === "k") return state;
  const classic = chessSettings(state).mode === "CLASSIC";
  if ((!classic && !move.captured) || chessPosition(state.fen).isCheck()) return commitMove(state, input);
  const seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  let segment = Math.floor(seed / 4294967296 * 20) + 1;
  if (segment === state.lastTarget) segment = segment % 20 + 1;
  const target = { segment, multipliers: classic ? [1, 2, 3] : [...BATTLE_RULES[move.captured!]] };
  const piece = move.captured ?? null;
  return log({ ...state, seed, lastTarget: segment, phase: "CAPTURE_CHALLENGE", challenge: { move: { ...input }, piece, target, darts: [] } }, `${input.from} → ${input.to} · ${piece ? `capture du ${PIECE_NAMES[piece]}` : "déplacement à valider"} · ${targetLabel(target)}`);
}
function validDartEvent(value: unknown): value is DartEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as DartEvent, d = event.dart;
  if (!["manual", "autoscoring", "computer"].includes(event.source) || !d || !Number.isInteger(d.segment) || !Number.isInteger(d.multiplier)) return false;
  if (!(d.segment === 0 ? d.multiplier === 0 : d.segment === 25 ? [1, 2].includes(d.multiplier) : d.segment >= 1 && d.segment <= 20 && [1, 2, 3].includes(d.multiplier))) return false;
  const canonical = makeDart(d.segment, d.multiplier);
  return (Object.keys(canonical) as (keyof DartThrow)[]).every(k => canonical[k] === d[k]);
}
function gainEnergy(state: DartChessState, dart: DartThrow): DartChessState {
  if (chessSettings(state).mode !== "CHAOS" || state.phase !== "CAPTURE_CHALLENGE") return state;
  const gain = dart.segment === 25 ? (dart.multiplier === 2 ? 3 : 1) : dart.multiplier === 3 ? 2 : dart.multiplier === 2 ? 1 : 0;
  if (!gain) return state;
  const energy: [number, number] = [...state.energy!];
  energy[state.activeParticipant] = Math.min(6, energy[state.activeParticipant] + gain);
  return { ...state, energy };
}
export function applyChessDart(state: DartChessState, event: DartEvent): DartChessState {
  if ((state.phase !== "CAPTURE_CHALLENGE" && state.phase !== "KING_CHECKOUT") || state.challenge.darts.length >= dartLimit(state) || !validDartEvent(event) || (event.source === "computer") !== isComputerTurn(state)) return state;
  const success = hit(state.challenge.target, event.dart) || chaosJoker(state, event.dart);
  const next = log(gainEnergy(state, event.dart), success ? (chaosJoker(state, event.dart) ? "Bull joker · capture réussie" : "Objectif atteint") : "Objectif manqué", `${event.source === "computer" ? "IA · " : ""}${event.dart.label}`);
  if (success) {
    if (state.phase === "KING_CHECKOUT") return log({ ...next, phase: "GAME_OVER", challenge: null, winnerSide: state.activeParticipant }, "KING DOWN · victoire");
    return commitMove(next, state.challenge.move);
  }
  const darts = [...state.challenge.darts, event];
  if (state.phase === "KING_CHECKOUT") return log({ ...next, phase: "KING_CHECKOUT", challenge: { ...state.challenge, darts }, winnerSide: null }, darts.length === 3 ? "D20 manqué · retirez les fléchettes puis recommencez" : `${3 - darts.length} fléchette(s) restante(s)`);
  if (darts.length === dartLimit(state)) return settle(log(next, `${state.challenge.piece ? "Capture échouée" : "Déplacement échoué"} · mouvement annulé · tour perdu`), passTurn(state.fen), null);
  return { ...next, phase: "CAPTURE_CHALLENGE", challenge: { ...state.challenge, darts }, winnerSide: null };
}
export type ChaosPower = "PRECISION" | "REINFORCEMENT";
export function activateChaosPower(state: DartChessState, power: ChaosPower): DartChessState {
  if (chessSettings(state).mode !== "CHAOS" || state.phase !== "CAPTURE_CHALLENGE" || state.challenge.darts.length || !["PRECISION", "REINFORCEMENT"].includes(power)) return state;
  const c = state.challenge, precision = power === "PRECISION", cost = precision ? 1 : 2;
  if ((precision ? c.assisted || c.target.multipliers.length === 3 : c.extended) || state.energy![state.activeParticipant] < cost) return state;
  const energy: [number, number] = [...state.energy!]; energy[state.activeParticipant] -= cost;
  return log({ ...state, energy, challenge: precision ? { ...c, assisted: true, target: { ...c.target, multipliers: [1, 2, 3] } } : { ...c, extended: true } }, precision ? "Précision · S/D/T du numéro acceptés · −1 énergie" : "Renfort · une quatrième fléchette · −2 énergie");
}
export function retryKingCheckout(state: DartChessState): DartChessState {
  if (state.phase !== "KING_CHECKOUT" || state.challenge.darts.length !== 3) return state;
  return log({ ...state, challenge: { ...state.challenge, darts: [] } }, "King Checkout · nouvelle volée de 3 fléchettes sur D20");
}
export function resignDartChess(state: DartChessState): DartChessState {
  if (state.phase === "GAME_OVER") return state;
  const loser = chessSettings(state).aiSide === null ? state.activeParticipant : 1 - chessSettings(state).aiSide!;
  return log({ ...state, phase: "GAME_OVER", challenge: null, winnerSide: 1 - loser }, "Abandon", "—", loser);
}

/** Structural save validation shared by the client and authenticated sync API. */
export function validDartChess(value: unknown): value is DartChessState {
  try {
    if (!value || typeof value !== "object") return false;
    const s = value as DartChessState;
    const integer = (n: unknown, max = 1_000_000) => Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= max;
    const moveShape = (m: ChessMove) => m && /^[a-h][1-8]$/.test(m.from) && /^[a-h][1-8]$/.test(m.to) && (m.promotion === undefined || ["q", "r", "b", "n"].includes(m.promotion));
    if (s.kind !== "dartchess" || ![1, 2].includes(s.version) || s.format !== "DUEL" || ![0, 1].includes(s.activeParticipant) ||
      !Array.isArray(s.sideNames) || s.sideNames.length !== 2 || !s.sideNames.every(n => typeof n === "string" && n.length > 0 && n.length <= 80) ||
      !Array.isArray(s.participants) || s.participants.length !== 2 || !s.participants.every((p, i) => p?.name === s.sideNames[i] && p.side === i) ||
      !integer(s.seed, 4294967295) || !integer(s.lastTarget, 20) || !integer(s.ply) || !integer(s.eventNumber) ||
      typeof s.fen !== "string" || s.fen.length > 150 || !Array.isArray(s.positions) || !s.positions.length || s.positions.length > 101 ||
      !s.positions.every(p => typeof p === "string" && p.length <= 120) || s.positions.at(-1) !== positionKey(s.fen) ||
      !Array.isArray(s.captured) || s.captured.length > 30 || !s.captured.every(c => c && ["p", "n", "b", "r", "q"].includes(c.piece) && [0, 1].includes(c.by)) ||
      (s.lastMove !== null && !moveShape(s.lastMove)) || !Array.isArray(s.log) || s.log.length > 30 || !s.log.every(e => e && integer(e.id) && e.id <= s.eventNumber && [0, 1].includes(e.participant) && typeof e.dart === "string" && e.dart.length <= 20 && typeof e.result === "string" && e.result.length <= 500)) return false;
    if (s.version === 1 && (s.settings !== undefined || s.energy !== undefined || s.aiSeed !== undefined)) return false;
    if (s.version === 2 && (!s.settings || !["CLASSIC", "BATTLE", "CHAOS"].includes(s.settings.mode) || ![null, 0, 1].includes(s.settings.aiSide) || !["EASY", "MEDIUM", "HARD"].includes(s.settings.difficulty) || !integer(s.aiSeed, 4294967295) || !Array.isArray(s.energy) || s.energy.length !== 2 || !s.energy.every(n => integer(n, 6)))) return false;
    const chess = chessPosition(s.fen), active = chess.turn() === "w" ? 0 : 1;
    const king = chess.board().flat().find(p => p?.type === "k" && p.color !== chess.turn());
    if (!king || chess.isAttacked(king.square, chess.turn())) return false;
    if (s.phase === "GAME_OVER") return s.challenge === null && (s.winnerSide === "DRAW" || s.winnerSide === 0 || s.winnerSide === 1);
    if (s.winnerSide !== null) return false;
    if (s.phase === "SELECT_MOVE") return s.challenge === null && active === s.activeParticipant && !chess.isGameOver() && s.positions.filter(p => p === positionKey(s.fen)).length < 3;
    if (s.phase !== "CAPTURE_CHALLENGE" && s.phase !== "KING_CHECKOUT") return false;
    const c = s.challenge;
    if (!c || !Array.isArray(c.darts) || c.darts.length > (s.phase === "KING_CHECKOUT" ? 3 : dartLimit(s) - 1) || !c.darts.every(validDartEvent) || !c.target || !integer(c.target.segment, 20) || c.target.segment < 1 || !Array.isArray(c.target.multipliers) || c.darts.some(d => hit(c.target, d.dart) || chaosJoker(s, d.dart))) return false;
    if (c.darts.some(d => (d.source === "computer") !== isComputerTurn(s))) return false;
    if (s.phase === "KING_CHECKOUT") return chessSettings(s).mode !== "CLASSIC" && chess.isCheckmate() && s.activeParticipant === 1 - active && c.target.segment === 20 && JSON.stringify(c.target.multipliers) === "[2]";
    const challenge = s.challenge, mode = chessSettings(s).mode;
    if (active !== s.activeParticipant || chess.isCheck() || chess.isGameOver() || !moveShape(challenge.move)) return false;
    if ([challenge.assisted, challenge.extended].some(v => v !== undefined && typeof v !== "boolean") || (mode !== "CHAOS" && (challenge.assisted || challenge.extended))) return false;
    const move = legalMove(s.fen, challenge.move);
    if (!move || move.captured === "k" || (move.captured ?? null) !== challenge.piece || (mode !== "CLASSIC" && !move.captured)) return false;
    const multipliers = mode === "CLASSIC" || challenge.assisted ? [1, 2, 3] : BATTLE_RULES[move.captured!];
    return challenge.target.segment === s.lastTarget && JSON.stringify(challenge.target.multipliers) === JSON.stringify(multipliers);
  } catch { return false; }
}
export type { ChessMove, Square };
