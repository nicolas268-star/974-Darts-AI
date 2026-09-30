"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Expand, X, ZoomIn, ZoomOut } from "lucide-react";
import { CONQUEST_REGIONS, CONQUEST_SEA_LINKS, conquestNeighbors } from "@/lib/play/conquest-map";
import { conquestAlliedLinks, conquestCaptureValue, conquestCounts, conquestScores, type ConquestState } from "@/lib/play/fun-engine";

export const CONQUEST_SYMBOLS = ["●", "◆", "▲", "■"];

export function ConquestScores({ game }: { game: ConquestState }) {
  const counts = conquestCounts(game), scores = conquestScores(game), active = game.participants[game.activeParticipant].side;
  return <section className="play-score-strip fun-scores conquest-scores" aria-label="Scores des joueurs">
    {game.sideNames.map((name, side) => <article key={side} className={`conquest-camp-${side}${active === side ? " active" : ""}`} aria-label={name + " · " + scores[side]}>
      <span className="conquest-camp-label">{CONQUEST_SYMBOLS[side]} CAMP {side + 1}{active === side ? " · AU LANCER" : ""}</span>
      <h2>{name}</h2><strong>{scores[side]}<small> / {game.strategy?.goal ?? game.goal} {game.strategy ? "pts" : "territoires"}</small></strong>
      <p>{game.strategy ? `${counts[side]} territoires × 2 + ${conquestAlliedLinks(game, side)} liaisons` : `${counts[side]} territoires possédés`}</p>
    </article>)}
  </section>;
}

export function ConquestBoard({ game }: { game: ConquestState }) {
  const [selected, setSelected] = useState<number | null>(null), [expanded, setExpanded] = useState(false), [zoom, setZoom] = useState(false);
  const modal = useRef<HTMLDialogElement>(null), expandButton = useRef<HTMLButtonElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const pattern = useId();
  const active = game.participants[game.activeParticipant].side;
  const target = selected ?? game.territories.find(t => t.owner === active)?.target ?? 1;
  const region = CONQUEST_REGIONS[target - 1], territory = game.territories[target - 1];
  const neighbors = conquestNeighbors(target), gain = conquestCaptureValue(game, target, active);
  const eligible = Boolean(game.strategy) && territory.owner !== active;
  const finished = game.winnerSide !== null;
  const targets = game.territories.filter(t => t.owner !== active).map(t => ({ target: t.target, gain: conquestCaptureValue(game, t.target, active) })).filter(t => t.gain > 2).sort((a,b) => b.gain-a.gain || a.target-b.target).slice(0,3);
  useEffect(() => {
    if (!expanded) return;
    const element = modal.current, trigger = expandButton.current, previousOverflow = document.body.style.overflow;
    element?.showModal(); closeButton.current?.focus(); document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previousOverflow; trigger?.focus({ preventScroll: true }); };
  }, [expanded]);

  function content(fullscreen: boolean) {
    return <>
      <header className="conquest-map-header">
        <div><span>CONQUÊTE DU MONDE · 20 TERRITOIRES</span><h2>{game.strategy ? "Reliez vos territoires." : "Prenez le contrôle de la carte."}</h2>
          <p>{game.strategy ? "2 points par territoire + 1 par liaison alliée." : `Partie classique · objectif ${game.goal} territoires.`}</p></div>
        <div className="conquest-map-tools">
          <button type="button" onClick={() => setZoom(!zoom)} aria-pressed={zoom}>{zoom ? <ZoomOut size={18} /> : <ZoomIn size={18} />}{zoom ? "Vue complète" : "Zoomer"}</button>
          {fullscreen ? <button ref={closeButton} type="button" onClick={() => setExpanded(false)}><X size={18} />Fermer la vue agrandie</button> : <button ref={expandButton} type="button" onClick={() => setExpanded(true)}><Expand size={18} />Agrandir la carte</button>}
        </div>
      </header>
      {fullscreen ? <><ConquestScores game={game} /><p className={`conquest-stage-turn conquest-camp-${active}`}>{CONQUEST_SYMBOLS[active]} {game.participants[game.activeParticipant].name} · {game.visitDarts.length}/3 fléchettes{finished ? " · Partie terminée" : game.visitClosed ? " · Volée terminée" : " · Au lancer"}</p></> : null}
      <div className="conquest-board-body">
        <div className="conquest-map-column">
          <div className={`conquest-map-scroll${zoom ? " is-zoomed" : ""}`} tabIndex={zoom ? 0 : undefined} role="region" aria-label="Carte du monde, défilement horizontal en zoom">
            <svg className="conquest-world" viewBox="0 0 1040 580" role="group" aria-label="Carte du monde en 20 territoires">
              <defs><pattern id={pattern + (fullscreen ? "-full" : "")} width="65" height="58" patternUnits="userSpaceOnUse"><path d="M65 0H0V58" fill="none" stroke="#244157" strokeWidth=".7" /></pattern></defs>
              <rect width="1040" height="580" rx="24" fill="#081927" /><rect width="1040" height="580" rx="24" fill={`url(#${pattern + (fullscreen ? "-full" : "")})`} />
              <g className="conquest-oceans" aria-hidden="true"><text x="98" y="359">PACIFIQUE</text><text x="429" y="285">ATLANTIQUE</text><text x="751" y="447">OCÉAN INDIEN</text></g>
              {CONQUEST_SEA_LINKS.map(link => {
                const a = game.territories[link.a-1].owner, b = game.territories[link.b-1].owner;
                return <path key={link.a + "-" + link.b} d={link.path} className={`conquest-sea-link${a !== null && a === b ? " allied conquest-camp-" + a : ""}`} aria-hidden="true" />;
              })}
              {CONQUEST_REGIONS.map(r => {
                const t = game.territories[r.id-1], opportunity = Boolean(game.strategy) && t.owner !== active && conquestCaptureValue(game, r.id, active) > 2;
                return <g key={r.id} role="button" tabIndex={0} aria-label={`Territoire ${r.id} : ${t.owner === null ? "libre" : game.sideNames[t.owner]}`} aria-pressed={target === r.id}
                  className={`conquest-region conquest-camp-${t.owner ?? "free"}${opportunity ? " opportunity" : ""}${target === r.id ? " selected" : ""}`}
                  onClick={() => setSelected(r.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(r.id); } }}>
                  <title>{r.id} · {r.name}{opportunity ? ` · conquête : +${conquestCaptureValue(game, r.id, active)} points` : ""}</title>
                  <path className="conquest-land" d={r.path} />
                  <g transform={`translate(${r.x} ${r.y})`} className="conquest-map-number" aria-hidden="true">
                    <rect x="-21" y="-18" width="42" height="36" rx="10" /><text y="8">{r.id}</text>
                    {t.owner !== null ? <text className="conquest-owner-symbol" y="35">{CONQUEST_SYMBOLS[t.owner]}</text> : null}
                    {t.marks[active] > 0 ? <g transform="translate(-15 -32)">{[0,1,2].map(i => <rect key={i} x={i*11} y="0" width="8" height="8" className={i < t.marks[active] ? "mark-filled" : "mark-empty"} />)}</g> : null}
                  </g>
                </g>;
              })}
            </svg>
          </div>
          <div className="conquest-map-legend"><span>— — Route maritime : territoires voisins</span>{game.strategy ? <span>▱ Bord blanc : bonus de liaison possible</span> : null}<span>Carte de jeu schématique</span></div>
          {!fullscreen ? <div className="conquest-selector" role="group" aria-label="Choisir un territoire">
            {CONQUEST_REGIONS.map(r => <button key={r.id} type="button" className={`conquest-camp-${game.territories[r.id-1].owner ?? "free"}`} aria-label={`Examiner ${r.id} · ${r.name}`} aria-pressed={target === r.id} onClick={() => setSelected(r.id)}>{r.id}<span>{game.territories[r.id-1].owner === null ? "·" : CONQUEST_SYMBOLS[game.territories[r.id-1].owner!]}</span></button>)}
          </div> : null}
        </div>
        <aside className={`conquest-inspector conquest-camp-${active}`} aria-label="Détail du territoire">
          <span className="conquest-inspector-label">TERRITOIRE {target}</span><h3>{region.name}</h3>
          <p className="conquest-possession">{territory.owner === null ? "Libre" : CONQUEST_SYMBOLS[territory.owner] + " " + game.sideNames[territory.owner]}</p>
          {territory.owner === active ? <p className="conquest-value">À défendre<span>Ce territoire appartient à votre camp.</span></p> : <p className="conquest-value">+{gain} {game.strategy ? "points" : "territoire"}<span>{eligible ? `2 de base + ${gain-2} de liaison${gain > 3 ? "s" : ""}, si vous le prenez maintenant.` : "Trois marques pour conquérir."}</span></p>}
          <div className="conquest-marks" aria-label="Marques par camp">{game.sideNames.map((name, side) => <div className={`conquest-camp-${side}`} key={side}><span>{CONQUEST_SYMBOLS[side]} {name}</span><b>{territory.marks[side]}/3</b></div>)}</div>
          <strong>Voisins</strong><div className="conquest-neighbors">{neighbors.map(id => <button type="button" key={id} className={`conquest-camp-${game.territories[id-1].owner ?? "free"}`} aria-label={`Voir le voisin ${id} · ${CONQUEST_REGIONS[id-1].name}`} onClick={() => setSelected(id)}>{id}</button>)}</div>
          <small>La carte sert à choisir votre stratégie. Enregistrez le lancer dans la saisie des fléchettes.</small>
        </aside>
      </div>
      {game.strategy && !finished ? <div className="conquest-opportunities"><strong>Bonus pour {game.participants[game.activeParticipant].name}</strong>{targets.length ? <div>{targets.map(t => <button type="button" key={t.target} onClick={() => setSelected(t.target)}>Secteur {t.target} <b>+{t.gain} pts</b></button>)}</div> : <p>Choisissez un premier territoire libre ou adverse. Ses voisins pourront ensuite rapporter davantage.</p>}</div> : null}
    </>;
  }
  return <>
    <section className="conquest-board" aria-label="Territoires de Conquête">{content(false)}</section>
    {expanded ? <dialog ref={modal} className="conquest-stage" aria-label="Conquête, carte agrandie" onCancel={event => { event.preventDefault(); setExpanded(false); }}>{content(true)}</dialog> : null}
  </>;
}
