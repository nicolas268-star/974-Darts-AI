import Link from "next/link";
import { CalendarClock, Crown, ShieldCheck } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import "../record-pages.css";
import "./mvp-seasons.css";

export function UpcomingMvpSeason({ season }: { season: "2027" | "2028" }) {
  return (
    <div className="dashboard">
      <Sidebar />
      <main className="main record-page mvp-page">
        <Link className="back-link" href="/records/mvp">← Retour aux saisons MVP</Link>
        <section className="record-hero mvp-hero">
          <div className="record-hero-icon mvp-crown" aria-hidden="true">
            <Crown size={44} />
            <span>MVP</span>
          </div>
          <div>
            <span className="eyebrow">Indice analytique · Saison {season}</span>
            <h1>MVP {season}</h1>
            <p>
              La page est prête. Le classement apparaîtra après la première
              synchronisation officielle de cette saison.
            </p>
          </div>
          <span className="record-data-badge mvp-upcoming-badge">
            <CalendarClock size={15} /> Saison à venir
          </span>
        </section>

        <section className="card record-empty mvp-season-empty">
          <CalendarClock size={46} />
          <h2>Aucune donnée {season} publiée</h2>
          <p>
            Les performances 2026 ne sont pas réutilisées ici. L’Agent Nakka
            alimentera cette rubrique lorsque le portail officiel {season} sera disponible.
          </p>
          <Link className="btn btn-secondary" href="/records/mvp">Voir les autres saisons</Link>
        </section>

        <div className="record-integrity mvp-integrity">
          <ShieldCheck size={17} />
          <span>
            Protection intersaison active : aucun résultat, joueur ou indice
            MVP d’une autre année n’est affiché sur la saison {season}.
          </span>
        </div>
      </main>
    </div>
  );
}
