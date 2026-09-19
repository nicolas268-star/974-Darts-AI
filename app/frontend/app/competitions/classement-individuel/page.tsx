import Image from "next/image";
import Link from "next/link";
import { CalendarDays, Info, Medal, Trophy } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import {
  committeeCalendarEvents,
  pointScales,
  rankingColumnLabels,
} from "@/lib/committee-ranking";
import "./individual-ranking.css";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Indian/Reunion",
});

type RankingRow = {
  rank: number;
  player_name: string;
  club: string;
  event_points: Record<string, number>;
  total: number;
};

type RankingPayload = {
  rankings: { mixed: RankingRow[]; men: RankingRow[]; women: RankingRow[] };
};

async function loadRanking(): Promise<RankingPayload | null> {
  const base = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";
  try {
    const response = await fetch(`${base}/api/v1/committee-ranking`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
}

export default async function IndividualRankingPage({ searchParams }: { searchParams: Promise<{ categorie?: string }> }) {
  const scheduled = committeeCalendarEvents.filter((event) => event.status === "SCHEDULED");
  const requested = (await searchParams).categorie;
  const category = requested === "hommes" ? "men" : requested === "femmes" ? "women" : "mixed";
  const payload = await loadRanking();
  const rows = payload?.rankings?.[category] ?? [];

  return (
    <div className="dashboard">
      <Sidebar />
      <main className="main committee-ranking-page">
        <Link className="committee-ranking-back" href="/competitions">← Toutes les compétitions</Link>

        <header className="committee-ranking-hero">
          <div>
            <span>COMITÉ FLÉCHETTES DE LA RÉUNION</span>
            <h1>Classement individuel</h1>
            <p>Saison 2026–2027 · classement masculin, féminin et sélection finale mixte.</p>
          </div>
          <div className="committee-ranking-hero-aside">
            <div className="committee-ranking-logo-card">
              <span className="committee-ranking-logo-crop">
                <Image
                  alt="Logo du Comité de Fléchettes de La Réunion"
                  height={129}
                  priority
                  src="/club-map/institutions.png"
                  width={237}
                />
              </span>
              <small>Comité de La Réunion</small>
            </div>
            <div className="committee-ranking-season"><Trophy size={28} /><strong>2026–27</strong><small>Saison en cours</small></div>
          </div>
        </header>

        <section className="committee-ranking-summary">
          <article><Medal size={22} /><strong>4</strong><span>Opens Comité</span></article>
          <article><Trophy size={22} /><strong>1</strong><span>Coupe Comité</span></article>
          <article><CalendarDays size={22} /><strong>{scheduled.length}</strong><span>dates officielles à venir</span></article>
        </section>

        <section className="committee-ranking-panel">
          <div className="committee-ranking-heading">
            <div><span>CLASSEMENT 974</span><h2>Classement provisoire</h2></div>
            <p>Mis à jour après validation des résultats par le Directeur sportif.</p>
          </div>
          <div className="committee-ranking-tabs" aria-label="Catégories du classement">
            <Link className={category === "mixed" ? "active" : ""} href="/competitions/classement-individuel">Mixte · Masters</Link>
            <Link className={category === "men" ? "active" : ""} href="/competitions/classement-individuel?categorie=hommes">Hommes</Link>
            <Link className={category === "women" ? "active" : ""} href="/competitions/classement-individuel?categorie=femmes">Femmes</Link>
          </div>
          <div className="committee-ranking-table-scroll">
            <table className="committee-ranking-table">
              <colgroup>
                <col className="ranking-col-rank" />
                <col className="ranking-col-player" />
                <col className="ranking-col-club" />
                {rankingColumnLabels.map((column) => <col className="ranking-col-event" key={column.key} />)}
                <col className="ranking-col-total" />
              </colgroup>
              <thead><tr><th scope="col">Rang</th><th scope="col">Joueur</th><th scope="col">Club</th>{rankingColumnLabels.map((column) => <th scope="col" title={column.label} key={column.key}>{column.short}</th>)}<th scope="col">Total</th></tr></thead>
              <tbody>
                {rows.length ? rows.map((row) => (
                  <tr key={row.player_name}>
                    <td className="ranking-rank"><strong>{row.rank}</strong></td>
                    <td className="ranking-player"><strong>{row.player_name}</strong></td>
                    <td className="ranking-club"><span>{row.club}</span></td>
                    {rankingColumnLabels.map((column) => {
                      const points = row.event_points[column.key];
                      return <td className={points ? "ranking-points has-points" : "ranking-points"} key={column.key}>{points ?? "—"}</td>;
                    })}
                    <td className="ranking-total"><strong>{row.total}</strong></td>
                  </tr>
                )) : <tr className="committee-ranking-empty"><td colSpan={10}><strong>Résultats du premier Open de club en cours de validation</strong><span>Le classement sera publié dès validation officielle des points du tournoi Kaz A Darts du 13 septembre.</span><Link href="/tournaments/t5">Consulter les résultats du tournoi →</Link></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="committee-ranking-note"><Info size={18} /><p>En cas d’égalité finale : résultat à la Coupe du Comité, puis match de barrage en cinq manches gagnantes. Tous les points de la saison sont cumulés.</p></div>
        </section>

        <section className="committee-ranking-panel">
          <div className="committee-ranking-heading"><div><span>RÈGLEMENT 2026–2027</span><h2>Barèmes officiels</h2></div><p>Les points du double sont attribués à chaque joueur.</p></div>
          <div className="committee-points-grid">
            {pointScales.map((scale) => (
              <article key={scale.key} className={`category-${scale.category.toLowerCase()}`}>
                <header><span>Catégorie {scale.category}</span><h3>{scale.label}</h3>{scale.perPlayer && <small>Points par joueur</small>}</header>
                <dl>
                  <div><dt>Vainqueur</dt><dd>{scale.points.winner}</dd></div>
                  <div><dt>Finaliste</dt><dd>{scale.points.runnerUp}</dd></div>
                  <div><dt>½ finaliste</dt><dd>{scale.points.semiFinalist}</dd></div>
                  <div><dt>¼ finaliste</dt><dd>{scale.points.quarterFinalist}</dd></div>
                  <div><dt>⅛ finaliste</dt><dd>{scale.points.roundOf16}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </section>

        <section className="committee-ranking-panel">
          <div className="committee-ranking-heading"><div><span>À VOS AGENDAS</span><h2>Prochaines compétitions officielles</h2></div><Link href="/calendar">Voir tout le calendrier →</Link></div>
          <div className="committee-dates-grid">
            {scheduled.map((event) => {
              const date = new Date(`${event.start_date}T12:00:00+04:00`);
              return <article key={event.id} className={`category-${event.ranking_category.toLowerCase()}`}><time dateTime={event.start_date}>{dateFormatter.format(date)}</time><strong>{event.title}</strong><span>{event.location}</span><small>Horaire à confirmer</small></article>;
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
