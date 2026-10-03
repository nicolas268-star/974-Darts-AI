import { Chess, type Move, type PieceSymbol } from "chess.js";
import { makeDart } from "../x01/engine";
import { applyChessDart, chessSettings, isComputerTurn, retryKingCheckout, activateChaosPower, type AIDifficulty, type ChessMove, type DartChessState } from "./dart-chess-engine";

const VALUE: Record<PieceSymbol, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const LEVELS = { EASY: { depth: 1, nodes: 150, single: .65, double: .18, triple: .12 }, MEDIUM: { depth: 2, nodes: 1000, single: .82, double: .35, triple: .25 }, HARD: { depth: 3, nodes: 3500, single: .94, double: .55, triple: .42 } };
function evaluate(chess: Chess): number {
  let score = 0;
  for (const row of chess.board()) for (const p of row) {
    if (!p) continue;
    const file = p.square.charCodeAt(0) - 97, rank = Number(p.square[1]) - 1;
    const center = (3.5 - Math.abs(file - 3.5)) + (3.5 - Math.abs(rank - 3.5));
    const advance = p.color === "w" ? rank : 7 - rank;
    const positional = p.type === "p" ? advance * 8 + center * 2 : ["n", "b"].includes(p.type) ? center * 9 : center;
    score += (p.color === "w" ? 1 : -1) * (VALUE[p.type] + positional);
  }
  return (chess.turn() === "w" ? 1 : -1) * score;
}
const priority = (m: Move) => (m.captured ? 10 * VALUE[m.captured] - VALUE[m.piece] : 0) + (m.promotion ? VALUE[m.promotion] : 0) + (/[+#]/.test(m.san) ? 50 : 0);
/** Deterministic, bounded casual chess AI. Runs in a Web Worker in the UI. */
export function chooseComputerMove(fen: string, difficulty: AIDifficulty): ChessMove | null {
  const chess = new Chess(fen), level = LEVELS[difficulty];
  let nodes = 0;
  function search(depth: number, alpha: number, beta: number, ply: number): number {
    nodes++;
    const moves = chess.moves({ verbose: true });
    if (!moves.length) return chess.isCheck() ? -100000 + ply : 0;
    if (chess.isDraw()) return 0;
    if (!depth || nodes >= level.nodes) return evaluate(chess);
    let best = -Infinity;
    for (const m of moves.sort((a, b) => priority(b) - priority(a))) {
      chess.move(m); const score = -search(depth - 1, -beta, -alpha, ply + 1); chess.undo();
      best = Math.max(best, score); alpha = Math.max(alpha, score);
      if (alpha >= beta || nodes >= level.nodes) break;
    }
    return best;
  }
  const moves = chess.moves({ verbose: true }).sort((a, b) => priority(b) - priority(a));
  let best: Move | null = null, bestScore = -Infinity;
  // Every root move gets at least a static evaluation, even after the search budget.
  for (const move of moves) {
    chess.move(move);
    const score = -search(nodes >= level.nodes ? 0 : level.depth - 1, -Infinity, Infinity, 1);
    chess.undo();
    if (score > bestScore) { bestScore = score; best = move; }
  }
  return best ? { from: best.from, to: best.to, ...(best.promotion ? { promotion: best.promotion as ChessMove["promotion"] } : {}) } : null;
}
/** One simulated dart or power per step, using the same Battle rules as a human. */
export function advanceComputerChallenge(state: DartChessState): DartChessState {
  if (!isComputerTurn(state) || !state.challenge) return state;
  if (state.phase === "KING_CHECKOUT" && state.challenge.darts.length === 3) return retryKingCheckout(state);
  if (state.phase === "CAPTURE_CHALLENGE" && !state.challenge.darts.length && chessSettings(state).mode === "CHAOS") {
    if (state.challenge.target.multipliers.length !== 3 && state.energy![state.activeParticipant] >= 1) return activateChaosPower(state, "PRECISION");
    if (!state.challenge.extended && state.energy![state.activeParticipant] >= 2) return activateChaosPower(state, "REINFORCEMENT");
  }
  const seed = (Math.imul(state.aiSeed!, 1664525) + 1013904223) >>> 0;
  const nextSeed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const target = state.challenge.target, level = LEVELS[chessSettings(state).difficulty];
  const probability = target.multipliers.length === 3 || target.multipliers[0] === 1 ? level.single : target.multipliers[0] === 2 ? level.double : level.triple;
  const success = seed / 4294967296 < probability;
  // A failed aim lands elsewhere (or misses), never silently counts as the objective.
  const segment = nextSeed % 5 === 0 ? 0 : (target.segment + 1 + nextSeed % 19 - 1) % 20 + 1;
  const multiplier = segment === 0 ? 0 : nextSeed % 10 === 0 ? 3 : nextSeed % 4 === 0 ? 2 : 1;
  const dart = success ? makeDart(target.segment, target.multipliers[0] as 1 | 2 | 3) : makeDart(segment, multiplier);
  return applyChessDart({ ...state, aiSeed: nextSeed }, { source: "computer", dart });
}
