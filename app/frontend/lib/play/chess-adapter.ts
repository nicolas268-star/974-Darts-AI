import { Chess, type Move, type Square } from "chess.js";

export type ChessMove = { from: Square; to: Square; promotion?: "q" | "r" | "b" | "n" };
export const chessPosition = (fen?: string) => new Chess(fen);
export const positionKey = (fen: string) => fen.split(" ").slice(0, 4).join(" ");
export function legalMove(fen: string, input: ChessMove): Move | undefined {
  return chessPosition(fen).moves({ verbose: true }).find(m => m.from === input.from && m.to === input.to && m.promotion === input.promotion);
}
// A Battle pass is an explicit variant rule. chess.js clears en passant and updates
// move counters while retaining castling rights. A checked king can NEVER pass.
export function passTurn(fen: string): string {
  const chess = chessPosition(fen);
  if (chess.isCheck()) throw new Error("Impossible de passer en échec.");
  chess.move(null);
  return chess.fen();
}
