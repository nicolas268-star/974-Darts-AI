"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search, Trophy, Users, Gauge, Target } from "lucide-react";
import type { DuoOverview } from "@/lib/duo/types";

type SortKey = "fair_score" | "rank" | "duo" | "team" | "matches_played" | "legs_won" | "win_rate" | "average_3_darts" | "first_9" | "best_finish" | "scores_180";
type SortDirection = "asc" | "desc";

const PAGE_SIZE = 12;
const number = (value: number | null, decimals = 2) => value == null ? "—" : Number(value).toFixed(decimals);

// Borne basse de Wilson à 95 % : récompense la performance tout en tenant compte
// du volume de legs. Un 4/4 reste excellent, mais ne passe pas automatiquement
// devant un 19/25 obtenu sur un échantillon beaucoup plus solide.
function fairRankingScore(legsWon: number, legsPlayed: number): number {
  if (legsPlayed <= 0) return 0;
  const z = 1.96;
  const p = legsWon / legsPlayed;
  const z2 = z * z;
  const denominator = 1 + z2 / legsPlayed;
  const centre = p + z2 / (2 * legsPlayed);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * legsPlayed)) / legsPlayed);
  return Math.max(0, ((centre - margin) / denominator) * 100);
}

function SortButton({ label, column, sortKey, direction, onSort }: { label: string; column: SortKey; sortKey: SortKey; direction: SortDirection; onSort: (key: SortKey) => void }) {
  const active = column === sortKey;
  return <button className={`duo-sort ${active ? "active" : ""}`} onClick={() => onSort(column)} type="button">
    {label}{active ? direction === "asc" ? <ArrowUp size={14}/> : <ArrowDown size={14}/> : <ArrowUpDown size={14}/>} 
  </button>;
}

export function DuoListDashboard({ duos, seasonName }: { duos: DuoOverview[]; seasonName: string }) {
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("fair_score");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

  const teams = useMemo(() => Array.from(new Set(duos.map(d => d.team).filter((x): x is string => Boolean(x)))).sort((a,b) => a.localeCompare(b, "fr")), [duos]);

  const rankedDuos = useMemo(() => {
    return duos
      .map(d => ({ ...d, fair_score: fairRankingScore(d.legs_won, d.legs_played) }))
      .sort((a, b) => b.fair_score - a.fair_score || b.legs_played - a.legs_played || b.win_rate - a.win_rate)
      .map((d, index) => ({ ...d, fair_rank: index + 1 }));
  }, [duos]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fr");
    const data = rankedDuos.filter(d => {
      const matchQuery = !normalized || `${d.player_1.name} ${d.player_2.name} ${d.team ?? ""}`.toLocaleLowerCase("fr").includes(normalized);
      return matchQuery && (team === "all" || d.team === team);
    });
    const value = (d: (typeof rankedDuos)[number]): string | number => {
      switch(sortKey) {
        case "rank": return d.fair_rank;
        case "fair_score": return d.fair_score;
        case "duo": return `${d.player_1.name} ${d.player_2.name}`;
        case "team": return d.team ?? "";
        default: return d[sortKey] ?? -1;
      }
    };
    return [...data].sort((a,b) => {
      const av = value(a), bv = value(b);
      const result = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv, "fr") : Number(av) - Number(bv);
      return direction === "asc" ? result : -result;
    });
  }, [rankedDuos, query, team, sortKey, direction]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const totalMatches = duos.reduce((sum,d) => sum + d.matches_played, 0);
  const totalLegs = duos.reduce((sum,d) => sum + d.legs_played, 0);
  const weightedWinRate = totalLegs ? duos.reduce((sum,d) => sum + d.legs_won, 0) / totalLegs * 100 : 0;
  const totalScore = duos.reduce((sum,d) => sum + d.score, 0);
  const weightedAverage = totalScore ? duos.reduce((sum,d) => sum + (d.average_3_darts ?? 0) * d.score, 0) / totalScore : 0;
  const total180 = duos.reduce((sum,d) => sum + d.scores_180, 0);

  function sort(column: SortKey) {
    if (column === sortKey) setDirection(v => v === "asc" ? "desc" : "asc");
    else { setSortKey(column); setDirection(column === "duo" || column === "team" ? "asc" : "desc"); }
    setPage(1);
  }

  function resetPage() { setPage(1); }

  return <>
    <div className="duo-kpi-grid">
      <article className="card duo-kpi"><span className="duo-kpi-icon"><Users size={21}/></span><small>Duos détectés</small><strong>{duos.length}</strong><em>Saison {seasonName}</em></article>
      <article className="card duo-kpi"><span className="duo-kpi-icon"><Trophy size={21}/></span><small>Matchs de duo</small><strong>{totalMatches}</strong><em>{totalLegs} legs analysés</em></article>
      <article className="card duo-kpi"><span className="duo-kpi-icon"><Gauge size={21}/></span><small>Taux de réussite</small><strong>{number(weightedWinRate, 1)}%</strong><em>Calculé sur les legs</em></article>
      <article className="card duo-kpi"><span className="duo-kpi-icon"><Target size={21}/></span><small>Moyenne globale</small><strong>{number(weightedAverage)}</strong><em>{total180} score{total180 > 1 ? "s" : ""} de 180</em></article>
    </div>

    <section className="card duo-controls">
      <label className="duo-search"><Search size={18}/><input value={query} onChange={e => { setQuery(e.target.value); resetPage(); }} placeholder="Rechercher un joueur, un duo ou une équipe…" /></label>
      <label className="duo-filter"><span>Équipe</span><select value={team} onChange={e => { setTeam(e.target.value); resetPage(); }}><option value="all">Toutes les équipes</option>{teams.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
      <div className="duo-result-count"><strong>{filtered.length}</strong><span>duo{filtered.length > 1 ? "s" : ""} affiché{filtered.length > 1 ? "s" : ""}</span></div>
    </section>

    <section className="card duo-table-card">
      <div className="table-scroll"><table className="table duo-table"><thead><tr>
        <th><SortButton label="#" column="rank" sortKey={sortKey} direction={direction} onSort={sort}/></th>
        <th><SortButton label="Duo" column="duo" sortKey={sortKey} direction={direction} onSort={sort}/></th>
        <th><SortButton label="Équipe" column="team" sortKey={sortKey} direction={direction} onSort={sort}/></th>
        <th><SortButton label="Matchs" column="matches_played" sortKey={sortKey} direction={direction} onSort={sort}/></th>
        <th><SortButton label="Legs G/J" column="legs_won" sortKey={sortKey} direction={direction} onSort={sort}/></th>
        <th><SortButton label="Indice équitable" column="fair_score" sortKey={sortKey} direction={direction} onSort={sort}/></th>
        <th><SortButton label="Win %" column="win_rate" sortKey={sortKey} direction={direction} onSort={sort}/></th>
        <th><SortButton label="Moy. 3 fl." column="average_3_darts" sortKey={sortKey} direction={direction} onSort={sort}/></th>
        <th><SortButton label="First 9" column="first_9" sortKey={sortKey} direction={direction} onSort={sort}/></th>
        <th><SortButton label="Best finish" column="best_finish" sortKey={sortKey} direction={direction} onSort={sort}/></th>
        <th><SortButton label="180" column="scores_180" sortKey={sortKey} direction={direction} onSort={sort}/></th>
      </tr></thead><tbody>{rows.map(d => <tr key={d.duo_id}>
        <td><span className={`duo-rank ${d.fair_rank <= 3 ? "podium" : ""}`}>{d.fair_rank}</span></td>
        <td><Link className="duo-name-link" href={`/duos/${d.player_1.id}/${d.player_2.id}`}><strong>{d.player_1.name} <span>+</span> {d.player_2.name}</strong><small>Voir la fiche du duo →</small></Link></td>
        <td><span className="duo-team-chip">{d.team ?? "—"}</span></td>
        <td>{d.matches_played}</td><td>{d.legs_won}/{d.legs_played}</td>
        <td><strong title="Borne basse de Wilson à 95 %, calculée sur les legs gagnés/joués">{number(d.fair_score, 1)}</strong></td>
        <td><span className={`duo-win ${d.win_rate >= 60 ? "good" : d.win_rate < 40 ? "low" : ""}`}>{number(d.win_rate,1)}%</span></td>
        <td><strong>{number(d.average_3_darts)}</strong></td><td>{number(d.first_9)}</td><td>{d.best_finish ?? "—"}</td><td>{d.scores_180}</td>
      </tr>)}{rows.length === 0 && <tr><td className="empty-cell" colSpan={11}>Aucun duo ne correspond aux filtres.</td></tr>}</tbody></table></div>
      <footer className="duo-pagination"><span>Page {currentPage} sur {pages}</span><div><button type="button" disabled={currentPage <= 1} onClick={() => setPage(p => Math.max(1,p-1))}><ChevronLeft size={17}/> Précédent</button><button type="button" disabled={currentPage >= pages} onClick={() => setPage(p => Math.min(pages,p+1))}>Suivant <ChevronRight size={17}/></button></div></footer>
    </section>
  </>;
}
