import { chooseComputerMove } from "@/lib/play/dart-chess-ai";
import type { AIDifficulty } from "@/lib/play/dart-chess-engine";
self.onmessage = (event: MessageEvent<{ fen: string; difficulty: AIDifficulty }>) => {
  try { self.postMessage({ move: chooseComputerMove(event.data.fen, event.data.difficulty) }); }
  catch { self.postMessage({ error: "Le calcul du coup a échoué." }); }
};
