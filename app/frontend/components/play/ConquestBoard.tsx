"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Expand, X, ZoomIn, ZoomOut } from "lucide-react";
import { CONQUEST_REGIONS, CONQUEST_SEA_LINKS, CONQUEST_WORLD_REGIONS, CONQUEST_WORLD_ROUTES } from "@/lib/play/conquest-map";
import { conquestAlliedLinks, conquestCaptureValue, conquestCounts, conquestScores, conquestUsesLinks, conquestNeighborRegions, conquestGoal, conquestTargetLabel, type ConquestState } from "@/lib/play/fun-engine";

export const CONQUEST_SYMBOLS = ["●", "◆", "▲", "■"];

export function ConquestScores({ game }: { game: ConquestState }) {
  const counts = conquestCounts(game), scores = conquestScores(game), active = game.winnerSide === "DRAW" ? null : game.winnerSide ?? game.participants[game.activeParticipant].side;
  const goal = conquestGoal(game), strategic = conquestUsesLinks(game), points = Boolean(game.strategy || game.campaign);
  return <section className="play-score-strip fun-scores conquest-scores" aria-label="Scores des joueurs">
    {game.sideNames.map((name, side) => <article key={side} className={`conquest-camp-${side}${active === side ? " active" : ""}`} aria-label={name + " · " + scores[side]}>
      <span className="conquest-camp-label">{CONQUEST_SYMBOLS[side]} CAMP {side + 1}{game.winnerSide === side ? " · VICTOIRE" : active === side && game.winnerSide === null ? " · AU LANCER" : ""}</span>
      <h2>{name}</h2><strong>{scores[side]}<small>{goal === null ? " pts" : ` / ${goal} ${points ? "pts" : "territoires"}`}</small></strong>
      <p>{strategic ? `${counts[side]} territoires × 2 + ${conquestAlliedLinks(game, side)} liaisons` : `${counts[side]} territoires`}{game.campaign ? ` + ${game.campaign.bonuses[side]} bonus défense` : ""}</p>
    </article>)}
  </section>;
}

export function ConquestBoard({ game }: { game: ConquestState }) {
  const [selected, setSelected] = useState<number | null>(null), [expanded, setExpanded] = useState(false), [zoom, setZoom] = useState(false);
  const modal = useRef<HTMLDialogElement>(null), expandButton = useRef<HTMLButtonElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const pattern = useId();
  const active = game.participants[game.activeParticipant].side;
  const regions = game.campaign ? CONQUEST_WORLD_REGIONS : CONQUEST_REGIONS;
  const routes = game.campaign ? CONQUEST_WORLD_ROUTES : CONQUEST_SEA_LINKS;
  const strategic = conquestUsesLinks(game), full = game.campaign?.mode === "FULL", points = Boolean(game.strategy || game.campaign);
  const regionId = selected && selected <= regions.length ? selected : Math.max(1, game.territories.findIndex(t => t.owner === active) + 1);
  const region = regions[regionId - 1], territory = game.territories[regionId - 1];
  const neighbors = conquestNeighborRegions(game, regionId), gain = conquestCaptureValue(game, territory.target, active);
  const finished = game.winnerSide !== null;
  const targets = game.territories.map((t, index) => ({ region: index + 1, target: t.target, gain: conquestCaptureValue(game, t.target, active) })).filter(t => t.gain > 2).sort((a,b) => b.gain-a.gain || a.target-b.target).slice(0,3);
  const occupied = game.territories.filter(t => t.owner !== null).length;
  useEffect(() => {
    if (!expanded) return;
    const element = modal.current, trigger = expandButton.current, previousOverflow = document.body.style.overflow;
    element?.showModal(); closeButton.current?.focus(); document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previousOverflow; trigger?.focus({ preventScroll: true }); };
  }, [expanded]);

  function content(fullscreen: boolean) {
    return <>
      <header className="conquest-map-header">
        <div><span>{game.campaign ? "20 TERRITOIRES + LE BULL STRATÉGIQUE" : "CONQUÊTE DU MONDE · 20 TERRITOIRES"}</span><h2>{full ? "Full conquête · prenez toute la carte." : strategic ? "Reliez vos territoires." : "Prenez le contrôle de la carte."}</h2>
          <p>{strategic ? "2 points par territoire + 1 par liaison alliée" : game.campaign ? "1 point par territoire" : `Partie classique · objectif ${game.goal} territoires.`}{game.campaign ? " + bonus défense en fin de volée." : strategic ? "." : ""}</p>
          {game.campaign ? <p className="conquest-coverage">{occupied}/21 territoires occupés{full ? " · Fin dès que la carte est pleine" : " · Numéros mélangés pour cette partie"}</p> : null}</div>
        <div className="conquest-map-tools">
          <button type="button" onClick={() => setZoom(!zoom)} aria-pressed={zoom}>{zoom ? <ZoomOut size={18} /> : <ZoomIn size={18} />}{zoom ? "Vue complète" : "Zoomer"}</button>
          {fullscreen ? <button ref={closeButton} type="button" onClick={() => setExpanded(false)}><X size={18} />Fermer la vue agrandie</button> : <button ref={expandButton} type="button" onClick={() => setExpanded(true)}><Expand size={18} />Agrandir la carte</button>}
        </div>
      </header>
      {fullscreen ? <><ConquestScores game={game} />{finished ? <p className="conquest-stage-result" role="status"><strong>{game.winnerSide === "DRAW" ? "Match nul · égalité au meilleur score" : game.sideNames[game.winnerSide as number] + " gagne !"}</strong><small>Partie terminée · {game.totalDarts} fléchettes jouées</small></p> : <p className={`conquest-stage-turn conquest-camp-${active}`}>{CONQUEST_SYMBOLS[active]} {game.participants[game.activeParticipant].name} · {game.visitDarts.length}/3 fléchettes{game.visitClosed ? " · Volée terminée" : " · Au lancer"}</p>}</> : null}
      {game.campaign && game.campaign.pending.length > 0 ? <div className="conquest-defense-pending" role="status"><strong>Défense en attente</strong><p>À reprendre avant la fin de cette volée :</p><ul>{game.campaign.pending.map(id => <li key={id}>{conquestTargetLabel(game.territories[id-1].target)} · {game.sideNames[game.territories[id-1].owner!]} recevra +1 point</li>)}</ul></div> : null}
      <div className="conquest-board-body">
        <div className="conquest-map-column">
          <div className={`conquest-map-scroll${zoom ? " is-zoomed" : ""}`} tabIndex={zoom ? 0 : undefined} role="region" aria-label="Carte du monde, défilement horizontal en zoom">
            <svg className="conquest-world" viewBox="0 0 1040 580" role="group" aria-label={`Carte du monde en ${regions.length} territoires`}>
              <defs><pattern id={pattern + (fullscreen ? "-full" : "")} width="65" height="58" patternUnits="userSpaceOnUse"><path d="M65 0H0V58" fill="none" stroke="#244157" strokeWidth=".7" /></pattern></defs>
              <rect width="1040" height="580" rx="24" fill="#081927" /><rect width="1040" height="580" rx="24" fill={`url(#${pattern + (fullscreen ? "-full" : "")})`} />
              <g className="conquest-oceans" aria-hidden="true"><text x="98" y="359">PACIFIQUE</text><text x="454" y="307">ATLANTIQUE</text><text x="751" y="447">OCÉAN INDIEN</text></g>
              {routes.map(link => {
                const a = game.territories[link.a-1].owner, b = game.territories[link.b-1].owner;
                return <path key={link.a + "-" + link.b} d={link.path} className={`conquest-sea-link${a !== null && a === b ? " allied conquest-camp-" + a : ""}`} aria-hidden="true" />;
              })}
              {regions.map(r => {
                const t = game.territories[r.id-1], opportunity = strategic && t.owner !== active && conquestCaptureValue(game, t.target, active) > 2;
                return <g key={r.id} role="button" tabIndex={0} data-region={r.id} data-target={t.target} aria-label={`Territoire ${conquestTargetLabel(t.target)} : ${t.owner === null ? "libre" : game.sideNames[t.owner]}`} aria-pressed={regionId === r.id}
                  className={`conquest-region conquest-camp-${t.owner ?? "free"}${opportunity ? " opportunity" : ""}${regionId === r.id ? " selected" : ""}`}
                  onClick={() => setSelected(r.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(r.id); } }}>
                  <title>{conquestTargetLabel(t.target)} · {r.name}{opportunity ? ` · conquête : +${conquestCaptureValue(game, t.target, active)} points` : ""}</title>
                  <path className="conquest-land" d={r.path} />
                  <g transform={`translate(${r.x} ${r.y})`} className={`conquest-map-number${t.target === 25 ? " conquest-bull-number" : ""}`} aria-hidden="true">
                    <rect x={t.target === 25 ? -30 : -21} y="-18" width={t.target === 25 ? 60 : 42} height="36" rx="10" /><text y="8">{t.target === 25 ? "BULL" : t.target}</text>
                    {t.owner !== null ? <text className="conquest-owner-symbol" y="35">{CONQUEST_SYMBOLS[t.owner]}</text> : null}
                    {t.marks[active] > 0 ? <g transform="translate(-15 -32)">{[0,1,2].map(i => <rect key={i} x={i*11} y="0" width="8" height="8" className={i < t.marks[active] ? "mark-filled" : "mark-empty"} />)}</g> : null}
                  </g>
                </g>;
              })}
            </svg>
          </div>
          <div className="conquest-map-legend"><span>— — Route maritime : territoires voisins</span>{strategic ? <span>▱ Bord blanc : bonus de liaison possible</span> : null}<span>Carte de jeu schématique</span></div>
          {!fullscreen ? <div className="conquest-selector" role="group" aria-label="Choisir un territoire">
            {regions.map(r => <button key={r.id} type="button" className={`conquest-camp-${game.territories[r.id-1].owner ?? "free"}`} aria-label={`Examiner ${conquestTargetLabel(game.territories[r.id-1].target)} · ${r.name}`} aria-pressed={regionId === r.id} onClick={() => setSelected(r.id)}>{conquestTargetLabel(game.territories[r.id-1].target)}<span>{game.territories[r.id-1].owner === null ? "·" : CONQUEST_SYMBOLS[game.territories[r.id-1].owner!]}</span></button>)}
          </div> : null}
        </div>
        <aside className={`conquest-inspector conquest-camp-${active}`} aria-label="Détail du territoire">
          <span className="conquest-inspector-label">TERRITOIRE {conquestTargetLabel(territory.target)}</span><h3>{region.name}</h3>
          <p className="conquest-possession">{territory.owner === null ? "Libre" : CONQUEST_SYMBOLS[territory.owner] + " " + game.sideNames[territory.owner]}</p>
          {territory.owner === active ? <p className="conquest-value">À défendre<span>Ce territoire appartient à votre camp.</span></p> : <p className="conquest-value">+{gain} {points ? "points" : "territoire"}<span>{strategic ? `2 de base + ${gain-2} de liaison${gain > 3 ? "s" : ""}, si vous le prenez maintenant.` : "Trois marques pour conquérir."}</span></p>}
          <div className="conquest-marks" aria-label="Marques par camp">{game.sideNames.map((name, side) => <div className={`conquest-camp-${side}`} key={side}><span>{CONQUEST_SYMBOLS[side]} {name}</span><b>{territory.marks[side]}/3</b></div>)}</div>
          {game.campaign && territory.owner !== null && territory.owner !== active ? <p className="conquest-defense-note">{game.campaign.pending.includes(regionId) ? "Bonus en attente : " : "Attaque inachevée : "}+1 point à son propriétaire si vous ne le reprenez pas dans cette volée.</p> : null}
          {territory.target === 25 ? <p className="conquest-defense-note">25 = 1 marque · Bull 50 = 2 marques. Trois marques pour prendre ce carrefour.</p> : null}
          <strong>Voisins</strong><div className="conquest-neighbors">{neighbors.map(id => <button type="button" key={id} className={`conquest-camp-${game.territories[id-1].owner ?? "free"}`} aria-label={`Voir le voisin ${conquestTargetLabel(game.territories[id-1].target)} · ${regions[id-1].name}`} onClick={() => setSelected(id)}>{conquestTargetLabel(game.territories[id-1].target)}</button>)}</div>
          <small>La carte sert à choisir votre stratégie. Enregistrez le lancer dans la saisie des fléchettes.</small>
        </aside>
      </div>
      {strategic && !finished ? <div className="conquest-opportunities"><strong>Conquêtes avantageuses pour {game.participants[game.activeParticipant].name}</strong>{targets.length ? <div>{targets.map(t => <button type="button" key={t.target} onClick={() => setSelected(t.region)}>Secteur {conquestTargetLabel(t.target)} <b>+{t.gain} pts</b></button>)}</div> : <p>Choisissez un premier territoire libre ou adverse. Ses voisins pourront ensuite rapporter davantage.</p>}</div> : null}
    </>;
  }
  return <>
    <section className="conquest-board" aria-label="Territoires de Conquête">{content(false)}</section>
    {expanded ? <dialog ref={modal} className="conquest-stage" aria-label="Conquête, carte agrandie" onCancel={event => { event.preventDefault(); setExpanded(false); }}>{content(true)}</dialog> : null}
  </>;
}
