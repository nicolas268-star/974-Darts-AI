"use client";

import { startTransition, useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Flag, Target, Trophy } from "lucide-react";
import type { ChampionshipHub, ChampionshipRound, Standing } from "@/lib/types/sprint14";
import { ChampionshipProgression } from "./ChampionshipProgression";
import styles from "./ChampionshipCharts.module.css";

const colors = ["#ff9b38", "#50c7ff", "#60dcab", "#b89aff", "#ff7399", "#ffe16a", "#6ee0df", "#eeaf83"];
export type DashboardTeam = Standing & { color: string; series: string };
const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`;
const percentage = (wins: number, played: number) => played ? `${Math.round(wins / played * 100)} %` : "—";

function ChampionshipStandings({ teams, id }: { teams: DashboardTeam[]; id: string }) {
  const maximum = Math.max(1, ...teams.map(team => team.points));
  return <article className={styles.card} aria-labelledby={`${id}-ranking`}>
    <header className={styles.heading}>
      <span className={styles.eyebrow}>LE CLASSEMENT</span>
      <h2 id={`${id}-ranking`}>Classement des équipes</h2>
      <p>Points et départage officiels · {teams.length} équipes</p>
    </header>
    {teams.length ? <>
      <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Classement des équipes, tableau défilant">
        <table className={styles.table} data-team-standings>
          <thead><tr><th scope="col">#</th><th scope="col">Équipe</th><th scope="col">Pts</th><th scope="col">MJ</th><th scope="col">V</th><th scope="col">N</th><th scope="col">D</th><th scope="col">Sets +/−</th><th scope="col">Legs +/−</th></tr></thead>
          <tbody>{teams.map(team => <tr key={team.team_id}>
            <td><span className={styles.rank} data-podium={team.rank <= 3 ? team.rank : undefined}>{team.rank}</span></td>
            <th scope="row" className={styles.teamCell}>
              <Link href={`/teams/${team.team_id}`}><i className={styles.dot} style={{ background: team.color }} aria-hidden="true" />{team.name}</Link>
              <span className={styles.pointsTrack} aria-hidden="true"><span style={{ width: `${Math.max(0, team.points) / maximum * 100}%`, background: team.color }} /></span>
            </th>
            <td className={styles.points}>{team.points}</td><td>{team.played}</td><td>{team.wins}</td><td>{team.draws}</td><td>{team.losses}</td>
            <td>{signed(team.set_difference)}</td>
            <td title={!team.detail_complete ? "Détail des legs incomplet : écart non affiché" : undefined}>{team.detail_complete ? signed(team.leg_difference) : "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className={styles.note}>MJ : rencontres jouées. Sets : parties individuelles ou doubles. Legs : manches détaillées ; « — » si le détail est incomplet. Sélectionnez une équipe pour sa fiche.</p>
    </> : <p className={styles.empty}>Le classement apparaîtra après la publication des premiers résultats officiels.</p>}
  </article>;
}

function MatchOutcomes({ teams, teamId, rounds, id }: { teams: DashboardTeam[]; teamId: string; rounds: ChampionshipRound[]; id: string }) {
  const selected = teams.find(team => team.team_id === teamId);
  // Season totals count encounters once. V/N/D and win rate are team records.
  const played = teams.reduce((sum, team) => sum + team.played, 0) / 2;
  return <article className={`${styles.card} ${styles.resultsCard}`} aria-labelledby={`${id}-results`}>
    <header className={styles.heading}><span className={styles.eyebrow}>LES RÉSULTATS</span><h2 id={`${id}-results`}>Bilan des rencontres</h2><p>{selected?.name ?? "Résultats officiels de la saison"}</p></header>
    <div className={styles.resultSummary}>
      <div><strong>{selected ? selected.played : played}</strong><span>Rencontres jouées</span></div>
      <div><strong>{selected ? percentage(selected.wins, selected.played) : rounds.length}</strong><span>{selected ? "Victoires" : "Journées avec résultats"}</span></div>
    </div>
    {teams.length ? <>
      <div className={styles.outcomeLegend} aria-hidden="true"><span>Victoires</span><span>Nuls</span><span>Défaites</span></div>
      <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Bilan des équipes, tableau défilant">
        <table className={`${styles.table} ${styles.outcomeTable}`} data-match-outcomes>
          <thead><tr><th scope="col">Équipe</th><th scope="col">MJ</th><th scope="col">V</th><th scope="col">N</th><th scope="col">D</th><th scope="col">% V</th><th scope="col">V / N / D</th></tr></thead>
          <tbody>{teams.map(team => <tr key={team.team_id} data-selected={teamId === team.team_id || undefined}>
            <th scope="row"><i className={styles.dot} style={{ background: team.color }} aria-hidden="true" />{team.name}</th>
            <td>{team.played}</td><td className={styles.wins}>{team.wins}</td><td className={styles.draws}>{team.draws}</td><td className={styles.losses}>{team.losses}</td><td>{percentage(team.wins, team.played)}</td>
            <td><span className={styles.stacked} aria-hidden="true"><i style={{ flex: team.wins, background: "#60dcab" }} /><i style={{ flex: team.draws, background: "#ffe16a" }} /><i style={{ flex: team.losses, background: "#ff7399" }} /></span></td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className={styles.note}>V / N / D et taux de victoire par équipe. Les défaites incluent les forfaits. Les rencontres reportées ou en attente ne sont pas comptées.</p>
    </> : <p className={styles.empty}>Le bilan apparaîtra après la publication des premiers résultats.</p>}
  </article>;
}

export function ChampionshipCharts({ data, today }: { data: ChampionshipHub; today: string }) {
  const { standings, round_history: rounds = [], championship, leaders, schedule } = data;
  const id = useId();
  const router = useRouter();
  const [teamId, setTeamId] = useState("");
  const teams = useMemo(() => {
    const alphabetical = [...standings].sort((a, b) => a.name.localeCompare(b.name, "fr"));
    return standings.map(team => {
      const index = alphabetical.findIndex(item => item.team_id === team.team_id);
      return { ...team, color: colors[index % colors.length], series: `team${index}` };
    });
  }, [standings]);
  const selectedTeam = teams.some(team => team.team_id === teamId) ? teamId : "";
  const leader = standings.find(team => team.rank === 1 && team.played > 0);
  const best = leaders.filter(player => player.legs_played > 0 && player.average_3_darts != null && Number.isFinite(player.average_3_darts))
    .sort((a, b) => b.average_3_darts! - a.average_3_darts!)[0];
  const next = schedule?.filter(fixture => fixture.played_on >= today).sort((a, b) => a.played_on.localeCompare(b.played_on))[0];

  useEffect(() => {
    if (!championship.is_active) return;
    const refresh = () => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh());
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [championship.is_active, router]);

  return <section className={styles.dashboard} aria-label="Dashboard du championnat" data-championship-charts>
    <div className={styles.kpis} aria-label="Résumé du championnat">
      <article className={styles.kpi}><Trophy aria-hidden="true" /><div><span>Leader actuel</span><strong className={styles.leader}>{leader?.name ?? "En attente"}</strong><small>Classement officiel · saison {championship.year}</small></div></article>
      <article className={styles.kpi}><Flag aria-hidden="true" /><div><span>Points du leader</span><strong>{leader?.points ?? "—"}<small> pts</small></strong><small>{standings.length} équipes classées</small></div></article>
      <article className={styles.kpi}><CalendarDays aria-hidden="true" /><div><span>Journées publiées</span><strong>{championship.published_rounds}<small> / {championship.rounds}</small></strong><small>{rounds.at(-1)?.round ?? "Aucun résultat publié"}{rounds.length ? " · dernière journée avec résultats" : ""}</small></div></article>
      <article className={styles.kpi}><Target aria-hidden="true" /><div><span>Meilleure moy. joueur</span><strong>{best?.average_3_darts?.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "—"}</strong><small>{best ? `${best.name} · moyenne 3 fléchettes` : "Statistique indisponible"}</small></div></article>
      {next && <article className={styles.kpi}><CalendarDays aria-hidden="true" /><div><span>Prochaine journée</span><strong>{next.round}</strong><small>{new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Indian/Reunion" }).format(new Date(`${next.played_on}T12:00:00+04:00`))}</small></div></article>}
    </div>
    <div className={styles.grid}>
      <ChampionshipStandings teams={teams} id={id} />
      <ChampionshipProgression teams={teams} rounds={rounds} teamId={selectedTeam} onTeamChange={setTeamId} id={id} />
      <MatchOutcomes teams={teams} teamId={selectedTeam} rounds={rounds} id={id} />
    </div>
    <p className={styles.sourceNote}>Résultats publiés uniquement · Barème et départage officiels conservés{championship.is_active ? " · Actualisation automatique toutes les minutes" : ""}</p>
  </section>;
}
