import Link from "next/link";
import type { Metadata } from "next";
import { CalendarDays, Crown, ShieldCheck, Sparkles } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import "../record-pages.css";
import "./mvp-seasons.css";

export const metadata: Metadata = {
  title: "MVP | 974 Darts AI",
  description: "Retrouvez les classements MVP de chaque saison du championnat 974.",
};

const seasons = [
  {
    year: "2026",
    status: "Saison analysée",
    description: "Le classement MVP 2026 est calculé à partir des données Nakka validées.",
    active: true,
  },
  {
    year: "2027",
    status: "À venir",
    description: "Cette saison sera activée lorsque les premières données 2027 seront publiées.",
    active: false,
  },
  {
    year: "2028",
    status: "À venir",
    description: "Cette saison est déjà préparée et restera séparée des données précédentes.",
    active: false,
  },
] as const;

export default function MvpHubPage() {
  return (
    <div className="dashboard">
      <Sidebar />
      <main className="main record-page mvp-page">
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
            classements 2027 et 2028 resteront vides jusqu’à leur alimentation
            officielle par l’Agent Nakka.
          </span>
        </div>
      </main>
    </div>
  );
}
