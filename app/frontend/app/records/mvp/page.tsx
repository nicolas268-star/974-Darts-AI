import Link from "next/link";
import type { Metadata } from "next";
import { CalendarDays, Crown, ShieldCheck, Sparkles } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { loadMvpCatalog } from "@/lib/records/mvp-server";
import "../record-pages.css";
import "./mvp-seasons.css";

export const metadata: Metadata = {
  title: "MVP",
  description: "Retrouvez les classements MVP de chaque saison du championnat 974.",
};

export default async function MvpHubPage() {
  const catalog = await loadMvpCatalog();
  const seasons = ["2026", "2027", "2028"].map(year => {
    const championship = catalog?.championships.find(item => item.year === Number(year));
    const published = (championship?.published_rounds ?? 0) > 0;
    const active = published || championship?.is_active === true;
    return {
      year, active,
      status: !catalog ? "Statut indisponible" : championship?.is_active ? "Saison en cours" : published ? "Saison analysée" : "En attente de résultats",
      description: published ? `Le MVP ${year} utilise les statistiques individuelles publiées de cette saison.` : !catalog ? "Consultez la page de la saison pour réessayer le chargement." : `Les premiers résultats individuels alimenteront automatiquement le MVP ${year}.`,
    };
  });
  return (
    <div className="dashboard">
      <Sidebar />
      <main className="stats-responsive main record-page mvp-page">
        <section className="record-hero mvp-hero">
          <div className="record-hero-icon mvp-crown" aria-hidden="true">
            <Crown size={44} />
            <span>MVP</span>
          </div>
          <div>
            <span className="eyebrow">Palmarès analytique · Toutes les saisons</span>
            <h1>MVP</h1>
            <p>
              Consultez le classement MVP année par année, sans mélanger les
              statistiques des différents championnats.
            </p>
          </div>
          <span className="record-data-badge mvp-badge"><i /> Calcul transparent</span>
        </section>

        <section className="card mvp-season-panel">
          <div className="record-section-heading">
            <div>
              <span className="eyebrow">Choisir une saison</span>
              <h2>Classements MVP</h2>
            </div>
            <CalendarDays size={26} />
          </div>
          <div className="mvp-season-grid">
            {seasons.map((season) => (
              <Link
                className={`mvp-season-card ${season.active ? "is-active" : "is-upcoming"}`}
                href={`/records/mvp/${season.year}`}
                key={season.year}
              >
                <span className="mvp-season-status">
                  {season.active ? <Sparkles size={15} /> : <CalendarDays size={15} />}
                  {season.status}
                </span>
                <strong>{season.year}</strong>
                <p>{season.description}</p>
                <b>{season.active ? "Voir le classement →" : "Ouvrir la saison →"}</b>
              </Link>
            ))}
          </div>
        </section>

        <div className="record-integrity mvp-integrity">
          <ShieldCheck size={17} />
          <span>
            Chaque saison possède sa propre page et ses propres données. Les
            classements se mettent à jour avec les statistiques individuelles publiées.
            Au début d’une saison, un classement provisoire est affiché tant qu’aucun profil n’atteint 20 legs.
          </span>
        </div>
      </main>
    </div>
  );
}
