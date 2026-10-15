"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChampionshipRound } from "@/lib/types/sprint14";
import type { DashboardTeam } from "./ChampionshipCharts";
import styles from "./ChampionshipCharts.module.css";

export function ChampionshipProgression({ teams, rounds, teamId, onTeamChange, id }: {
  teams: DashboardTeam[]; rounds: ChampionshipRound[]; teamId: string; onTeamChange: (id: string) => void; id: string;
}) {
  const [mode, setMode] = useState<"cumulative" | "daily">("cumulative");
  const progression = rounds.map(round => ({
    round: round.round,
    roundId: round.round_id,
    ...Object.fromEntries(teams.map(team => {
      const score = round.teams.find(item => item.team_id === team.team_id);
      // A missing publication is a gap in daily mode, never an invented zero.
      return [team.series, mode === "daily" ? score?.points ?? null : score?.cumulative_points ?? null];
    })),
  }));
  return <article className={`${styles.card} ${styles.progressCard}`} aria-labelledby={`${id}-progress`}>
    <header className={styles.heading}><span className={styles.eyebrow}>LA COURSE AU TITRE</span><h2 id={`${id}-progress`}>Progression visuelle des équipes</h2><p>Comparez les trajectoires au fil des journées officielles.</p></header>
    {rounds.length ? <>
      <div className={styles.controls}>
        <div className={styles.mode} role="group" aria-label="Mode de progression">
          <button type="button" aria-pressed={mode === "cumulative"} onClick={() => setMode("cumulative")}>Cumul</button>
          <button type="button" aria-pressed={mode === "daily"} onClick={() => setMode("daily")}>Par journée</button>
        </div>
        <div className={styles.field}><label htmlFor={`${id}-team`}>Équipe à suivre</label><select id={`${id}-team`} value={teamId} onChange={event => onTeamChange(event.target.value)}><option value="">Toutes les équipes</option>{teams.map(team => <option key={team.team_id} value={team.team_id}>{team.name}</option>)}</select></div>
      </div>
      <span className={styles.unit}>{mode === "cumulative" ? "Points cumulés" : "Points gagnés par journée"}</span>
      <div className={styles.chart} role="img" aria-label={`${mode === "cumulative" ? "Points cumulés" : "Points par journée"} par équipe. Tableau détaillé disponible ci-dessous.`}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={progression} margin={{ top: 16, right: 18, bottom: 4, left: 0 }} accessibilityLayer>
            <CartesianGrid stroke="#3a3a3c" strokeDasharray="2 5" vertical={false} />
            <XAxis dataKey="round" tick={{ fill: "#c5c5cb", fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={14} padding={{ left: 10, right: 10 }} />
            <YAxis width={30} allowDecimals={false} domain={[0, "auto"]} tick={{ fill: "#c5c5cb", fontSize: 12 }} tickLine={false} axisLine={false} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const round = rounds.find(item => item.round_id === payload[0].payload.roundId);
              if (!round) return null;
              return <div className={styles.tooltip}><strong>{round.round} · points officiels</strong>{teams.filter(team => !teamId || team.team_id === teamId).map(team => {
                const score = round.teams.find(item => item.team_id === team.team_id);
                return <div key={team.team_id}><i className={styles.dot} style={{ background: team.color }} aria-hidden="true" /><span>{team.name}<small>{score?.points == null ? "Aucun résultat publié" : `${score.points} pts gagnés`} · cumul {score?.cumulative_points ?? "—"} pts</small></span></div>;
              })}</div>;
            }} />
            {teams.map((team, index) => <Line key={team.team_id} dataKey={team.series} name={team.name} stroke={team.color} strokeOpacity={!teamId || team.team_id === teamId ? 1 : .2} strokeWidth={team.team_id === teamId ? 4 : 2.5} strokeDasharray={index >= 4 ? "6 3" : undefined} dot={{ r: 3.5, strokeWidth: 1.5, fill: "#18181b" }} activeDot={{ r: 6 }} connectNulls={false} isAnimationActive={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className={styles.legend} aria-label="Équipes représentées">{teams.map(team => <li key={team.team_id}><button type="button" aria-pressed={teamId === team.team_id} onClick={() => onTeamChange(teamId === team.team_id ? "" : team.team_id)} data-muted={!!teamId && teamId !== team.team_id || undefined}><i className={styles.dot} style={{ background: team.color }} aria-hidden="true" />{team.name}</button></li>)}</ul>
      <p className={styles.note}>{mode === "daily" ? "Une interruption indique un résultat non publié, et non zéro point." : "Sélectionnez une équipe dans la légende pour souligner sa trajectoire."}{rounds.length === 1 ? " Première journée publiée : les courbes se prolongeront avec les prochains résultats." : ""}</p>
      <details className={styles.details}>
        <summary>Voir les points par journée</summary>
        <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Détail des points par journée, tableau défilant"><table className={styles.table}>
          <thead><tr><th scope="col">Journée</th><th scope="col">Équipe</th><th scope="col">Gagnés</th><th scope="col">Cumul</th></tr></thead>
          <tbody>{rounds.flatMap(round => teams.map(team => {
            const score = round.teams.find(item => item.team_id === team.team_id);
            return <tr key={`${round.round_id}-${team.team_id}`}><th scope="row">{round.round}</th><td>{team.name}</td><td>{score?.points == null ? "Aucun résultat publié" : `${score.points} pts`}</td><td>{score?.cumulative_points == null ? "—" : `${score.cumulative_points} pts`}</td></tr>;
          }))}</tbody>
        </table></div>
      </details>
    </> : <p className={styles.empty}>La progression apparaîtra après la publication des premiers résultats officiels.</p>}
  </article>;
}
