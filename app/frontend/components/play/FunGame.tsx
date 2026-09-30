"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocalGame } from "./useLocalGame";
import { LocalSessionBar } from "./LocalSessionBar";
import { Flag, Grid3X3, Target, Trophy } from "lucide-react";
import { ParticipantSetup } from "./ParticipantSetup";
import { TurnPanel } from "./TurnPanel";
import type { PlayFormat } from "@/lib/play/format";
import { applyFunDart, CONNECT_TARGETS, conquestCounts, createFunGame, endFunVisit, type FunKind, type FunOptions, type FunState } from "@/lib/play/fun-engine";

const symbols = ["●", "◆", "▲", "■"];
const games = {
  connect4: { title: "Puissance 4", subtitle: "Visez une colonne. Alignez quatre pions.", icon: Grid3X3 },
  conquest: { title: "Conquête", subtitle: "Prenez les territoires. Défendez votre avance.", icon: Flag },
  bull500: { title: "Bull 500", subtitle: "Débloquez le score au Bull. Faites la course à 500.", icon: Target },
};

function Rules({ kind }: { kind: FunKind }) {
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
      <li>Le premier camp à posséder simultanément le nombre de territoires choisi gagne. Trois fléchettes par volée, sauf victoire.</li>
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
  const [options, setOptions] = useState<FunOptions>({ connectRule: "ANY", conquestGoal: 7, bullUnlock: "50", bullTarget: "20" });
  const {game,history,start:saveStart,act,undo,controls}=useLocalGame<FunState>(kind,userId);
  function start() {
    const selected: FunOptions = game?.kind === "connect4" ? {connectRule:game.rule} : game?.kind === "conquest" ? {conquestGoal:game.goal} : game?.kind === "bull500" ? {bullUnlock:game.unlock,bullTarget:game.target} : options;
    saveStart(createFunGame(kind,game?.format??format,game?.participants.map(p=>p.name)??names,selected));
  }
  if (!controls.ready) return <LocalSessionBar controls={controls}/>;
  if (!game) return <div className="fun-shell"><LocalSessionBar controls={controls}/>
    <Link className="fun-back" href="/play">← Univers Jeux</Link>
    <header className="fun-hero"><div><span>JEUX FUN · 974DARTS</span><h1>{config.title}</h1><p>{config.subtitle}</p></div><config.icon aria-hidden="true" /></header>
    <ParticipantSetup format={format} onFormatChange={setFormat} names={names} onNameChange={(index, value) => setNames((current) => current.map((name, i) => i === index ? value : name))} note="Solo, jusqu’à 4 joueurs ou 2 vs 2. Les joueurs d’une même équipe partagent leur progression." />
    <section className="fun-options" aria-label="Options de la partie">
      {kind === "connect4" ? <label>Impacts acceptés<select value={options.connectRule} onChange={(e) => setOptions({ ...options, connectRule: e.target.value as FunOptions["connectRule"] })}><option value="ANY">Simples, doubles et triples</option><option value="DOUBLE">Doubles uniquement</option></select></label> : null}
      {kind === "conquest" ? <label>Territoires pour gagner<select value={options.conquestGoal} onChange={(e) => setOptions({ ...options, conquestGoal: Number(e.target.value) as 5 | 7 | 10 })}><option value={5}>5 · partie courte</option><option value={7}>7 · classique</option><option value={10}>10 · partie longue</option></select></label> : null}
      {kind === "bull500" ? <>
        <label>Déblocage du score<select value={options.bullUnlock} onChange={(e) => setOptions({ ...options, bullUnlock: e.target.value as FunOptions["bullUnlock"] })}><option value="50">Bull 50 uniquement</option><option value="25_OR_50">25 ou Bull 50</option></select></label>
        <label>Secteurs pour marquer<select value={options.bullTarget} onChange={(e) => setOptions({ ...options, bullTarget: e.target.value as FunOptions["bullTarget"] })}><option value="20">20</option><option value="19">19</option><option value="19_OR_20">19 et 20</option></select></label>
      </> : null}
    </section>
    <Rules kind={kind} />
    <button className="fun-primary" type="button" onClick={start}>Lancer la partie →</button>

  </div>;

  const participant = game.participants[game.activeParticipant];
  const counts = game.kind === "conquest" ? conquestCounts(game) : game.kind === "bull500" ? game.scores : game.sideNames.map((_, side) => game.board.filter((owner) => owner === side).length);
  const finished = game.winnerSide !== null;
  const hint = game.kind === "connect4"
    ? "Visez de 14 à 20" + (game.rule === "DOUBLE" ? " en double" : "") + ". Un pion posé termine la volée."
    : game.kind === "conquest" ? "Objectif : " + game.goal + " territoires. Simple = 1 marque, double = 2, triple = 3."
      : game.unlocked ? "Score débloqué : visez " + game.target.replace("_OR_", " ou ") + "." : "Commencez par le " + (game.unlock === "50" ? "Bull 50" : "25 ou Bull 50") + " à chaque volée.";
  return <div className="fun-shell"><LocalSessionBar controls={controls}/>
    <header className="fun-matchbar"><div><span>JEUX FUN · VOLÉE {game.visitNumber}</span><h1>{config.title}</h1></div></header>
    {finished ? <section className="fun-winner" role="status"><Trophy aria-hidden="true" /><div><h2>{game.winnerSide === "DRAW" ? "Match nul" : game.sideNames[game.winnerSide as number] + " gagne !"}</h2><p>{game.winnerSide === "DRAW" ? "La grille est complète sans alignement." : "Partie terminée · " + game.totalDarts + " fléchettes jouées"}</p></div><button type="button" onClick={start}>Rejouer</button></section> : null}
    <section className="play-score-strip fun-scores" aria-label="Scores des joueurs">
      {game.sideNames.map((name, side) => <article key={side} className={participant.side === side ? "active" : ""} aria-label={name + " · " + counts[side]}>
        <span className={"fun-symbol fun-owner-" + side}>{symbols[side]} · Camp {side + 1}{participant.side === side ? " · au lancer" : ""}</span>
        <h2>{name}</h2><strong>{counts[side]}<small>{game.kind === "bull500" ? " / 500" : game.kind === "conquest" ? " / " + game.goal : " pions"}</small></strong>
      </article>)}
    </section>
    <div className={"fun-play-layout " + (game.kind === "bull500" ? "fun-bull-layout" : "")}>
      {game.kind === "connect4" ? <section className="fun-board-panel" aria-label="Plateau Puissance 4">
        <h2>Alignez quatre pions</h2><p>Les nombres au-dessus indiquent les secteurs à viser.</p>
        <div className="fun-connect-targets" aria-hidden="true">{CONNECT_TARGETS.map((target) => <b key={target}>{game.rule === "DOUBLE" ? "D" : ""}{target}</b>)}</div>
        <div className="fun-connect-board" role="table" aria-label="Grille de 6 lignes et 7 colonnes">
          {Array.from({ length: 6 }, (_, row) => <div role="row" key={row}>{Array.from({ length: 7 }, (_, column) => {
            const index = row * 7 + column, owner = game.board[index];
            return <div role="cell" key={column} className={"fun-connect-cell fun-owner-" + (owner ?? "none") + (game.winningCells.includes(index) ? " winning" : "")} aria-label={"Ligne " + (row + 1) + ", secteur " + CONNECT_TARGETS[column] + " : " + (owner === null ? "vide" : game.sideNames[owner])}>{owner === null ? "·" : symbols[owner]}</div>;
          })}</div>)}
        </div>
      </section> : game.kind === "conquest" ? <section className="fun-board-panel" aria-label="Territoires de Conquête">
        <h2>La carte des 20 territoires</h2><p>Le symbole indique le propriétaire. Les petites marques montrent les prises en cours pour chaque camp.</p>
        <div className="fun-territories">{game.territories.map((territory) => <div key={territory.target} className={"fun-territory fun-owner-" + (territory.owner ?? "none")} aria-label={"Territoire " + territory.target + " : " + (territory.owner === null ? "libre" : game.sideNames[territory.owner])}>
          <b>{territory.target}</b><span title={territory.owner === null ? "Libre" : game.sideNames[territory.owner]}>{territory.owner === null ? "Libre" : symbols[territory.owner]}</span>
          <div>{territory.marks.map((marks, side) => <small key={side} className={"fun-owner-" + side} aria-label={game.sideNames[side] + " : " + marks + "/3 marques"}>{symbols[side]} {marks}/3</small>)}</div>
        </div>)}</div>
      </section> : null}
      <div className="fun-controls">
        <TurnPanel blocked={controls.problem==="conflict"} player={participant.name} nextPlayer={game.participants[(game.activeParticipant + 1) % game.participants.length].name} darts={game.visitDarts} complete={game.visitClosed} finished={finished} onDart={(dart) => act((current) => applyFunDart(current, dart))} onNext={() => act(endFunVisit)} onUndo={undo} canUndo={history.length>0} hint={hint} defaultMultiplier={game.kind === "connect4" && game.rule === "DOUBLE" ? 2 : 1} />
        <p className="fun-last-action" role="status" aria-live="polite">{game.log[0] ? game.log[0].dart + " · " + game.log[0].result : "À vous de jouer."}</p>
      </div>
    </div>
    <details className="play-history"><summary>Historique des lancers · {game.totalDarts}</summary>{game.log.length ? <ol className="fun-log">{game.log.map((entry) => <li key={entry.id}><span>{game.participants[entry.participant].name}</span><b>{entry.dart === "MISS" ? "Raté" : entry.dart}</b><small>{entry.result}</small></li>)}</ol> : <p>Aucun lancer.</p>}<p>Les 30 derniers lancers sont affichés. Annuler restaure jusqu’à 50 actions, y compris un changement de joueur.</p></details>
    <details className="play-history"><summary>Rappel des règles</summary><Rules kind={kind} /></details>
  </div>;
}
