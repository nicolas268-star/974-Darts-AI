"use client";

import Link from "next/link";
import { useState } from "react";
import { useSyncedGame } from "./useSyncedGame";
import { LocalSessionBar } from "./LocalSessionBar";
import { ConquestBoard, ConquestScores } from "./ConquestBoard";
import { Flag, Grid3X3, Target, Trophy } from "lucide-react";
import { ParticipantSetup } from "./ParticipantSetup";
import { TurnPanel } from "./TurnPanel";
import type { PlayFormat } from "@/lib/play/format";
import { applyFunDart, CONNECT_TARGETS, conquestScores, createFunGame, endFunVisit, type FunKind, type FunOptions, type FunState } from "@/lib/play/fun-engine";

const symbols = ["●", "◆", "▲", "■"];
const games = {
  connect4: { title: "Puissance 4", subtitle: "Visez une colonne. Alignez quatre pions.", icon: Grid3X3 },
  conquest: { title: "Conquête", subtitle: "Vingt territoires. Un monde à relier. Défendez votre empire.", icon: Flag },
  bull500: { title: "Bull 500", subtitle: "Débloquez le score au Bull. Faites la course à 500.", icon: Target },
};

function Rules({ kind, strategy = false }: { kind: FunKind; strategy?: boolean }) {
  return <div className="fun-rules">
    <strong>Les règles de cette version</strong>
    {kind === "connect4" ? <ul>
      <li>Grille de 7 colonnes et 6 lignes, associées aux secteurs 14 à 20. Un impact valide pose un seul pion en bas de la colonne.</li>
      <li>Trois essais maximum. Dès qu’un pion est posé, la volée se termine : validez le passage au joueur suivant. Une colonne pleine consomme un essai.</li>
      <li>Quatre pions de votre camp alignés horizontalement, verticalement ou en diagonale gagnent. Grille pleine sans alignement : match nul.</li>
      <li>Simple, double et triple acceptés, ou doubles uniquement selon votre choix. Solo pour pratiquer, 2 à 4 camps ou 2 équipes.</li>
    </ul> : kind === "conquest" ? <ul>
      <li>Variante 974Darts : les secteurs 1 à 20 sont des territoires. Chaque camp cumule ses propres marques : simple = 1, double = 2, triple = 3.</li>
      <li>Trois marques prennent un territoire libre ou adverse. À chaque prise, les marques de tous les camps sur ce territoire repartent à zéro.</li>
      <li>Toucher votre propre territoire ou le Bull ne change rien, mais consomme une fléchette. Les marques incomplètes restent entre les volées.</li>
      {strategy ? <><li>Chaque territoire possédé vaut 2 points. Chaque liaison entre deux de vos territoires voisins ajoute 1 point, compté une seule fois. Les routes maritimes en pointillés relient aussi des voisins.</li>
        <li>Une conquête isolée rapporte 2 points ; avec un voisin allié, 3 points ; avec deux voisins, 4 points. Perdre un territoire retire ses 2 points et ses liaisons : le score dépend des possessions actuelles.</li>
        <li>Le premier camp à atteindre l’objectif choisi (12, 18 ou 24 points) gagne immédiatement. Tous les secteurs restent accessibles : aucune obligation de viser un voisin.</li></> : <li>Mode classique : le premier camp à posséder simultanément le nombre de territoires choisi gagne.</li>}
      <li>Trois fléchettes par volée, sauf victoire. En doublettes, les territoires et les points sont partagés par l’équipe.</li>
    </ul> : <ul>
      <li>À chaque volée, touchez d’abord le Bull 50 (ou 25/50 selon l’option) pour débloquer le score. Ce premier Bull ne rapporte aucun point.</li>
      <li>Les fléchettes restantes marquent sur le secteur choisi : 20, 19 ou les deux. Simples, doubles et triples comptent à leur valeur.</li>
      <li>Le score se verrouille à nouveau à la volée suivante. Un Bull en troisième fléchette ne laisse aucun lancer pour marquer.</li>
      <li>Le premier camp à atteindre ou dépasser 500 gagne immédiatement. En équipe, le total est partagé.</li>
    </ul>}
  </div>;
}

export function FunGame({ kind, currentDisplayName, userId }: { kind: FunKind; currentDisplayName: string; userId: string }) {
  const config = games[kind];
  const [format, setFormat] = useState<PlayFormat>("DUEL");
  const [names, setNames] = useState([currentDisplayName || "Joueur 1", "Adversaire", "Joueur 3", "Joueur 4"]);
  const [options, setOptions] = useState<FunOptions>({ connectRule: "ANY", conquestGoal: 7, conquestMode: "CONNECTED", conquestPointsGoal: 18, bullUnlock: "50", bullTarget: "20" });
  const {game,history,start:saveStart,act,undo,controls}=useSyncedGame<FunState>(kind,userId);
  function start() {
    const selected: FunOptions = game?.kind === "connect4" ? {connectRule:game.rule} : game?.kind === "conquest" ? {conquestGoal:game.goal,conquestMode:game.strategy ? "CONNECTED" : "CLASSIC",conquestPointsGoal:game.strategy?.goal} : game?.kind === "bull500" ? {bullUnlock:game.unlock,bullTarget:game.target} : options;
    saveStart(createFunGame(kind,game?.format??format,game?.participants.map(p=>p.name)??names,selected));
  }
  if (!controls.ready) return <LocalSessionBar controls={controls}/>;
  if (!game && controls.sync?.active && controls.blocked) return <LocalSessionBar controls={controls} />;
  if (!game) return <div className="fun-shell"><LocalSessionBar controls={controls}/>
    <Link className="fun-back" href="/play">← Univers Jeux</Link>
    <header className="fun-hero"><div><span>JEUX FUN · 974DARTS</span><h1>{config.title}</h1><p>{config.subtitle}</p></div><config.icon aria-hidden="true" /></header>
    <ParticipantSetup format={format} onFormatChange={setFormat} names={names} onNameChange={(index, value) => setNames((current) => current.map((name, i) => i === index ? value : name))} note="Solo, jusqu’à 4 joueurs ou 2 vs 2. Les joueurs d’une même équipe partagent leur progression." />
    <section className="fun-options" aria-label="Options de la partie">
      {kind === "connect4" ? <label>Impacts acceptés<select value={options.connectRule} onChange={(e) => setOptions({ ...options, connectRule: e.target.value as FunOptions["connectRule"] })}><option value="ANY">Simples, doubles et triples</option><option value="DOUBLE">Doubles uniquement</option></select></label> : null}
      {kind === "conquest" ? <>
        <label>Mode de conquête<select value={options.conquestMode} onChange={(e) => setOptions({ ...options, conquestMode: e.target.value as FunOptions["conquestMode"] })}><option value="CONNECTED">Monde stratégique · bonus de liaison</option><option value="CLASSIC">Classique · nombre de territoires</option></select></label>
        {options.conquestMode === "CONNECTED" ? <label>Points pour gagner<select value={options.conquestPointsGoal} onChange={(e) => setOptions({ ...options, conquestPointsGoal: Number(e.target.value) as 12 | 18 | 24 })}><option value={12}>12 · partie courte</option><option value={18}>18 · stratégique</option><option value={24}>24 · partie longue</option></select></label> : <label>Territoires pour gagner<select value={options.conquestGoal} onChange={(e) => setOptions({ ...options, conquestGoal: Number(e.target.value) as 5 | 7 | 10 })}><option value={5}>5 · partie courte</option><option value={7}>7 · classique</option><option value={10}>10 · partie longue</option></select></label>}
      </> : null}
      {kind === "bull500" ? <>
        <label>Déblocage du score<select value={options.bullUnlock} onChange={(e) => setOptions({ ...options, bullUnlock: e.target.value as FunOptions["bullUnlock"] })}><option value="50">Bull 50 uniquement</option><option value="25_OR_50">25 ou Bull 50</option></select></label>
        <label>Secteurs pour marquer<select value={options.bullTarget} onChange={(e) => setOptions({ ...options, bullTarget: e.target.value as FunOptions["bullTarget"] })}><option value="20">20</option><option value="19">19</option><option value="19_OR_20">19 et 20</option></select></label>
      </> : null}
    </section>
    <Rules kind={kind} strategy={options.conquestMode === "CONNECTED"} />
    <button className="fun-primary" type="button" disabled={controls.blocked || controls.busy} onClick={start}>Lancer la partie →</button>

  </div>;

  const participant = game.participants[game.activeParticipant];
  const counts = game.kind === "conquest" ? conquestScores(game) : game.kind === "bull500" ? game.scores : game.sideNames.map((_, side) => game.board.filter((owner) => owner === side).length);
  const finished = game.winnerSide !== null;
  const hint = game.kind === "connect4"
    ? "Visez de 14 à 20" + (game.rule === "DOUBLE" ? " en double" : "") + ". Un pion posé termine la volée."
    : game.kind === "conquest" ? "Objectif : " + (game.strategy ? game.strategy.goal + " points. Reliez vos territoires. " : game.goal + " territoires. ") + "Simple = 1 marque, double = 2, triple = 3."
      : game.unlocked ? "Score débloqué : visez " + game.target.replace("_OR_", " ou ") + "." : "Commencez par le " + (game.unlock === "50" ? "Bull 50" : "25 ou Bull 50") + " à chaque volée.";
  return <div className={"fun-shell" + (game.kind === "conquest" ? " conquest-shell" : "")}><LocalSessionBar controls={controls}/>
    <header className="fun-matchbar"><div><span>JEUX FUN · VOLÉE {game.visitNumber}</span><h1>{config.title}</h1></div></header>
    {finished ? <section className="fun-winner" role="status"><Trophy aria-hidden="true" /><div><h2>{game.winnerSide === "DRAW" ? "Match nul" : game.sideNames[game.winnerSide as number] + " gagne !"}</h2><p>{game.winnerSide === "DRAW" ? "La grille est complète sans alignement." : "Partie terminée · " + game.totalDarts + " fléchettes jouées"}</p></div><button type="button" disabled={controls.blocked || controls.busy} onClick={start}>Rejouer</button></section> : null}
    {game.kind === "conquest" ? <ConquestScores game={game} /> : <section className="play-score-strip fun-scores" aria-label="Scores des joueurs">
      {game.sideNames.map((name, side) => <article key={side} className={participant.side === side ? "active" : ""} aria-label={name + " · " + counts[side]}>
        <span className={"fun-symbol fun-owner-" + side}>{symbols[side]} · Camp {side + 1}{participant.side === side ? " · au lancer" : ""}</span>
        <h2>{name}</h2><strong>{counts[side]}<small>{game.kind === "bull500" ? " / 500" : " pions"}</small></strong>
      </article>)}
    </section>}
    <div className={"fun-play-layout " + (game.kind === "bull500" ? "fun-bull-layout" : game.kind === "conquest" ? "conquest-play-layout" : "")}>
      {game.kind === "connect4" ? <section className="fun-board-panel" aria-label="Plateau Puissance 4">
        <h2>Alignez quatre pions</h2><p>Les nombres au-dessus indiquent les secteurs à viser.</p>
        <div className="fun-connect-targets" aria-hidden="true">{CONNECT_TARGETS.map((target) => <b key={target}>{game.rule === "DOUBLE" ? "D" : ""}{target}</b>)}</div>
        <div className="fun-connect-board" role="table" aria-label="Grille de 6 lignes et 7 colonnes">
          {Array.from({ length: 6 }, (_, row) => <div role="row" key={row}>{Array.from({ length: 7 }, (_, column) => {
            const index = row * 7 + column, owner = game.board[index];
            return <div role="cell" key={column} className={"fun-connect-cell fun-owner-" + (owner ?? "none") + (game.winningCells.includes(index) ? " winning" : "")} aria-label={"Ligne " + (row + 1) + ", secteur " + CONNECT_TARGETS[column] + " : " + (owner === null ? "vide" : game.sideNames[owner])}>{owner === null ? "·" : symbols[owner]}</div>;
          })}</div>)}
        </div>
      </section> : game.kind === "conquest" ? <ConquestBoard game={game} /> : null}
      <div className="fun-controls">
        <TurnPanel blocked={controls.problem==="conflict" || controls.blocked} pending={controls.busy} player={participant.name} nextPlayer={game.participants[(game.activeParticipant + 1) % game.participants.length].name} darts={game.visitDarts} complete={game.visitClosed} finished={finished} onDart={(dart) => act((current) => applyFunDart(current, dart))} onNext={() => act(endFunVisit)} onUndo={undo} canUndo={history.length>0} hint={hint} defaultMultiplier={game.kind === "connect4" && game.rule === "DOUBLE" ? 2 : 1} />
        <p className="fun-last-action" role="status" aria-live="polite">{game.log[0] ? game.log[0].dart + " · " + game.log[0].result : "À vous de jouer."}</p>
      </div>
    </div>
    <details className="play-history"><summary>Historique des lancers · {game.totalDarts}</summary>{game.log.length ? <ol className="fun-log">{game.log.map((entry) => <li key={entry.id}><span>{game.participants[entry.participant].name}</span><b>{entry.dart === "MISS" ? "Raté" : entry.dart}</b><small>{entry.result}</small></li>)}</ol> : <p>Aucun lancer.</p>}<p>Les 30 derniers lancers sont affichés. Annuler restaure jusqu’à 50 actions, y compris un changement de joueur.</p></details>
    <details className="play-history"><summary>Rappel des règles</summary><Rules kind={kind} strategy={game.kind === "conquest" && Boolean(game.strategy)} /></details>
  </div>;
}
