import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { committeeCalendarEvents } from "@/lib/committee-ranking";
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
  const officialDates = committeeCalendarEvents.filter(
    (event) => event.status === "SCHEDULED",
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
              Naviguez entre le championnat par équipes, le classement
              individuel officiel et les tournois amicaux.
            </p>
          </div>
          <div className="competition-hero-badge">
            <strong>{activeChampionship?.year ?? 2026}</strong>
            <span>Saison active</span>
          </div>
        </header>

        {!data && (
          <div className="competition-notice danger">
            Les données dynamiques sont momentanément indisponibles.
            Le calendrier et les barèmes officiels restent consultables.
          </div>
        )}

        <section className="competition-section">
          <div className="competition-section-title">
            <div>
              <span>PALMARÈS OFFICIEL</span>
              <h2>Championnats par équipes</h2>
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

        <section className="competition-section individual-ranking-section">
          <div className="competition-section-title">
            <div>
              <span>CHAMPIONNAT INDIVIDUEL 974</span>
              <h2>Classement 2026–2027</h2>
            </div>
            <p>Opens Comité, Coupe Comité et Opens de club reconnus.</p>
          </div>
          <Link href="/competitions/classement-individuel" className="committee-ranking-card">
            <div>
              <span>CLASSEMENT PROVISOIRE</span>
              <strong>2026–27</strong>
              <p>Barèmes officiels, points par compétition et règles de départage.</p>
              <small>Ouvrir le classement individuel →</small>
            </div>
            <div className="committee-ranking-dates">
              {officialDates.slice(0, 3).map((event) => (
                <span key={event.id}>
                  <b>{new Date(`${event.start_date}T12:00:00+04:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: "Indian/Reunion" })}</b>
                  {event.title}
                </span>
              ))}
            </div>
          </Link>
        </section>

        <section className="competition-section tournament-section">
          <div className="competition-section-title">
            <div>
              <span>TOURNOIS & ANALYSES</span>
              <h2>Tournois publiés</h2>
            </div>
            <p>Le statut de chaque événement indique s’il rapporte des points 974.</p>
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
            Les tournois amicaux restent exclus du classement officiel. Seuls
            les Opens de club reconnus par le Comité rapportent des points.
          </div>
        </section>
      </main>
    </div>
  );
}
