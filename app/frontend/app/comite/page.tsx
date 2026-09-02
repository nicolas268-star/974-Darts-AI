import Image from "next/image";
import Link from "next/link";
import { BookOpenCheck, FileBadge2, Landmark, MapPinned, Scale, ShieldCheck } from "lucide-react";
import "./comite.css";

export const metadata = {
  title: "Comité de fléchettes de La Réunion | 974Darts",
  description: "Espace public du Comité de fléchettes de La Réunion : charte, règlement sportif et informations fédérales.",
};

const committeeDocuments = {
  charter: "https://docs.google.com/document/d/e/2PACX-1vRmIYs1NwoP66XW85aG_qAgurguV0EKWHUgxMAv8mvbiv7XS3CsVhljbkD6Povbsg/pub",
  sportingRules: "https://docs.google.com/document/d/e/2PACX-1vRXcsZh_RlxwSzArGtX_mJUvbRr9KWT3MZij-wvC3aybpIRcQPOsJHD9qIn9sTDJA/pub",
};

export default function ComitePage() {
  return (
    <main className="committee-page">
      <header className="committee-topbar">
        <Link className="committee-brand" href="/">
          <span>◎</span><strong>974 Darts</strong><b>AI</b>
        </Link>
        <nav aria-label="Navigation Comité">
          <Link href="/#carte-clubs"><MapPinned size={15}/> Carte des clubs</Link>
          <Link href="/stats">Stats & Données</Link>
          <Link href="/play">Jeux</Link>
        </nav>
      </header>

      <section className="committee-hero">
        <div className="committee-hero-copy">
          <span className="committee-eyebrow"><Landmark size={15}/> INSTITUTION · LA RÉUNION</span>
          <h1>Comité de fléchettes<br/><em>de La Réunion</em></h1>
          <p>Un espace public dédié aux documents de référence, au cadre sportif et à la vie fédérale des fléchettes réunionnaises.</p>
          <div className="committee-hero-actions">
            <a href="#documents">Consulter les documents <span>↓</span></a>
            <Link href="/#carte-clubs">Voir les clubs <span>→</span></Link>
          </div>
        </div>
        <div className="committee-emblem">
          <span className="committee-logo">
            <Image alt="Comité de fléchettes de La Réunion et Fédération Française de Darts" fill priority sizes="360px" src="/club-map/institutions.png"/>
          </span>
          <div><ShieldCheck size={22}/><span>Structure fédérale</span><strong>La Réunion · 974</strong></div>
        </div>
      </section>

      <section className="committee-section" id="documents">
        <div className="committee-section-heading">
          <div><span>DOCUMENTS OFFICIELS</span><h2>Le cadre de référence</h2></div>
          <p>Consultez les documents de référence du Comité, accessibles à tous les clubs et joueurs.</p>
        </div>

        <div className="committee-document-grid">
          <article className="committee-document-card">
            <div className="committee-document-icon"><FileBadge2 size={30}/></div>
            <span className="committee-document-type">GOUVERNANCE</span>
            <h3>Charte du Comité</h3>
            <p>Principes, engagements et règles de fonctionnement communs aux acteurs des fléchettes fédérales à La Réunion.</p>
            <a
              className="committee-document-link"
              href={committeeDocuments.charter}
              rel="noopener noreferrer"
              target="_blank"
            >
              Consulter la charte <span>↗</span>
            </a>
          </article>

          <article className="committee-document-card">
            <div className="committee-document-icon"><Scale size={30}/></div>
            <span className="committee-document-type">COMPÉTITION</span>
            <h3>Règlement sportif 2026–2027</h3>
            <p>Organisation sportive, déroulement des rencontres, règles de compétition et dispositions applicables à la saison.</p>
            <a
              className="committee-document-link"
              href={committeeDocuments.sportingRules}
              rel="noopener noreferrer"
              target="_blank"
            >
              Consulter le règlement <span>↗</span>
            </a>
          </article>
        </div>
      </section>

      <section className="committee-info-strip">
        <BookOpenCheck size={24}/>
        <div><span>DOCUMENTS DISPONIBLES</span><strong>Charte du Comité et règlement sportif de la saison 2026–2027.</strong></div>
        <Link href="/">Retour à l’accueil →</Link>
      </section>
    </main>
  );
}
