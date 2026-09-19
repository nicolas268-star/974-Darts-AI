import Link from "next/link";
import { Activity, ShieldCheck, Users } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import type { PlayerOverview } from "@/lib/types/sprint4";
import "./players.css";

async function getPlayers(): Promise<PlayerOverview[]> {
  const base = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";
  try {
    const response = await fetch(`${base}/api/v1/players`, {
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

export default async function PlayersPage() {
  const players = await getPlayers();
  const activePlayers = players.filter((player) => (player.legs_played ?? 0) > 0);
  const teams = new Set(players.map((player) => player.team).filter(Boolean));

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
          <div className="players-hero-mark"><Users size={30} /><strong>{players.length}</strong><small>joueurs référencés</small></div>
        </header>

        <section className="players-summary" aria-label="Synthèse des joueurs">
          <article><Users size={21} /><div><strong>{players.length}</strong><span>identités publiques</span></div></article>
          <article><Activity size={21} /><div><strong>{activePlayers.length}</strong><span>joueurs avec statistiques</span></div></article>
          <article><ShieldCheck size={21} /><div><strong>{teams.size}</strong><span>équipes représentées</span></div></article>
        </section>

        <div className="players-data-note">
          <ShieldCheck size={18} />
          <span>Règle Nakka : un finish correspond uniquement au total de la volée. Aucun double ni chemin de checkout n’est inventé.</span>
        </div>

        <section className="players-table-panel">
          <div className="players-table-heading">
            <div><span>SAISON OFFICIELLE</span><h2>Répertoire des performances</h2></div>
            <p>Les colonnes sont alignées par nature : identité à gauche, indicateurs au centre.</p>
          </div>
          <div className="players-table-scroll">
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
                {players.length ? players.map((player) => (
                  <tr key={player.player_id}>
                    <td><Link className="players-name" href={`/players/${player.player_id}`}><strong>{player.name}</strong><span>Voir la fiche →</span></Link></td>
                    <td><span className="players-team">{player.team}</span></td>
                    <td>{player.legs_won ?? "—"}/{player.legs_played ?? "—"}</td>
                    <td>{number(player.average_3_darts)}</td>
                    <td>{number(player.first_9)}</td>
                    <td><strong className="players-finish">{player.best_finish ?? "—"}</strong></td>
                    <td>{player.scores_180}</td><td>{player.scores_140}</td><td>{player.scores_100}</td><td>{player.elo ?? "—"}</td>
                  </tr>
                )) : (
                  <tr className="players-empty"><td colSpan={10}><strong>Aucun joueur disponible</strong><span>Les identités apparaîtront dès que la source sportive sera accessible.</span></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
