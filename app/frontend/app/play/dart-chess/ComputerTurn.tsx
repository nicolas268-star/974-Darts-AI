"use client";

import { useEffect, useRef, useState } from "react";
import { advanceComputerChallenge } from "@/lib/play/dart-chess-ai";
import { chessSettings, requestChessMove, type ChessMove, type DartChessState } from "@/lib/play/dart-chess-engine";

type Props = { game: DartChessState; blocked: boolean; act: (action: (game: DartChessState) => DartChessState) => void };
export function ComputerTurn({ game, blocked, act }: Props) {
  const action = useRef(act);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { action.current = act; }, [act]);
  useEffect(() => {
    if (blocked) return;
    let alive = true, worker: Worker | null = null;
    const apply = (update: (state: DartChessState) => DartChessState) => {
      if (!alive) return;
      action.current(current => current.fen === game.fen && current.eventNumber === game.eventNumber && current.aiSeed === game.aiSeed ? update(current) : current);
    };
    const timer = window.setTimeout(() => {
      if (game.phase !== "SELECT_MOVE") { apply(advanceComputerChallenge); return; }
      try {
        worker = new Worker(new URL("./dart-chess-ai.worker.ts", import.meta.url));
        worker.onmessage = (event: MessageEvent<{ move?: ChessMove; error?: string }>) => {
          if (!alive) return;
          if (event.data.move) apply(s => requestChessMove(s, event.data.move!));
          else setError(event.data.error || "Aucun coup calculé.");
          worker?.terminate();
        };
        worker.onerror = () => { if (alive) setError("Calcul IA indisponible. Réessayez."); worker?.terminate(); };
        worker.postMessage({ fen: game.fen, difficulty: chessSettings(game).difficulty });
      } catch { if (alive) setError("Ce navigateur n’a pas démarré le calcul IA. Réessayez."); }
    }, game.phase === "SELECT_MOVE" ? 450 : 850);
    return () => { alive = false; window.clearTimeout(timer); worker?.terminate(); };
  }, [game, blocked, attempt]);
  return <div className="dc-ai" role="status">{error ? <><p>{error}</p><button disabled={blocked} onClick={() => { setError(""); setAttempt(n => n + 1); }}>Réessayer le calcul IA</button></> : blocked ? "IA en attente · reprenez la saisie ou le tour pour continuer." : game.phase === "SELECT_MOVE" ? "L’IA réfléchit…" : "L’IA lance ses fléchettes simulées…"}</div>;
}
