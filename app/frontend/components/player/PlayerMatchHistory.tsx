"use client";

import { useMemo, useState } from "react";
import type { PlayerDashboard } from "@/lib/player/dashboard-types";

type Match = PlayerDashboard["recent_matches"][number];
const number = (value: number | null | undefined, digits = 2) => value == null ? "—" : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);

export function PlayerMatchHistory({ matches }: { matches: Match[] }) {
  const [mode, setMode] = useState("Tous");
  const [result, setResult] = useState("Tous");
  const [sort, setSort] = useState("recent");

  const modes = useMemo(() => ["Tous", ...Array.from(new Set(matches.map((match) => match.mode).filter(Boolean) as string[]))], [matches]);
  const displayed = useMemo(() => {
    const selected = matches.filter((match) => (mode === "Tous" || match.mode === mode) && (result === "Tous" || (result === "Victoire" ? match.win_rate >= 50 : match.win_rate < 50)));
    return [...selected].sort((a, b) => sort === "average" ? (b.average_3_darts ?? -1) - (a.average_3_darts ?? -1) : 0);
  }, [matches, mode, result, sort]);

  return (
    <section className="card recent-matches-card">
      <div className="section-heading history-heading">
        <div><span className="eyebrow">Historique</span><h3>Derniers matchs</h3></div>
        <div className="history-filters">
          <select value={mode} onChange={(event) => setMode(event.target.value)} aria-label="Filtrer par mode">{modes.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={result} onChange={(event) => setResult(event.target.value)} aria-label="Filtrer par résultat"><option>Tous</option><option>Victoire</option><option>Défaite</option></select>
          <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Trier les matchs"><option value="recent">Plus récents</option><option value="average">Meilleure moyenne</option></select>
          <span className="chart-chip">{displayed.length} affichés</span>
        </div>
      </div>
      <div className="table-scroll">
        <table className="table player-match-table">
          <thead><tr><th>Journée</th><th>Adversaire</th><th>Mode</th><th>Legs</th><th>Résultat</th><th>Moyenne</th><th>Finish</th><th>100+</th><th>140+</th></tr></thead>
          <tbody>
            {displayed.map((match) => (
              <tr key={match.match_id}>
                <td><strong>{match.round}</strong></td><td>{match.opponent_names ?? match.opponent_team ?? match.encounter}</td><td><span className="match-mode">{match.mode ?? "—"}</span></td>
                <td>{match.legs_won} / {match.legs_played}</td><td><span className={match.win_rate >= 50 ? "result-win" : "result-loss"}>{match.win_rate >= 50 ? "Victoire" : "Défaite"} · {number(match.win_rate, 1)}%</span></td>
                <td>{number(match.average_3_darts)}</td><td>{match.best_finish ?? "—"}</td><td>{match.scores_100_plus}</td><td>{match.scores_140_plus}</td>
              </tr>
            ))}
            {!displayed.length && <tr><td colSpan={9} className="empty-cell">Aucun match ne correspond aux filtres.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
