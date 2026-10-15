import { ScoringRangeValue } from "@/components/stats/ScoringRangeValue";
import { StatsTable } from "@/components/stats/StatsTable";
import Link from "next/link";
import { Activity, BookOpen, ShieldCheck, Users } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import type { PlayerOverview } from "@/lib/types/sprint4";
import { getCurrentChampionshipTeams, getPlayerIdentities, getStatisticsCatalog, getStatisticsPlayers } from "@/lib/statistics-data";
import { firstQueryValue, PLAYER_YEARS, playersInCurrentTeam, selectedStatisticsYear, statisticsHref } from "@/lib/statistics-filters";
import "./players.css";

const number = (value: number | null, digits = 2) =>
  value == null ? "—" : Number(value).toFixed(digits);

export default async function PlayersPage({ searchParams }: { searchParams: Promise<{ season?: string | string[]; team?: string | string[] }> }) {
  const query = await searchParams;
  const catalog = await getStatisticsCatalog();
  const selectedSeason = selectedStatisticsYear(query.season, catalog, PLAYER_YEARS);
  const [allPlayers, players, championshipTeams] = await Promise.all([getPlayerIdentities(), getStatisticsPlayers(catalog, selectedSeason), getCurrentChampionshipTeams(catalog)]);
  const requestedTeam = firstQueryValue(query.team);
  const selectedTeam = championshipTeams.find(team => team === requestedTeam);
  const activeYear = catalog?.active_championship?.year;
  const rankedPlayers: PlayerOverview[] = playersInCurrentTeam(players.filter(player => (player.legs_played ?? 0) > 0), selectedTeam, activeYear);
  const teams = new Set(rankedPlayers.map((player) => player.team).filter(Boolean));

  return (
    <div className="dashboard">
      <Sidebar />
      <main className="stats-responsive main players-page">
        <header className="players-hero">
          <div>
            <span>PERFORMANCES OFFICIELLES · 974 DARTS</span>
            <h1>Statistiques joueurs</h1>
            <p>Identités canoniques, statistiques Nakka et historique sportif réunis dans une lecture unique.</p>
          </div>
          <div className="players-hero-mark"><Users size={30} /><strong>{allPlayers.length}</strong><small>joueurs référencés</small></div>
        </header>

        <nav className="players-season-filter" aria-label="Filtrer le classement par saison">
          <div>
            <span>Période statistique</span>
            <strong>Saison {selectedSeason}</strong>
          </div>
          <div className="players-season-options">
            {PLAYER_YEARS.map((year) => (
              <Link className={selectedSeason === String(year) ? "is-active" : ""} href={statisticsHref("/players",year,{team:selectedTeam})} aria-current={selectedSeason === String(year) ? "page" : undefined} key={year}>
                {year}
              </Link>
            ))}
          </div>
        </nav>

        <nav className="players-team-filter" aria-label="Filtrer les joueurs par équipe">
          <strong>Équipe{activeYear ? ` · championnat ${activeYear}` : ""}</strong>
          <div className="players-team-options">
            <Link href={statisticsHref("/players",selectedSeason)} className={!selectedTeam ? "is-active" : ""} aria-current={!selectedTeam ? "page" : undefined}>Toutes les équipes</Link>
            {championshipTeams.map(team => <Link key={team} href={statisticsHref("/players",selectedSeason,{team})} className={selectedTeam === team ? "is-active" : ""} aria-current={selectedTeam === team ? "page" : undefined}>{team}</Link>)}
          </div>
          <p>{championshipTeams.length ? `Filtre par équipe du championnat actuel. Les statistiques restent celles de la saison ${selectedSeason}.` : "La liste des équipes du championnat actuel est temporairement indisponible."}</p>
        </nav>

        <Link className="players-guide-link" href={`/players/kpi?season=${selectedSeason}`}><BookOpen size={18} /> Comprendre les KPI des joueurs →</Link>

        <section className="players-summary" aria-label={`Synthèse des joueurs pour la saison ${selectedSeason}`}>
          <article><Users size={21} /><div><strong>{allPlayers.length}</strong><span>identités publiques</span></div></article>
          <article><Activity size={21} /><div><strong>{rankedPlayers.length}</strong><span>joueurs classés en {selectedSeason}</span></div></article>
          <article><ShieldCheck size={21} /><div><strong>{teams.size}</strong><span>équipes représentées</span></div></article>
        </section>

        <div className="players-data-note">
          <ShieldCheck size={18} />
          <span>Règle Nakka : un finish correspond uniquement au total de la volée. Aucun double ni chemin de checkout n’est inventé.</span>
        </div>

        <section className="players-table-panel">
          <div className="players-table-heading">
            <div><span>SAISON OFFICIELLE</span><h2>Classement des performances — Saison {selectedSeason}</h2>{selectedTeam && <p className="players-selected-team">{selectedTeam}</p>}</div>
            <p>Comparez les moyennes, les legs gagnés et les meilleures performances de chaque joueur. 120–139 est inclus dans 100+ ; « — » indique une couverture incomplète.</p>
          </div>
          <p className="table-scroll-hint">Faites glisser le tableau horizontalement pour consulter tous les indicateurs.</p><div className="players-table-scroll" tabIndex={0} role="region" aria-label="Statistiques des joueurs">
            <StatsTable className="players-table">
              <colgroup>
                <col className="players-col-name" />
                <col className="players-col-team" />
                <col className="players-col-stat" />
                <col className="players-col-stat" />
                <col className="players-col-stat" />
                <col className="players-col-finish" />
                <col className="players-col-stat" />
                <col className="players-col-stat" />
                <col className="players-col-stat" />
                <col className="players-col-stat" />
                <col className="players-col-stat" />
              </colgroup>
              <thead><tr><th scope="col">Joueur</th><th scope="col">Équipe</th><th scope="col">Legs G/J</th><th scope="col">Moy. 3 fl.</th><th scope="col">First 9</th><th scope="col">Meilleur finish</th><th scope="col">100+</th><th scope="col">120–139</th><th scope="col">140+</th><th scope="col">180</th><th scope="col">ELO</th></tr></thead>
              <tbody>
                {rankedPlayers.length ? rankedPlayers.map((player) => (
                  <tr key={player.player_id}>
                    <td><Link className="players-name" href={`/players/${player.player_id}?season=${selectedSeason}`}><strong>{player.name}</strong><span>Voir la fiche →</span></Link></td>
                    <td><span className="players-team">{player.team}</span></td>
                    <td>{player.legs_won ?? "—"}/{player.legs_played ?? "—"}</td>
                    <td>{number(player.average_3_darts)}</td>
                    <td>{number(player.first_9)}</td>
                    <td><strong className="players-finish">{player.best_finish ?? "—"}</strong></td>
                    <td>{player.scores_100}</td><td><ScoringRangeValue data={player} /></td><td>{player.scores_140}</td><td>{player.scores_180}</td><td>{player.elo ?? "—"}</td>
                  </tr>
                )) : (
                  <tr className="players-empty"><td colSpan={11}><strong>{selectedTeam ? `Aucune statistique publiée pour cette équipe en ${selectedSeason}` : `Aucune statistique publiée pour la saison ${selectedSeason}`}</strong><span>{selectedTeam && `${selectedTeam}. `}Les joueurs apparaîtront ici dès que les données officielles de la saison seront disponibles.</span></td></tr>
                )}
              </tbody>
            </StatsTable>
          </div>
        </section>
      </main>
    </div>
  );
}
