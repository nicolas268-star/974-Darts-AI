import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import type { CompetitionCatalog } from "@/lib/types/sprint14";
import "../competitions/competition-hub.css";

async function loadTournaments(): Promise<
  CompetitionCatalog["tournaments"] | null
> {
  const base = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";
  try {
    const response = await fetch(
      `${base}/api/v1/competitions/tournaments`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) return null;
    const payload = await response.json();
    return payload.tournaments ?? [];
  } catch {
    return null;
  }
}

export default async function TournamentsPage() {
  const tournaments = await loadTournaments();
  return (
    <div className="dashboard">
      <Sidebar />
      <main className="main competition-page tournament-theme">
        <Link href="/competitions" className="hub-back">
          ← Retour aux compétitions
        </Link>
        <header className="competition-hero">
          <div>
            <span className="competition-eyebrow">
              HORS CHAMPIONNAT
            </span>
            <h1>Tournois amicaux</h1>
            <p>
              Retrouvez chaque tournoi dans un espace d’analyse indépendant
              du classement officiel.
            </p>
          </div>
          <div className="competition-hero-badge">
            <strong>{tournaments?.length ?? "—"}</strong>
            <span>Tournois suivis</span>
          </div>
        </header>

        {!tournaments && (
          <div className="competition-notice danger">
            Le backend Tournois est indisponible. Redémarrez le backend.
          </div>
        )}

        <section className="competition-section">
          <div className="tournament-grid">
            {(tournaments ?? []).map((tournament) => (
              <Link
                href={tournament.href}
                className="tournament-card"
                key={tournament.code}
              >
                <div>
                  <span>
                    {tournament.status === "AVAILABLE"
                      ? "Disponible"
                      : "Données attendues"}
                  </span>
                  <strong>{tournament.code}</strong>
                </div>
                <h3>{tournament.name}</h3>
                <p className="tournament-event-name">
                  {tournament.event_name}
                </p>
                {tournament.winner && (
                  <p className="tournament-winner">
                    🏆 Vainqueur : <strong>{tournament.winner}</strong>
                  </p>
                )}
                <div className="mini-kpis">
                  <span>
                    <b>{tournament.summary.matches ?? 0}</b> matchs
                  </span>
                  <span>
                    <b>{tournament.summary.legs ?? 0}</b> legs
                  </span>
                  <span>
                    <b>{tournament.summary.tracked_players ?? 0}</b>{" "}
                    joueurs
                  </span>
                </div>
                <small>Ouvrir l’analyse →</small>
              </Link>
            ))}
          </div>
          <div className="competition-notice">
            Ces résultats ne donnent aucun point de championnat et ne
            modifient ni le classement officiel ni l’ELO.
          </div>
        </section>
      </main>
    </div>
  );
}
