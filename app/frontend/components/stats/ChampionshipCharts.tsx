"use client";

import { useId, useMemo, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { ChampionshipRound, Standing } from "@/lib/types/sprint14";
import styles from "./ChampionshipCharts.module.css";

const colors = ["#ffad46", "#59c8ff", "#71e0af", "#c5a0ff", "#ff819c", "#f3e375", "#8adbdc", "#e8bfa1"];
const outcomes = [
  { key: "wins", label: "Victoires", color: "#71e0af" },
  { key: "draws", label: "Nuls", color: "#f3c969" },
  { key: "losses", label: "Défaites", color: "#ff819c" },
] as const;

export function ChampionshipCharts({ standings, rounds, winPoints }: {
  standings: Standing[];
  rounds: ChampionshipRound[];
  winPoints: number;
}) {
  const id = useId();
  const [roundId, setRoundId] = useState("");
  const [teamId, setTeamId] = useState("");
  const selectedRound = rounds.find(round => round.round_id === roundId) ?? rounds.at(-1);
  const teams = useMemo(() => {
    const alphabetical = [...standings].sort((a, b) => a.name.localeCompare(b.name, "fr"));
    return standings.map(team => ({
      ...team,
      // The same team keeps its color across all three cards and round changes.
      color: colors[alphabetical.findIndex(item => item.team_id === team.team_id) % colors.length],
      series: `team${alphabetical.findIndex(item => item.team_id === team.team_id)}`,
    }));
  }, [standings]);
  const visibleTeams = teamId ? teams.filter(team => team.team_id === teamId) : teams;
  const progression = rounds.map(round => ({
    round: round.round,
    ...Object.fromEntries(teams.map(team => [
      team.series, round.teams.find(item => item.team_id === team.team_id)?.cumulative_points ?? 0,
    ])),
  }));
  const maximum = Math.max(winPoints, 1, ...rounds.flatMap(round => round.teams.map(team => team.points ?? 0)));
  const historyEmpty = !rounds.length;
  const emptyText = standings.length
    ? "Le détail par journée n’est pas encore disponible."
    : "Ces graphiques apparaîtront après la publication des premiers résultats.";

  return (
    <section className={styles.grid} aria-label="Graphiques du championnat" data-championship-charts>
      <article className={styles.card} aria-labelledby={`${id}-daily`}>
        <header>
          <span className={styles.eyebrow}>LA JOURNÉE</span>
          <h2 id={`${id}-daily`}>Points par équipe</h2>
          <p>Les points de classement gagnés à chaque journée.</p>
        </header>
        {historyEmpty ? <p className={styles.empty}>{emptyText}</p> : <>
          <label className={styles.field}>
            Journée
            <select value={selectedRound?.round_id} onChange={event => setRoundId(event.target.value)}>
              {rounds.map(round => <option key={round.round_id} value={round.round_id}>{round.round}</option>)}
            </select>
          </label>
          <div className={styles.scale} aria-hidden="true"><span>0 pt</span><span>{maximum} pts</span></div>
          <ul className={styles.bars} data-daily-points>
            {teams.map(team => {
              const score = selectedRound?.teams.find(item => item.team_id === team.team_id);
              const points = score?.points;
              return <li key={team.team_id}>
                <div className={styles.rowHeading}>
                  <span>{team.name}</span>
                  <strong>{points == null ? "—" : `${points} pts`}</strong>
                </div>
                {points == null
                  ? <span className={styles.pending}>Aucun résultat publié</span>
                  : <div className={styles.track} aria-hidden="true"><span style={{ width: `${points / maximum * 100}%`, background: team.color }} /></div>}
              </li>;
            })}
          </ul>
          <p className={styles.note}>{selectedRound?.round} · Résultats publiés uniquement. Les autres rencontres seront ajoutées à leur publication.</p>
        </>}
      </article>

      <article className={styles.card} aria-labelledby={`${id}-progress`}>
        <header>
          <span className={styles.eyebrow}>LA PROGRESSION</span>
          <h2 id={`${id}-progress`}>Course aux points</h2>
          <p>Le total cumulé au fil des journées du championnat.</p>
        </header>
        {historyEmpty ? <p className={styles.empty}>{emptyText}</p> : <>
          <label className={styles.field}>
            Équipe à suivre
            <select value={teamId} onChange={event => setTeamId(event.target.value)}>
              <option value="">Toutes les équipes</option>
              {teams.map(team => <option key={team.team_id} value={team.team_id}>{team.name}</option>)}
            </select>
          </label>
          <span className={styles.unit}>Points cumulés</span>
          <div className={styles.chart} aria-label="Évolution des points cumulés ; valeurs détaillées ci-dessous">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={progression} margin={{ top: 12, right: 20, bottom: 8, left: 0 }} accessibilityLayer>
                <CartesianGrid stroke="#29445f" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="round" tick={{ fill: "#bfd3e5", fontSize: 14 }} tickLine={false} axisLine={false} minTickGap={18} padding={{ left: 12, right: 12 }} />
                <YAxis width={34} allowDecimals={false} domain={[0, "auto"]} tick={{ fill: "#bfd3e5", fontSize: 14 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#0a1a2d", border: "1px solid #365674", borderRadius: 10, color: "#fff", fontSize: 14 }} labelFormatter={label => `Après ${label}`} formatter={(value, name) => [`${value} pts`, name]} />
                {visibleTeams.map((team, index) => <Line key={team.team_id} dataKey={team.series} name={team.name} stroke={team.color} strokeWidth={3} strokeDasharray={index % 2 ? "6 3" : undefined} dot={{ r: 4, strokeWidth: 2, fill: "#0c2035" }} activeDot={{ r: 6 }} isAnimationActive={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ul className={styles.legend} aria-label="Équipes représentées">
            {visibleTeams.map(team => <li key={team.team_id}><i style={{ background: team.color }} aria-hidden="true" />{team.name}</li>)}
          </ul>
          {rounds.length === 1 && <p className={styles.note}>Première journée publiée : les courbes se prolongeront avec les prochains résultats.</p>}
          <details className={styles.details}>
            <summary>Voir les points par journée</summary>
            {rounds.map(round => <div key={round.round_id} className={styles.historyRound}>
              <h3>{round.round}</h3>
              <dl>{visibleTeams.map(team => <div key={team.team_id}>
                <dt>{team.name}</dt>
                <dd>{round.teams.find(item => item.team_id === team.team_id)?.cumulative_points ?? 0} pts</dd>
              </div>)}</dl>
            </div>)}
          </details>
        </>}
      </article>

      <article className={styles.card} aria-labelledby={`${id}-results`}>
        <header>
          <span className={styles.eyebrow}>LES RÉSULTATS</span>
          <h2 id={`${id}-results`}>Bilan des rencontres</h2>
          <p>La répartition des victoires, nuls et défaites par équipe.</p>
        </header>
        {!standings.length ? <p className={styles.empty}>{emptyText}</p> : <>
          <ul className={`${styles.legend} ${styles.outcomes}`}>
            {outcomes.map(outcome => <li key={outcome.key}><i style={{ background: outcome.color }} aria-hidden="true" />{outcome.label}</li>)}
          </ul>
          <ul className={styles.bars} data-match-outcomes>
            {teams.map(team => <li key={team.team_id}>
              <div className={styles.rowHeading}><span>{team.name}</span><strong>{team.played} MJ</strong></div>
              <div className={styles.stacked} role="img" aria-label={`${team.name} : ${team.wins} victoires, ${team.draws} nuls, ${team.losses} défaites`}>
                {outcomes.filter(outcome => team[outcome.key] > 0).map(outcome => <span key={outcome.key} style={{ flex: team[outcome.key], background: outcome.color }} aria-hidden="true">{team[outcome.key]}</span>)}
              </div>
              <span className={styles.pending}>{team.wins} V · {team.draws} N · {team.losses} D</span>
            </li>)}
          </ul>
          <p className={styles.note}>MJ : matchs joués. Chaque barre représente le bilan de l’équipe sur la saison. Les défaites incluent les forfaits.</p>
        </>}
      </article>
    </section>
  );
}
