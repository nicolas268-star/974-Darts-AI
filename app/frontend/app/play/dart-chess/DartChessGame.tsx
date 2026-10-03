"use client";

import { useState } from "react";
import { SQUARES, type PieceSymbol, type Square } from "chess.js";
import { useSyncedGame } from "@/components/play/useSyncedGame";
import { LocalSessionBar } from "@/components/play/LocalSessionBar";
import { DartEntry } from "@/components/play/DartEntry";
import { ComputerTurn } from "./ComputerTurn";
import { chessSettings, dartLimit, isComputerTurn, activateChaosPower, DEFAULT_SETTINGS, MODE_NAMES, type ChessSettings } from "@/lib/play/dart-chess-engine";
import { chessPosition } from "@/lib/play/chess-adapter";
import { applyChessDart, createDartChess, PIECE_NAMES, requestChessMove, resignDartChess, retryKingCheckout, targetLabel, type DartChessState } from "@/lib/play/dart-chess-engine";

const glyphs: Record<PieceSymbol, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
function Rules() {
  return <details className="dc-rules"><summary>Comment jouer à Dart Chess ?</summary>
    <p>Choisissez une pièce puis une case proposée. Les coups suivent les règles des échecs ; le roi ne se capture jamais.</p>
    <ul><li><strong>Classic :</strong> déclarez un coup, puis touchez le numéro demandé (simple, double ou triple) en 3 fléchettes. Le mat termine la partie.</li>
    <li><strong>Battle :</strong> déplacements libres. Capture d’un pion = numéro (S/D/T), cavalier = simple, fou ou tour = double, dame = triple.</li>
    <li><strong>Chaos :</strong> règles Battle + Bull 50 joker pour toute capture. Pendant les défis, double = +1 énergie, triple = +2, 25 = +1, Bull = +3 (maximum 6 ; départ à 2). Avant le premier dart : Précision coûte 1 énergie et accepte S/D/T ; Renfort coûte 2 et donne un quatrième dart. Chaque pouvoir s’utilise une fois par défi.</li></ul>
    <p>Défi raté : mouvement annulé et tour perdu. En échec, tous les coups légaux de défense sont automatiques, dans les trois modes.</p>
    <p>Battle et Chaos : après le mat, terminez sur D20 (King Checkout). L’échiquier reste figé ; après trois ratés, retirez les fléchettes puis relancez. Le Bull joker ne remplace pas ce D20.</p>
    <p>Pat, matériel insuffisant, troisième répétition ou 50 coups sans prise ni mouvement de pion : match nul.</p>
    <p>IA de loisir : trois niveaux d’anticipation et de précision ; ses lancers sont simulés et identifiés « IA ». L’annulation met l’IA en pause pour permettre une correction.</p>
    <p>PC / téléphone : activez la synchronisation ci-dessous et ouvrez le lien avec le même compte. Un seul appareil commande la partie et fait jouer l’IA ; les autres suivent. Une sauvegarde V1 reprend en Battle à deux humains.</p>
  </details>;
}
export function DartChessGame({ userId, currentDisplayName }: { userId: string; currentDisplayName: string }) {
  const { game, history, start, act, undo, controls } = useSyncedGame<DartChessState>("dartchess", userId);
  const [names, setNames] = useState([currentDisplayName, "Noirs"]);
  const [selection, setSelection] = useState<{ square: Square; fen: string } | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square; fen: string } | null>(null);
  const [confirm, setConfirm] = useState<"undo" | "resign" | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [settings, setSettings] = useState<ChessSettings>({ ...DEFAULT_SETTINGS });
  const [aiPaused, setAiPaused] = useState(false);
  const blocked = controls.busy || Boolean(controls.blocked) || controls.problem === "conflict";
  const sessionControls = { ...controls, reset: () => {
    if (game) { setNames(game.sideNames.map((name, i) => chessSettings(game).aiSide === i ? (i === 0 ? currentDisplayName : "Noirs") : name)); setSettings({ ...chessSettings(game) }); }
    setAiPaused(false);
    setSelection(null); setPromotion(null); setConfirm(null); controls.reset();
  } };
  if (!controls.ready) return <LocalSessionBar controls={sessionControls} />;
  if (!game) return <div className="dc-shell"><header className="dc-hero"><span>974DARTS PLAY · STRATÉGIE & PRÉCISION</span><h1>Dart Chess <em>Classic · Battle · Chaos</em></h1><p>Pensez votre coup. Gagnez votre capture.</p></header>
    <section className="dc-setup"><h2>Votre partie, votre mode</h2><p>Les blancs commencent. Posez votre téléphone ou tablette près de la zone de lancer.</p><div className="dc-settings">
      <label>Mode de jeu<select aria-label="Mode de jeu" disabled={blocked} value={settings.mode} onChange={e => setSettings({ ...settings, mode: e.target.value as ChessSettings["mode"] })}><option value="CLASSIC">Classic · valider chaque coup</option><option value="BATTLE">Battle · gagner les captures</option><option value="CHAOS">Chaos · captures et pouvoirs</option></select></label>
      <label>Adversaire<select aria-label="Adversaire" disabled={blocked} value={settings.aiSide === null ? "HUMAN" : "AI"} onChange={e => setSettings({ ...settings, aiSide: e.target.value === "HUMAN" ? null : 1 })}><option value="HUMAN">Deux humains</option><option value="AI">Jouer contre l’IA</option></select></label>
      {settings.aiSide !== null ? <><label>Niveau IA<select aria-label="Niveau IA" disabled={blocked} value={settings.difficulty} onChange={e => setSettings({ ...settings, difficulty: e.target.value as ChessSettings["difficulty"] })}><option value="EASY">Découverte</option><option value="MEDIUM">Intermédiaire</option><option value="HARD">Avancé</option></select></label><label>Votre couleur<select aria-label="Votre couleur" disabled={blocked} value={settings.aiSide === 1 ? "WHITE" : "BLACK"} onChange={e => setSettings({ ...settings, aiSide: e.target.value === "WHITE" ? 1 : 0 })}><option value="WHITE">Blancs · vous commencez</option><option value="BLACK">Noirs · l’IA commence</option></select></label></> : null}
      </div><div className="dc-names">{names.map((name, i) => <label key={i}>{i === 0 ? "♔ Joueur blanc" : "♚ Joueur noir"}<input disabled={blocked || settings.aiSide === i} value={settings.aiSide === i ? "IA 974Darts" : name} maxLength={80} onChange={e => setNames(current => current.map((n, j) => i === j ? e.target.value : n))} /></label>)}</div>
      <button className="dc-primary" disabled={blocked} onClick={() => start(createDartChess(names.map((name, i) => settings.aiSide === i ? "IA 974Darts" : name), crypto.getRandomValues(new Uint32Array(1))[0], settings))}>Commencer la partie →</button></section><Rules /><LocalSessionBar controls={sessionControls} /></div>;
  const chess = chessPosition(game.fen), finished = game.phase === "GAME_OVER";
  const options = chessSettings(game), computerTurn = isComputerTurn(game);
  const inputBlocked = blocked || computerTurn || Boolean(confirm);
  const selected = selection?.fen === game.fen && game.phase === "SELECT_MOVE" ? selection.square : null;
  const promoting = promotion?.fen === game.fen && game.phase === "SELECT_MOVE" ? promotion : null;
  const legal = selected ? chess.moves({ square: selected, verbose: true }) : [];
  const destinations = new Set(legal.map(m => m.to));
  const blackView = autoRotate && (options.aiSide === null ? game.activeParticipant === 1 : options.aiSide === 0);
  const squares = blackView ? [...SQUARES].reverse() : SQUARES;
  const player = game.sideNames[game.activeParticipant];
  const status = finished ? (game.winnerSide === "DRAW" ? "Match nul" : `${game.sideNames[game.winnerSide]} gagne`) : game.phase === "KING_CHECKOUT" ? "King Checkout · D20" : game.phase === "CAPTURE_CHALLENGE" ? (game.challenge.piece ? `Capture du ${PIECE_NAMES[game.challenge.piece]}` : "Validez votre déplacement") : chess.isCheck() ? "Échec · sauvez votre roi" : "Choisissez votre coup";
  function play(from: Square, to: Square, piece?: "q" | "r" | "b" | "n") {
    act(g => requestChessMove(g, { from, to, ...(piece ? { promotion: piece } : {}) })); setSelection(null); setPromotion(null);
  }
  function select(square: Square) {
    if (inputBlocked || game?.phase !== "SELECT_MOVE" || promoting) return;
    if (selected && destinations.has(square)) {
      if (legal.some(m => m.to === square && m.promotion)) setPromotion({ from: selected, to: square, fen: game.fen });
      else play(selected, square);
    } else setSelection(chess.get(square)?.color === chess.turn() && selected !== square ? { square, fen: game.fen } : null);
  }
  return <div className="dc-shell">
    <header className="dc-match-header"><div><span>974DARTS · {MODE_NAMES[options.mode].toUpperCase()}{options.aiSide !== null ? " · VS IA" : ""}</span><h1>Dart Chess</h1></div><div className="dc-action-buttons"><button disabled={blocked || !history.length} onClick={() => { setAiPaused(true); setConfirm("undo"); }}>↶ Annuler dernière action</button>{!finished ? <button disabled={blocked} onClick={() => { setAiPaused(true); setConfirm("resign"); }}>Abandonner</button> : null}</div></header>
    {confirm ? <section className="dc-confirm" role="alertdialog" aria-modal="false" aria-label="Confirmer l’action"><p>{confirm === "undo" ? "Annuler la dernière action enregistrée ? L’échiquier et le défi seront restaurés ensemble." : `${game.sideNames[options.aiSide === null ? game.activeParticipant : 1 - options.aiSide]}, confirmer votre abandon ?`}</p><button disabled={blocked} onClick={() => { if (confirm === "undo") undo(); else act(resignDartChess); setConfirm(null); setSelection(null); setPromotion(null); }}>Confirmer</button><button onClick={() => { setConfirm(null); setAiPaused(false); }}>Continuer à jouer</button></section> : null}
    <div className="dc-players">{game.sideNames.map((name, i) => <div key={i} className={i === game.activeParticipant && !finished ? "active" : ""}><span>{i === 0 ? "♔ Blancs" : "♚ Noirs"}</span><strong>{name}</strong><small>{!finished && i === game.activeParticipant ? "À vous de jouer" : i === 0 ? "Camp blanc" : "Camp noir"}</small></div>)}</div>
    <div className="dc-layout"><section className="dc-board-section" aria-label="Échiquier"><div className="dc-board" aria-label="64 cases">{squares.map(square => {
      const piece = chess.get(square), light = (square.charCodeAt(0) + Number(square[1])) % 2 !== 0;
      const last = game.lastMove?.from === square || game.lastMove?.to === square;
      const check = piece?.type === "k" && piece.color === chess.turn() && chess.isCheck();
      return <button type="button" key={square} data-square={square} aria-pressed={selected === square} aria-label={`${square}${piece ? ` ${PIECE_NAMES[piece.type]} ${piece.color === "w" ? "blanc" : "noir"}` : " vide"}${destinations.has(square) ? " · déplacement légal" : ""}`} className={`dc-square ${light ? "light" : "dark"} ${last ? "last" : ""} ${selected === square ? "selected" : ""} ${destinations.has(square) ? "legal" : ""} ${check ? "check" : ""}`} disabled={inputBlocked || game.phase !== "SELECT_MOVE" || Boolean(promoting)} onClick={() => select(square)}><small aria-hidden="true">{square}</small>{piece ? <span aria-hidden="true" className={`dc-piece ${piece.color}`}>{glyphs[piece.type]}</span> : destinations.has(square) ? <span aria-hidden="true" className="dc-dot" /> : null}</button>;
    })}</div><label className="dc-orientation"><input type="checkbox" checked={autoRotate} onChange={e => setAutoRotate(e.target.checked)} />Orienter vers le joueur actif</label>
      <div className="dc-captured">{[0, 1].map(side => <div key={side}><small>Captures des {side === 0 ? "blancs" : "noirs"}</small><span>{game.captured.filter(c => c.by === side).map((c, i) => <span key={i} title={PIECE_NAMES[c.piece]}>{glyphs[c.piece]}</span>)}{!game.captured.some(c => c.by === side) ? "—" : null}</span></div>)}</div>
    </section><section className="dc-battle" aria-label="Dart Battle"><div className={`dc-status ${finished ? "finished" : ""}`} key={game.eventNumber} role="status" aria-live="polite"><span>{finished ? "PARTIE TERMINÉE" : `TOUR ${game.ply + 1} · ${player}`}</span><h2>{status}</h2><p>{game.log[0]?.result ?? "Les blancs commencent."}</p></div>
      {options.mode === "CHAOS" ? <div className="dc-chaos"><strong>Énergie · {game.sideNames[0]} : {game.energy![0]}/6 · {game.sideNames[1]} : {game.energy![1]}/6</strong>{game.phase === "CAPTURE_CHALLENGE" ? <><p>Bull 50 = capture joker. Pouvoirs disponibles avant le premier dart.</p><div><button disabled={inputBlocked || !!game.challenge.darts.length || game.challenge.target.multipliers.length === 3 || game.energy![game.activeParticipant] < 1} onClick={() => act(s => activateChaosPower(s, "PRECISION"))}>Précision · 1 énergie</button><button disabled={inputBlocked || !!game.challenge.darts.length || !!game.challenge.extended || game.energy![game.activeParticipant] < 2} onClick={() => act(s => activateChaosPower(s, "REINFORCEMENT"))}>Renfort · 2 énergies</button></div></> : null}</div> : null}
      {computerTurn ? <><ComputerTurn game={game} blocked={blocked || aiPaused || Boolean(confirm)} act={act} /><button className="dc-primary" disabled={blocked || Boolean(confirm)} onClick={() => setAiPaused(value => !value)}>{aiPaused ? "Reprendre le tour IA" : "Mettre l’IA en pause"}</button></> : aiPaused && options.aiSide !== null ? <button className="dc-primary" onClick={() => setAiPaused(false)}>Réactiver l’IA après correction</button> : null}
      {promoting ? <div className="dc-promotion" role="group" aria-label="Choisir la promotion"><h3>Promotion du pion</h3>{(["q", "r", "b", "n"] as const).map(p => <button disabled={inputBlocked} key={p} onClick={() => play(promoting.from, promoting.to, p)}>{glyphs[p]} {PIECE_NAMES[p]}</button>)}<button onClick={() => setPromotion(null)}>Retour à l’échiquier</button></div> : null}
      {game.phase === "SELECT_MOVE" && !promoting && !computerTurn ? <p className="dc-instruction">{selected ? `${PIECE_NAMES[chess.get(selected)!.type]} ${selected} · choisissez une case marquée.` : "Touchez une de vos pièces pour voir ses déplacements légaux."}{chess.isCheck() ? " Capture de défense : aucun défi requis." : ""}</p> : null}
      {game.challenge ? <><div className="dc-target"><small>OBJECTIF À TOUCHER</small><strong>{targetLabel(game.challenge.target)}</strong><span>{game.phase === "CAPTURE_CHALLENGE" ? `${game.challenge.move.from} → ${game.challenge.move.to}` : "Échiquier figé jusqu’au D20"}</span><b>{dartLimit(game) - game.challenge.darts.length} fléchette(s) restante(s)</b><div className="dc-darts">{Array.from({ length: dartLimit(game) }, (_, i) => <span key={i}>{game.challenge?.darts[i]?.dart.label ?? `Dart ${i + 1}`}</span>)}</div></div>
        <DartEntry disabled={inputBlocked || game.challenge.darts.length >= dartLimit(game)} pending={controls.busy} focusKey={game.eventNumber} onDart={dart => act(g => applyChessDart(g, { source: "manual", dart }))} />
        {game.phase === "KING_CHECKOUT" && game.challenge.darts.length === 3 ? <button className="dc-primary" disabled={inputBlocked} onClick={() => act(retryKingCheckout)}>Fléchettes retirées · nouvelle volée</button> : null}
        <p className="dc-instruction">Saisissez chaque impact réel, même un raté. L’objectif est atteint dès le premier impact valide.</p></> : null}
      {finished ? <p className="dc-instruction">Partie conservée. Vous pouvez corriger la dernière action ou démarrer une nouvelle partie ci-dessous.</p> : null}
    </section></div>
    <Rules /><section className="dc-history"><h2>Dernières actions</h2>{game.log.length ? <ol>{game.log.map(e => <li key={e.id}><strong>{game.sideNames[e.participant]}</strong><b>{e.dart}</b><span>{e.result}</span></li>)}</ol> : <p>Aucun coup joué.</p>}</section><LocalSessionBar controls={sessionControls} />
  </div>;
}
