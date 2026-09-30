"use client";

import { useState } from "react";
import { useSyncedGame } from "@/components/play/useSyncedGame";
import { LocalSessionBar } from "@/components/play/LocalSessionBar";
import { Crosshair, Sparkles, Target, Trophy, Undo2 } from "lucide-react";
import { TurnPanel } from "@/components/play/TurnPanel";
import { ParticipantSetup } from "@/components/play/ParticipantSetup";
import { type PlayFormat } from "@/lib/play/format";
import {
  applyCricketDart,
  createCricketGame,
  endCricketVisit,
  marksGlyph,
  type CricketMode,
  type CricketScoring,
  type CricketMultiplier,
  type CricketState,
} from "@/lib/play/cricket-engine";

type Props = { currentDisplayName: string; userId: string };

const modes: Array<{ id: CricketMode; title: string; subtitle: string; description: string }> = [
  { id: "BASIC", title: "Basic", subtitle: "15 → 20 + Bull", description: "Le Cricket classique avec les cibles officielles." },
  { id: "TACTIC", title: "Tactic", subtitle: "10 → 20 + Bull", description: "Cricket étendu sur les numéros 10 à 20 et le Bull." },
  { id: "MAGIC", title: "Magic", subtitle: "6 numéros + Bull", description: "La cible reste fixe pendant les 3 fléchettes puis change à la fin de la volée si elle n’est pas fermée." },
];

const scoringModes: Array<{ id: CricketScoring; title: string; subtitle: string; description: string }> = [
  { id: "STANDARD", title: "Standard", subtitle: "Points pour soi", description: "Les points supplémentaires s’ajoutent à votre score. Le score le plus élevé départage les joueurs ayant fermé." },
  { id: "CUT_THROAT", title: "Cut Throat", subtitle: "Points aux adversaires", description: "Les points supplémentaires sont donnés aux adversaires encore ouverts. Le score le plus bas gagne." },
];


export function CricketGame({ currentDisplayName, userId }: Props) {
  const [mode, setMode] = useState<CricketMode>("BASIC");
  const [scoring, setScoring] = useState<CricketScoring>("STANDARD");
  const [format, setFormat] = useState<PlayFormat>("DUEL");
  const [names, setNames] = useState([currentDisplayName || "Joueur 1", "Adversaire", "Joueur 3", "Joueur 4"]);
  const { game, history, start: saveStart, act, undo, controls } = useSyncedGame<CricketState>("cricket", userId);

  const updateName = (index: number, value: string) => setNames((current) => current.map((name, i) => i === index ? value : name));

  function changeFormat(nextFormat: PlayFormat) {
    setFormat(nextFormat);
    if (nextFormat === "SOLO") setScoring("STANDARD");
  }
  function start(selectedMode = game?.mode ?? mode, selectedScoring = game?.scoring ?? scoring) {
    saveStart(createCricketGame(selectedMode, selectedScoring, game?.format ?? format, game?.participants.map(p => p.name) ?? names));
  }
  function throwDart(value: number, forcedMultiplier?: CricketMultiplier) { act(current => applyCricketDart(current, value, forcedMultiplier ?? 1)); }
  function passVisit() { act(endCricketVisit); }
  if (!controls.ready) return <LocalSessionBar controls={controls} />;

  if (!game && controls.sync?.active && controls.blocked) return <LocalSessionBar controls={controls} />;
  if (!game) return (
    <div className="cricket-game-shell"><LocalSessionBar controls={controls} />
      <section className="cricket-game-hero"><div><span className="cricket-kicker">974DARTS PLAY · CRICKET</span><h1>Cricket</h1><p>Choisissez les participants, les cibles et le mode de points avant de lancer la partie.</p></div><Target aria-hidden="true" /></section>
      <ParticipantSetup format={format} onFormatChange={changeFormat} names={names} onNameChange={updateName} note="Solo, chacun pour soi ou 2 vs 2. En équipe, les marques et le score sont partagés." />

      <section className="cricket-option-section">
        <header><span>1</span><div><strong>Type de Cricket</strong><small>Choisissez les cibles et la mécanique de jeu.</small></div></header>
        <div className="cricket-mode-grid cricket-variant-grid" aria-label="Choisir le type de Cricket">
          {modes.map((item) => <button key={item.id} type="button" className={mode === item.id ? "selected" : ""} onClick={() => setMode(item.id)}><span>{item.id === "MAGIC" ? <Sparkles /> : <Crosshair />}</span><small>{item.subtitle}</small><strong>{item.title}</strong><p>{item.description}</p></button>)}
        </div>
      </section>

      <section className="cricket-option-section">
        <header><span>2</span><div><strong>Mode de points</strong><small>Indépendant du type de Cricket.</small></div></header>
        <div className="cricket-scoring-grid" aria-label="Choisir le mode de points">
          {scoringModes.map((item) => {
            const disabled = format === "SOLO" && item.id === "CUT_THROAT";
            return <button key={item.id} type="button" disabled={disabled} className={scoring === item.id ? "selected" : ""} onClick={() => setScoring(item.id)}><small>{item.subtitle}</small><strong>{item.title}</strong><p>{disabled ? "Indisponible en Solo : aucun adversaire ne peut recevoir les points." : item.description}</p></button>;
          })}
        </div>
      </section>

      <section className="cricket-setup-summary"><span>Configuration</span><strong>{modes.find((item) => item.id === mode)?.title} · {scoringModes.find((item) => item.id === scoring)?.title}</strong><small>{format === "TEAMS_2V2" ? "2 vs 2" : format === "SOLO" ? "Solo" : `${format === "DUEL" ? 2 : format === "THREE" ? 3 : 4} joueurs`}</small></section>
      <button className="cricket-start" type="button" disabled={controls.blocked || controls.busy} onClick={() => start()}>Lancer la partie <span>→</span></button>
    </div>
  );

  const participant = game.participants[game.activeParticipant];
  const activeSide = game.sides[participant.side];
  const winner = game.winnerSide == null ? null : game.sides[game.winnerSide];
  const modeLabel = modes.find((item) => item.id === game.mode)?.title ?? game.mode;
  const scoringLabel = scoringModes.find((item) => item.id === game.scoring)?.title ?? game.scoring;

  return (
    <div className="cricket-game-shell"><LocalSessionBar controls={controls} />
      <section className="cricket-matchbar">
        <div><span>{modeLabel} · {scoringLabel}</span><strong>Cricket · {game.format === "TEAMS_2V2" ? "2 vs 2" : `${game.participants.length} joueur${game.participants.length > 1 ? "s" : ""}`}</strong></div>
        <div className="cricket-turn"><span>Au lancer</span><strong>{participant.name}</strong><small>{activeSide.name} · {game.dartsInVisit}/3 fléchettes jouées</small></div>
        <div className="cricket-match-actions"><button type="button" onClick={undo} disabled={!history.length || controls.blocked || controls.busy}><Undo2 /> Annuler</button></div>
      </section>

      <TurnPanel blocked={controls.problem==="conflict" || controls.blocked || controls.busy} player={participant.name} nextPlayer={game.participants[(game.activeParticipant + 1) % game.participants.length].name}
        darts={game.log.slice(0, game.dartsInVisit).reverse().map((entry) => entry.dart)} finished={Boolean(winner)}
        onDart={(dart) => throwDart(dart.segment, (dart.multiplier || 1) as CricketMultiplier)} onNext={passVisit} onUndo={undo} canUndo={history.length > 0}
        hint={activeSide.name + " · " + activeSide.score + " points · un triple utilise une seule fléchette"} />

      {winner ? <section className="cricket-winner"><Trophy /><div><span>PARTIE TERMINÉE · {scoringLabel}</span><h2>{winner.name} gagne</h2><p>{game.scoring === "CUT_THROAT" ? "Cibles fermées avec le score le plus bas." : "Cibles fermées avec l’avantage au score."}</p></div><button type="button" disabled={controls.blocked || controls.busy} onClick={() => start(game.mode, game.scoring)}>Rejouer</button></section> : null}

      <section className="cricket-multi-scoreboard">
        {game.sides.map((side, sideIndex) => <article key={sideIndex} className={participant.side === sideIndex ? "active" : ""}><span>{game.format === "TEAMS_2V2" ? `ÉQUIPE ${sideIndex === 0 ? "A" : "B"}` : `JOUEUR ${sideIndex + 1}`}</span><h2>{side.name}</h2><strong>{side.score}</strong><small>points</small></article>)}
      </section>

      <section className="cricket-board-wrap cricket-board-wide">
        <div className="play-table-scroll" role="region" aria-label="Marques de tous les joueurs" tabIndex={0}>
          <table className="play-cricket-table"><thead><tr><th scope="col">Cible</th>{game.sides.map((side, index) => <th scope="col" key={index} className={participant.side === index ? "active" : ""}>{side.name}</th>)}</tr></thead>
          <tbody>{game.targets.map((target) => <tr key={target.id}><th scope="row">{target.label}</th>{game.sides.map((side, index) => <td key={index} className={participant.side === index ? "active" : ""} aria-label={side.name + " · " + target.label + " · " + (side.marks[target.id] ?? 0) + " marques"}>{marksGlyph(side.marks[target.id] ?? 0)}</td>)}</tr>)}</tbody></table>
        </div>
        {game.mode === "MAGIC" ? <p className="cricket-magic-note"><Sparkles /> La cible Magic reste identique pendant toute la volée. Au passage au joueur suivant, toute cible touchée mais non fermée est remplacée en conservant les marques acquises.</p> : null}
      </section>

      <section className="cricket-history"><header><strong>Dernières flèches</strong><small>Les cibles actives sont surlignées.</small></header>{game.log.length ? game.log.map((entry) => <div key={entry.id}><span>{game.participants[entry.participant]?.name}</span><b>{entry.dart}</b><small>{entry.result}</small></div>) : <p>Aucune flèche enregistrée.</p>}</section>
    </div>
  );
}
