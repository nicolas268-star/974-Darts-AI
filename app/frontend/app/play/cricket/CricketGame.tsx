"use client";

import { useMemo, useState } from "react";
import { Crosshair, RotateCcw, Sparkles, Target, Trophy, Undo2 } from "lucide-react";
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

type Props = { currentDisplayName: string };

const modes: Array<{ id: CricketMode; title: string; subtitle: string; description: string }> = [
  { id: "BASIC", title: "Basic", subtitle: "15 → 20 + Bull", description: "Le Cricket classique avec les cibles officielles." },
  { id: "TACTIC", title: "Tactic", subtitle: "10 → 20 + Bull", description: "Cricket étendu sur les numéros 10 à 20 et le Bull." },
  { id: "MAGIC", title: "Magic", subtitle: "6 numéros + Bull", description: "La cible reste fixe pendant les 3 fléchettes puis change à la fin de la volée si elle n’est pas fermée." },
];

const scoringModes: Array<{ id: CricketScoring; title: string; subtitle: string; description: string }> = [
  { id: "STANDARD", title: "Standard", subtitle: "Points pour soi", description: "Les points supplémentaires s’ajoutent à votre score. Le score le plus élevé départage les joueurs ayant fermé." },
  { id: "CUT_THROAT", title: "Cut Throat", subtitle: "Points aux adversaires", description: "Les points supplémentaires sont donnés aux adversaires encore ouverts. Le score le plus bas gagne." },
];

const numberButtons = Array.from({ length: 20 }, (_, index) => index + 1);
function deepCopy(state: CricketState) { return JSON.parse(JSON.stringify(state)) as CricketState; }

export function CricketGame({ currentDisplayName }: Props) {
  const [mode, setMode] = useState<CricketMode>("BASIC");
  const [scoring, setScoring] = useState<CricketScoring>("STANDARD");
  const [format, setFormat] = useState<PlayFormat>("DUEL");
  const [names, setNames] = useState([currentDisplayName || "Joueur 1", "Adversaire", "Joueur 3", "Joueur 4"]);
  const [game, setGame] = useState<CricketState | null>(null);
  const [history, setHistory] = useState<CricketState[]>([]);
  const [multiplier, setMultiplier] = useState<CricketMultiplier>(1);

  const activeTargets = useMemo(() => new Set(game?.targets.map((target) => target.value) ?? []), [game]);
  const updateName = (index: number, value: string) => setNames((current) => current.map((name, i) => i === index ? value : name));

  function changeFormat(nextFormat: PlayFormat) {
    setFormat(nextFormat);
    if (nextFormat === "SOLO") setScoring("STANDARD");
  }
  function start(selectedMode = mode, selectedScoring = scoring) {
    setGame(createCricketGame(selectedMode, selectedScoring, format, names));
    setHistory([]);
    setMultiplier(1);
  }
  function throwDart(value: number, forcedMultiplier?: CricketMultiplier) {
    if (!game || game.winnerSide != null) return;
    setHistory((items) => [...items.slice(-49), deepCopy(game)]);
    setGame(applyCricketDart(game, value, forcedMultiplier ?? multiplier));
  }
  function passVisit() {
    if (!game || game.winnerSide != null) return;
    setHistory((items) => [...items.slice(-49), deepCopy(game)]);
    setGame(endCricketVisit(game));
  }
  function undo() {
    const previous = history.at(-1); if (!previous) return;
    setGame(previous); setHistory((items) => items.slice(0, -1));
  }

  if (!game) return (
    <div className="cricket-game-shell">
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
      <button className="cricket-start" type="button" onClick={() => start()}>Lancer la partie <span>→</span></button>
    </div>
  );

  const participant = game.participants[game.activeParticipant];
  const activeSide = game.sides[participant.side];
  const winner = game.winnerSide == null ? null : game.sides[game.winnerSide];
  const modeLabel = modes.find((item) => item.id === game.mode)?.title ?? game.mode;
  const scoringLabel = scoringModes.find((item) => item.id === game.scoring)?.title ?? game.scoring;

  return (
    <div className="cricket-game-shell">
      <section className="cricket-matchbar">
        <div><span>{modeLabel} · {scoringLabel}</span><strong>Cricket · {game.format === "TEAMS_2V2" ? "2 vs 2" : `${game.participants.length} joueur${game.participants.length > 1 ? "s" : ""}`}</strong></div>
        <div className="cricket-turn"><span>Au lancer</span><strong>{participant.name}</strong><small>{activeSide.name} · Flèche {game.dartsInVisit + 1}/3</small></div>
        <div className="cricket-match-actions"><button type="button" onClick={undo} disabled={!history.length}><Undo2 /> Annuler</button><button type="button" onClick={() => { setGame(null); setHistory([]); }}><RotateCcw /> Quitter</button></div>
      </section>

      {winner ? <section className="cricket-winner"><Trophy /><div><span>PARTIE TERMINÉE · {scoringLabel}</span><h2>{winner.name} gagne</h2><p>{game.scoring === "CUT_THROAT" ? "Cibles fermées avec le score le plus bas." : "Cibles fermées avec l’avantage au score."}</p></div><button type="button" onClick={() => start(game.mode, game.scoring)}>Rejouer</button></section> : null}

      <section className="cricket-multi-scoreboard">
        {game.sides.map((side, sideIndex) => <article key={sideIndex} className={participant.side === sideIndex ? "active" : ""}><span>{game.format === "TEAMS_2V2" ? `ÉQUIPE ${sideIndex === 0 ? "A" : "B"}` : `JOUEUR ${sideIndex + 1}`}</span><h2>{side.name}</h2><strong>{side.score}</strong><small>points</small></article>)}
      </section>

      <section className="cricket-board-wrap cricket-board-wide">
        <div className="cricket-target-table" style={{ gridTemplateColumns: `110px repeat(${game.sides.length}, minmax(90px,1fr))` }}>
          <strong className="target-head">CIBLE</strong>{game.sides.map((side, index) => <strong key={index} className="side-head">{side.name}</strong>)}
          {game.targets.flatMap((target) => [
            <strong className="target-name" key={`${target.id}-label`}>{target.label}</strong>,
            ...game.sides.map((side, sideIndex) => <b key={`${target.id}-${sideIndex}`} className={(side.marks[target.id] ?? 0) >= 3 ? "closed" : ""}>{marksGlyph(side.marks[target.id] ?? 0)}</b>)
          ])}
        </div>
        {game.mode === "MAGIC" ? <p className="cricket-magic-note"><Sparkles /> La cible Magic reste identique pendant toute la volée. Après la 3e flèche, toute cible touchée mais non fermée est remplacée en conservant les marques acquises.</p> : null}
      </section>

      {!winner ? <section className="cricket-entry">
        <header><div><span>SAISIE FLÈCHE PAR FLÈCHE · {scoringLabel.toUpperCase()}</span><strong>{participant.name}</strong></div><button type="button" onClick={passVisit}>Fin de volée →</button></header>
        <div className="cricket-multipliers">{([1,2,3] as CricketMultiplier[]).map((value) => <button type="button" key={value} className={multiplier === value ? "selected" : ""} onClick={() => setMultiplier(value)}>{value === 1 ? "SIMPLE" : value === 2 ? "DOUBLE" : "TRIPLE"}</button>)}</div>
        <div className="cricket-number-grid">{numberButtons.map((value) => <button type="button" key={value} className={activeTargets.has(value) ? "target" : ""} onClick={() => throwDart(value)}>{value}</button>)}</div>
        <div className="cricket-specials"><button type="button" className="bull" onClick={() => throwDart(25,1)}>25</button><button type="button" className="bull" onClick={() => throwDart(25,2)}>BULL 50</button><button type="button" onClick={() => throwDart(0,1)}>MISS</button></div>
      </section> : null}

      <section className="cricket-history"><header><strong>Dernières flèches</strong><small>Les cibles actives sont surlignées.</small></header>{game.log.length ? game.log.map((entry) => <div key={entry.id}><span>{game.participants[entry.participant]?.name}</span><b>{entry.dart}</b><small>{entry.result}</small></div>) : <p>Aucune flèche enregistrée.</p>}</section>
    </div>
  );
}
