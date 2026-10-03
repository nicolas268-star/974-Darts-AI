"use client";

import { useState } from "react";
import { SQUARES, type PieceSymbol, type Square } from "chess.js";
import { useLocalGame } from "@/components/play/useLocalGame";
import { LocalSessionBar } from "@/components/play/LocalSessionBar";
import { DartEntry } from "@/components/play/DartEntry";
import { chessPosition } from "@/lib/play/chess-adapter";
import { applyChessDart, createDartChess, PIECE_NAMES, requestChessMove, resignDartChess, retryKingCheckout, targetLabel, type DartChessState } from "@/lib/play/dart-chess-engine";

const glyphs: Record<PieceSymbol, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
function Rules() {
  return <details className="dc-rules"><summary>Comment jouer à Dart Chess Battle ?</summary>
    <ol><li>Choisissez une pièce puis une case proposée. Les déplacements sans capture sont libres.</li><li>Pour capturer, réussissez l’objectif en 3 fléchettes maximum : pion = numéro demandé (S/D/T), cavalier = simple précis, fou et tour = double, dame = triple. Le numéro varie à chaque défi.</li><li>Trois ratés : la pièce reste en place et vous perdez le tour. Retirez vos fléchettes avant de passer au joueur suivant.</li><li>Votre roi est en échec ? Sauvez-le avec un coup légal. Les captures de défense sont automatiques.</li><li>Échec et mat : l’échiquier est figé. Le joueur qui a maté termine sur D20. Trois ratés ? Retirez vos fléchettes et recommencez. Le roi ne se capture jamais.</li><li>Pat, matériel insuffisant, troisième répétition ou 50 coups sans prise ni mouvement de pion : match nul.</li></ol>
    <p>Deux humains sur le même écran. Sauvegarde sur ce navigateur. Pas de synchronisation PC / téléphone dans cette V1.</p>
  </details>;
}
export function DartChessGame({ userId, currentDisplayName }: { userId: string; currentDisplayName: string }) {
  const { game, history, start, act, undo, controls } = useLocalGame<DartChessState>("dartchess", userId);
  const [names, setNames] = useState([currentDisplayName, "Noirs"]);
  const [selection, setSelection] = useState<{ square: Square; fen: string } | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square; fen: string } | null>(null);
  const [confirm, setConfirm] = useState<"undo" | "resign" | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const blocked = controls.busy || controls.problem === "conflict";
  const sessionControls = { ...controls, reset: () => {
    if (game) setNames([...game.sideNames]);
    setSelection(null); setPromotion(null); setConfirm(null); controls.reset();
  } };
  if (!controls.ready) return <LocalSessionBar controls={sessionControls} />;
  if (!game) return <div className="dc-shell"><header className="dc-hero"><span>974DARTS PLAY · STRATÉGIE & PRÉCISION</span><h1>Dart Chess <em>Battle</em></h1><p>Pensez votre coup. Gagnez votre capture.</p></header>
    <section className="dc-setup"><h2>Deux joueurs, une cible</h2><p>Les blancs commencent. Posez votre téléphone ou tablette près de la zone de lancer.</p><div className="dc-names">{names.map((name, i) => <label key={i}>{i === 0 ? "♔ Joueur blanc" : "♚ Joueur noir"}<input value={name} maxLength={80} onChange={e => setNames(current => current.map((n, j) => i === j ? e.target.value : n))} /></label>)}</div>
      <button className="dc-primary" disabled={blocked} onClick={() => start(createDartChess(names, crypto.getRandomValues(new Uint32Array(1))[0]))}>Commencer la partie →</button></section><Rules /><LocalSessionBar controls={sessionControls} /></div>;
  const chess = chessPosition(game.fen), finished = game.phase === "GAME_OVER";
  const selected = selection?.fen === game.fen && game.phase === "SELECT_MOVE" ? selection.square : null;
  const promoting = promotion?.fen === game.fen && game.phase === "SELECT_MOVE" ? promotion : null;
  const legal = selected ? chess.moves({ square: selected, verbose: true }) : [];
  const destinations = new Set(legal.map(m => m.to));
  const blackView = autoRotate && game.activeParticipant === 1;
  const squares = blackView ? [...SQUARES].reverse() : SQUARES;
  const player = game.sideNames[game.activeParticipant];
  const status = finished ? (game.winnerSide === "DRAW" ? "Match nul" : `${game.sideNames[game.winnerSide]} gagne`) : game.phase === "KING_CHECKOUT" ? "King Checkout · D20" : game.phase === "CAPTURE_CHALLENGE" ? `Capture du ${PIECE_NAMES[game.challenge.piece]}` : chess.isCheck() ? "Échec · sauvez votre roi" : "Choisissez votre coup";
  function play(from: Square, to: Square, piece?: "q" | "r" | "b" | "n") {
    act(g => requestChessMove(g, { from, to, ...(piece ? { promotion: piece } : {}) })); setSelection(null); setPromotion(null);
  }
  function select(square: Square) {
    if (blocked || game?.phase !== "SELECT_MOVE" || promoting) return;
    if (selected && destinations.has(square)) {
      if (legal.some(m => m.to === square && m.promotion)) setPromotion({ from: selected, to: square, fen: game.fen });
      else play(selected, square);
    } else setSelection(chess.get(square)?.color === chess.turn() && selected !== square ? { square, fen: game.fen } : null);
  }
  return <div className="dc-shell">
    <header className="dc-match-header"><div><span>974DARTS · BATTLE</span><h1>Dart Chess</h1></div><div className="dc-action-buttons"><button disabled={blocked || !history.length} onClick={() => setConfirm("undo")}>↶ Annuler dernière action</button>{!finished ? <button disabled={blocked} onClick={() => setConfirm("resign")}>Abandonner</button> : null}</div></header>
    {confirm ? <section className="dc-confirm" role="alertdialog" aria-modal="false" aria-label="Confirmer l’action"><p>{confirm === "undo" ? "Annuler la dernière action enregistrée ? L’échiquier et le défi seront restaurés ensemble." : `${player}, confirmer votre abandon ?`}</p><button disabled={blocked} onClick={() => { if (confirm === "undo") undo(); else act(resignDartChess); setConfirm(null); setSelection(null); setPromotion(null); }}>Confirmer</button><button onClick={() => setConfirm(null)}>Continuer à jouer</button></section> : null}
    <div className="dc-players">{game.sideNames.map((name, i) => <div key={i} className={i === game.activeParticipant && !finished ? "active" : ""}><span>{i === 0 ? "♔ Blancs" : "♚ Noirs"}</span><strong>{name}</strong><small>{!finished && i === game.activeParticipant ? "À vous de jouer" : i === 0 ? "Camp blanc" : "Camp noir"}</small></div>)}</div>
    <div className="dc-layout"><section className="dc-board-section" aria-label="Échiquier"><div className="dc-board" aria-label="64 cases">{squares.map(square => {
      const piece = chess.get(square), light = (square.charCodeAt(0) + Number(square[1])) % 2 !== 0;
      const last = game.lastMove?.from === square || game.lastMove?.to === square;
      const check = piece?.type === "k" && piece.color === chess.turn() && chess.isCheck();
      return <button type="button" key={square} data-square={square} aria-pressed={selected === square} aria-label={`${square}${piece ? ` ${PIECE_NAMES[piece.type]} ${piece.color === "w" ? "blanc" : "noir"}` : " vide"}${destinations.has(square) ? " · déplacement légal" : ""}`} className={`dc-square ${light ? "light" : "dark"} ${last ? "last" : ""} ${selected === square ? "selected" : ""} ${destinations.has(square) ? "legal" : ""} ${check ? "check" : ""}`} disabled={blocked || game.phase !== "SELECT_MOVE" || Boolean(promoting) || Boolean(confirm)} onClick={() => select(square)}><small aria-hidden="true">{square}</small>{piece ? <span aria-hidden="true" className={`dc-piece ${piece.color}`}>{glyphs[piece.type]}</span> : destinations.has(square) ? <span aria-hidden="true" className="dc-dot" /> : null}</button>;
    })}</div><label className="dc-orientation"><input type="checkbox" checked={autoRotate} onChange={e => setAutoRotate(e.target.checked)} />Orienter vers le joueur actif</label>
      <div className="dc-captured">{[0, 1].map(side => <div key={side}><small>Captures des {side === 0 ? "blancs" : "noirs"}</small><span>{game.captured.filter(c => c.by === side).map((c, i) => <span key={i} title={PIECE_NAMES[c.piece]}>{glyphs[c.piece]}</span>)}{!game.captured.some(c => c.by === side) ? "—" : null}</span></div>)}</div>
    </section><section className="dc-battle" aria-label="Dart Battle"><div className={`dc-status ${finished ? "finished" : ""}`} key={game.eventNumber} role="status" aria-live="polite"><span>{finished ? "PARTIE TERMINÉE" : `TOUR ${game.ply + 1} · ${player}`}</span><h2>{status}</h2><p>{game.log[0]?.result ?? "Les blancs commencent."}</p></div>
      {promoting ? <div className="dc-promotion" role="group" aria-label="Choisir la promotion"><h3>Promotion du pion</h3>{(["q", "r", "b", "n"] as const).map(p => <button disabled={blocked} key={p} onClick={() => play(promoting.from, promoting.to, p)}>{glyphs[p]} {PIECE_NAMES[p]}</button>)}<button onClick={() => setPromotion(null)}>Retour à l’échiquier</button></div> : null}
      {game.phase === "SELECT_MOVE" && !promoting ? <p className="dc-instruction">{selected ? `${PIECE_NAMES[chess.get(selected)!.type]} ${selected} · choisissez une case marquée.` : "Touchez une de vos pièces pour voir ses déplacements légaux."}{chess.isCheck() ? " Capture de défense : aucun défi requis." : ""}</p> : null}
      {game.challenge ? <><div className="dc-target"><small>OBJECTIF À TOUCHER</small><strong>{targetLabel(game.challenge.target)}</strong><span>{game.phase === "CAPTURE_CHALLENGE" ? `${game.challenge.move.from} → ${game.challenge.move.to}` : "Échiquier figé jusqu’au D20"}</span><b>{3 - game.challenge.darts.length} fléchette(s) restante(s)</b><div className="dc-darts">{[0, 1, 2].map(i => <span key={i}>{game.challenge?.darts[i]?.dart.label ?? `Dart ${i + 1}`}</span>)}</div></div>
        <DartEntry disabled={blocked || Boolean(confirm) || game.challenge.darts.length === 3} pending={controls.busy} focusKey={game.eventNumber} onDart={dart => act(g => applyChessDart(g, { source: "manual", dart }))} />
        {game.phase === "KING_CHECKOUT" && game.challenge.darts.length === 3 ? <button className="dc-primary" disabled={blocked || Boolean(confirm)} onClick={() => act(retryKingCheckout)}>Fléchettes retirées · nouvelle volée</button> : null}
        <p className="dc-instruction">Saisissez chaque impact réel, même un raté. L’objectif est atteint dès le premier impact valide.</p></> : null}
      {finished ? <p className="dc-instruction">Partie conservée. Vous pouvez corriger la dernière action ou démarrer une nouvelle partie ci-dessous.</p> : null}
    </section></div>
    <Rules /><section className="dc-history"><h2>Dernières actions</h2>{game.log.length ? <ol>{game.log.map(e => <li key={e.id}><strong>{game.sideNames[e.participant]}</strong><b>{e.dart}</b><span>{e.result}</span></li>)}</ol> : <p>Aucun coup joué.</p>}</section><LocalSessionBar controls={sessionControls} />
  </div>;
}
