"use client";

import { useMemo, useState } from "react";
import type { CricketCoordinate, CricketMatch, CricketPlayer } from "@/lib/cricket/test-match";

type LegFilter = "all" | 0 | 1;

const boardNumbers = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

const BOARD = { bull: 6.35, outerBull: 15.9, tripleInner: 99.4, tripleOuter: 107.4, doubleInner: 162, doubleOuter: 170 } as const;

function polar(radius: number, angle: number) {
  const radians = angle * Math.PI / 180;
  return [Math.cos(radians) * radius, Math.sin(radians) * radius] as const;
}

function ringSector(inner: number, outer: number, start: number, end: number) {
  const [x1, y1] = polar(outer, start); const [x2, y2] = polar(outer, end);
  const [x3, y3] = polar(inner, end); const [x4, y4] = polar(inner, start);
  return `M ${x1} ${y1} A ${outer} ${outer} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 0 0 ${x4} ${y4} Z`;
}

function coordinates(player: CricketPlayer, filter: LegFilter): readonly CricketCoordinate[] {
  return filter === "all" ? player.coordinatesByLeg.flat() : player.coordinatesByLeg[filter] ?? [];
}

function DartboardHeatmap({ player, filter }: { player: CricketPlayer; filter: LegFilter }) {
  const points = coordinates(player, filter);
  return <div className="heatmap-player"><h3>{player.name}</h3><svg className="dart-heatmap" viewBox="-205 -205 410 410" role="img" aria-label={`Heatmap des impacts de ${player.name}`}>
    <defs><filter id={`heat-${player.id}`} x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="8" /></filter></defs>
    <circle r={BOARD.doubleOuter} className="board-outer" />
    {boardNumbers.map((number, index) => {
      const center = -90 + index * 18, start = center - 9, end = center + 9;
      const single = index % 2 === 0 ? "board-segment-dark" : "board-segment-light";
      const multiplier = index % 2 === 0 ? "board-multiplier-red" : "board-multiplier-green";
      return <g key={`sector-${number}`}><path d={ringSector(BOARD.outerBull,BOARD.tripleInner,start,end)} className={single}/><path d={ringSector(BOARD.tripleInner,BOARD.tripleOuter,start,end)} className={multiplier}/><path d={ringSector(BOARD.tripleOuter,BOARD.doubleInner,start,end)} className={single}/><path d={ringSector(BOARD.doubleInner,BOARD.doubleOuter,start,end)} className={multiplier}/></g>;
    })}
    {[BOARD.outerBull,BOARD.tripleInner,BOARD.tripleOuter,BOARD.doubleInner,BOARD.doubleOuter].map((r)=><circle key={r} r={r} className="board-wire-ring"/>)}
    {boardNumbers.map((number, index) => {
      const center=-90+index*18, boundary=center-9;
      const [x1,y1]=polar(BOARD.outerBull,boundary), [x2,y2]=polar(BOARD.doubleOuter,boundary), [tx,ty]=polar(190,center);
      return <g key={number}><line x1={x1} y1={y1} x2={x2} y2={y2} className="board-spoke"/><text x={tx} y={ty+5}>{number}</text></g>;
    })}
    <circle r={BOARD.outerBull} className="board-outer-bull"/><circle r={BOARD.bull} className="board-bull"/>
    <g filter={`url(#heat-${player.id})`} className="heat-glow">{points.map(([x,y],index)=><circle key={index} cx={x} cy={-y} r="13"/>)}</g>
    <g className="heat-core">{points.map(([x,y],index)=><circle key={index} cx={x} cy={-y} r="4.4"/>)}</g>
  </svg><small>{points.length} fléchettes affichées</small></div>;
}

export function CricketAnalysis({ match }: { match: CricketMatch }) {
  const [filter, setFilter] = useState<LegFilter>("all");
  const [view, setView] = useState<"heatmap" | "coordinates">("heatmap");
  const players = useMemo(() => [...match.players].reverse(), [match.players]);
  return <>
    <nav className="leg-tabs" aria-label="Filtrer les manches">
      <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Tous les legs</button>
      <button className={filter === 0 ? "active" : ""} onClick={() => setFilter(0)}>Leg 1</button>
      <button className={filter === 1 ? "active" : ""} onClick={() => setFilter(1)}>Leg 2</button>
    </nav>
    <section className="cricket-analysis-grid">
      <aside className="cricket-stat-panel"><h2>Statistiques</h2><table><thead><tr><th></th>{players.map((p) => <th key={p.id}>{p.name}</th>)}</tr></thead><tbody>
        <tr><th>Manches gagnées</th>{players.map((p) => <td key={p.id}>{p.legs}</td>)}</tr>
        <tr><th>Lancers</th>{players.map((p) => <td key={p.id}>{coordinates(p, filter).length}</td>)}</tr>
        <tr><th>Points</th>{players.map((p) => <td key={p.id}>{p.points}</td>)}</tr>
        <tr><th>Points par tour</th>{players.map((p) => <td key={p.id}>{p.scorePerRound.toFixed(2)}</td>)}</tr>
        <tr><th>Marques</th>{players.map((p) => <td key={p.id}>{p.marks}</td>)}</tr>
        <tr><th>Marques par tour</th>{players.map((p) => <td key={p.id}>{p.marksPerRound.toFixed(2)}</td>)}</tr>
      </tbody></table><p>Les totaux de points et marques correspondent à la partie complète.</p></aside>
      <div className="cricket-visual-panel">
        <header><div><span>Analyse du lancer</span><b>Données Scolia</b></div><nav><button className={view === "heatmap" ? "active" : ""} onClick={() => setView("heatmap")}>Heatmap</button><button className={view === "coordinates" ? "active" : ""} onClick={() => setView("coordinates")}>Coordonnées</button></nav></header>
        {view === "heatmap" ? <div className="heatmap-grid">{players.map((player) => <DartboardHeatmap key={player.id} player={player} filter={filter} />)}</div> : <div className="coordinate-grid">{players.map((player) => <article key={player.id}><h3>{player.name}</h3><div>{coordinates(player, filter).map(([x, y], index) => <span key={index}>{index + 1}. x {x}, y {y}</span>)}</div></article>)}</div>}
      </div>
    </section>
  </>;
}
