"use client";

import type { DartThrow } from "@/lib/x01/engine";
import { DartEntry } from "./DartEntry";
import { VisitProgress } from "./VisitProgress";

type Props = {
  player: string; nextPlayer: string; darts: string[]; finished?: boolean; complete?: boolean; blocked?: boolean; pending?: boolean;
  onDart: (dart: DartThrow) => void; onNext: () => void;
  onUndo: () => void; canUndo: boolean; hint?: string; defaultMultiplier?: 1 | 2 | 3;
};

export function TurnPanel({ player, nextPlayer, darts, finished = false, blocked = false, pending = false, complete = darts.length >= 3, onDart, onNext, onUndo, canUndo, hint, defaultMultiplier }: Props) {
  return <section className="play-turn-panel" aria-label="Saisie de la volée">
    <header><div><small>{finished ? "DERNIER LANCER" : "AU LANCER"}</small><h2>{player}</h2>{hint ? <p>{hint}</p> : null}</div>
      {!finished ? <span>Ensuite : <b>{nextPlayer}</b></span> : null}
    </header>
    <VisitProgress darts={darts} complete={complete} finished={finished} />
    {!finished ? <DartEntry onDart={onDart} pending={pending} disabled={complete || blocked} focusKey={player + "-" + darts.length} defaultMultiplier={defaultMultiplier} /> : null}
    <div className="play-turn-actions"><button type="button" disabled={!canUndo || blocked || pending} onClick={onUndo}>Annuler la dernière action</button>
      {!finished ? <button type="button" className="play-next" disabled={!complete || blocked || pending} onClick={onNext}>{nextPlayer === player ? "Volée suivante" : "Joueur suivant"} →</button> : null}
    </div>
  </section>;
}
