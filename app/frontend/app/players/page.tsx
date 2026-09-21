import Link from "next/link";
import { Activity, ShieldCheck, Users } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import type { PlayerOverview } from "@/lib/types/sprint4";
import "./players.css";

const SEASONS = [2026, 2027, 2028, 2029] as const;

async function getPlayers(season?: string): Promise<PlayerOverview[]> {
  const base = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";
  const query = season ? `?season_id=${encodeURIComponent(season)}` : "";
  try {
    const response = await fetch(`${base}/api/v1/players${query}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? (await response.json()).players : [];
  } catch {
    return [];
  }
}

const number = (value: number | null, digits = 2) =>
  value == null ? "—" : Number(value).toFixed(digits);

export default async function PlayersPage({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  const requestedSeason = (await searchParams).season;
  const fallbackSeason = SEASONS.includes(new Date().getFullYear() as (typeof SEASONS)[number])
    ? String(new Date().getFullYear())
    : String(SEASONS.at(-1));
  const selectedSeason = SEASONS.map(String).includes(requestedSeason ?? "") ? requestedSeason as string : fallbackSeason;
  const [allPlayers, players] = await Promise.all([getPlayers(), getPlayers(selectedSeason)]);
  const rankedPlayers = players.filter((player) => (player.legs_played ?? 0) > 0);
  const teams = new Set(rankedPlayers.map((player) => player.team).filter(Boolean));

  return (
    <div className="dashboard">
      <Sidebar />
      <main className="main players-page">
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
            {SEASONS.map((year) => (
              <Link className={selectedSeason === String(year) ? "is-active" : ""} href={`/players?season=${year}`} key={year}>
                {year}
              </Link>
            ))}
          </div>
        </nav>

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
            <div><span>SAISON OFFICIELLE</span><h2>Classement des performances — Saison {selectedSeason}</h2></div>
            <p>Les colonnes sont alignées par nature : identité à gauche, indicateurs au centre.</p>
          </div>
          <p className="table-scroll-hint">Faites glisser le tableau horizontalement pour consulter tous les indicateurs.</p><div className="players-table-scroll" tabIndex={0} role="region" aria-label="Tableau des statistiques joueurs, défilement horizontal">
            <table className="players-table">
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
              </colgroup>
              <thead><tr><th scope="col">Joueur</th><th scope="col">Équipe</th><th scope="col">Legs G/J</th><th scope="col">Moy. 3 fl.</th><th scope="col">First 9</th><th scope="col">Meilleur finish</th><th scope="col">180</th><th scope="col">140+</th><th scope="col">100+</th><th scope="col">ELO</th></tr></thead>
              <tbody>
                {rankedPlayers.length ? rankedPlayers.map((player) => (
                  <tr key={player.player_id}>
                    <td><Link className="players-name" href={`/players/${player.player_id}?season=${selectedSeason}`}><strong>{player.name}</strong><span>Voir la fiche →</span></Link></td>
                    <td><span className="players-team">{player.team}</span></td>
                    <td>{player.legs_won ?? "—"}/{player.legs_played ?? "—"}</td>
                    <td>{number(player.average_3_darts)}</td>
                    <td>{number(player.first_9)}</td>
                    <td><strong className="players-finish">{player.best_finish ?? "—"}</strong></td>
                    <td>{player.scores_180}</td><td>{player.scores_140}</td><td>{player.scores_100}</td><td>{player.elo ?? "—"}</td>
                  </tr>
                )) : (
                  <tr className="players-empty"><td colSpan={10}><strong>Aucune statistique publiée pour la saison {selectedSeason}</strong><span>Les joueurs apparaîtront ici dès que les données officielles de la saison seront disponibles.</span></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
