import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import type {
  ChampionshipCard,
  CompetitionCatalog,
} from "@/lib/types/sprint14";
import "./competition-hub.css";

async function loadCatalog(): Promise<CompetitionCatalog | null> {
  const base = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";
  try {
    const response = await fetch(`${base}/api/v1/competitions`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
}

const seasonStatus = (status: string) => ({
  ACTIVE: "En cours",
  ARCHIVED: "Archivé",
  AVAILABLE: "Disponible",
  PLANNED: "À venir",
}[status] ?? status);

const EXPECTED_CHAMPIONSHIP_YEARS = [2026, 2027, 2028] as const;

function fallbackChampionship(year: number): ChampionshipCard {
  const isActive = year === 2026;
  return {
    id: null,
    slug: String(year),
    name: `Championnat ${year}`,
    year,
    is_active: isActive,
    status: isActive ? "ACTIVE" : "PLANNED",
    rounds: 0,
    published_rounds: 0,
    has_data: false,
    href: `/championships/${year}`,
  };
}

function championshipChoices(
  data: CompetitionCatalog | null,
): ChampionshipCard[] {
  const received = data?.championships ?? [];
  const byYear = new Map(received.map((season) => [season.year, season]));
  const expectedYears = new Set<number>(EXPECTED_CHAMPIONSHIP_YEARS);
  const expected = EXPECTED_CHAMPIONSHIP_YEARS.map(
    (year) => byYear.get(year) ?? fallbackChampionship(year),
  );
  const additional = received.filter(
    (season) => !expectedYears.has(season.year),
  );
  return [...expected, ...additional].sort((a, b) => a.year - b.year);
}

export default async function CompetitionsPage() {
  const data = await loadCatalog();
  const championships = championshipChoices(data);
  const activeChampionship = (
    data?.active_championship
    ?? championships.find((season) => season.is_active)
  );
  return (
    <div className="dashboard">
      <Sidebar />
      <main className="main competition-page competition-overview-theme">
        <header className="competition-hero">
          <div>
            <span className="competition-eyebrow">
              SAISONS & TOURNOIS · LA RÉUNION
            </span>
            <h1>Les compétitions</h1>
            <p>
              Naviguez entre les championnats officiels et les tournois
              amicaux sans mélanger leurs statistiques.
            </p>
          </div>
          <div className="competition-hero-badge">
            <strong>{activeChampionship?.year ?? 2026}</strong>
            <span>Saison active</span>
          </div>
        </header>

        {!data && (
          <div className="competition-notice danger">
            Les données des compétitions sont momentanément indisponibles.
            Redémarrez le service puis actualisez cette page.
          </div>
        )}

        <section className="competition-section">
          <div className="competition-section-title">
            <div>
              <span>PALMARÈS OFFICIEL</span>
              <h2>Championnats</h2>
            </div>
            <p>Une saison sélectionnée ne modifie jamais les autres années.</p>
          </div>
          <div className="s14-championship-grid">
            {championships.map((season) => (
              <Link
                href={season.href}
                className={
                  "s14-championship-card " +
                  `s14-season-status-${season.status.toLowerCase()}`
                }
                key={season.slug}
              >
                <div className="s14-season-card-top">
                  <span>{seasonStatus(season.status)}</span>
                  {season.is_active && <b>ACTIF</b>}
                </div>
                <strong>{season.year}</strong>
                <p>
                  {season.has_data
                    ? `${season.published_rounds} journée(s) publiée(s)`
                    : "Saison prête à être alimentée"}
                </p>
                <small>Ouvrir le championnat →</small>
              </Link>
            ))}
          </div>
        </section>

        <section className="competition-section tournament-section">
          <div className="competition-section-title">
            <div>
              <span>HORS CHAMPIONNAT</span>
              <h2>Tournois amicaux</h2>
            </div>
            <p>Résultats visibles, sans impact sur le classement ou l’ELO.</p>
          </div>
          <div className="tournament-grid">
            {(data?.tournaments ?? []).map((tournament) => (
              <Link
                href={tournament.href}
                className="tournament-card"
                key={tournament.code}
              >
                <div>
                  <span>{tournament.status === "AVAILABLE" ? "Disponible" : "Données attendues"}</span>
                  <strong>{tournament.code}</strong>
                </div>
                <h3>{tournament.name}</h3>
                <p className="tournament-event-name">
                  {tournament.event_name}
                </p>
                <div className="mini-kpis">
                  <span><b>{tournament.summary.matches ?? 0}</b> matchs</span>
                  <span><b>{tournament.summary.legs ?? 0}</b> legs</span>
                  <span><b>{tournament.summary.tracked_players ?? 0}</b> joueurs suivis</span>
                </div>
                <small>Analyser le tournoi →</small>
              </Link>
            ))}
          </div>
          <div className="competition-notice">
            Les tournois amicaux sont volontairement exclus des points
            d’équipe, du classement officiel et de l’ELO du championnat.
          </div>
        </section>
      </main>
    </div>
  );
}
