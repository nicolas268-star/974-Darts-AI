import type { Metadata } from "next";
import Link from "next/link";
import { legalContactEmail, legalIdentity } from "@/lib/legal";
import "../legal.css";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Mentions légales et informations relatives à l’édition du site 974 Darts AI.",
  alternates: { canonical: "/mentions-legales" },
};

export default function LegalNoticePage() {
  return (
    <main className="legal-page">
      <div className="legal-shell">
        <Link className="legal-back" href="/">← Retour à l’accueil</Link>

        <header className="legal-hero">
          <span className="legal-kicker">INFORMATIONS JURIDIQUES</span>
          <h1>Mentions légales</h1>
          <p>
            Informations relatives à l’édition, à l’hébergement et à l’utilisation
            du site {legalIdentity.siteName}.
          </p>
          <span className="legal-update">Dernière mise à jour : 2 septembre 2026</span>
        </header>

        <section className="legal-summary" aria-label="Résumé des mentions légales">
          <article><strong>Éditeur</strong><span>Nicolas Dupont, à titre personnel</span></article>
          <article><strong>Infrastructure</strong><span>OVHcloud, France · Supabase, région Paris</span></article>
          <article><strong>Contact</strong><span>{legalContactEmail}</span></article>
        </section>

        <div className="legal-stack">
          <section className="legal-card">
            <span className="legal-kicker">01 · ÉDITION</span>
            <h2>Éditeur et publication</h2>
            <address>
              <strong>{legalIdentity.publisherName}</strong><br />
              <span>{legalIdentity.publisherStatus}</span><br />
              Directeur de la publication : {legalIdentity.publicationDirector}<br />
              Courriel : <a href={`mailto:${legalContactEmail}`}>{legalContactEmail}</a>
            </address>
            <p className="legal-note">
              L’éditeur non professionnel a choisi de ne pas publier son adresse
              personnelle et son numéro de téléphone. Ses éléments d’identification
              complets ont été communiqués à l’hébergeur, conformément à
              {" "}<a href="https://www.legifrance.gouv.fr/codes/section_lc/JORFTEXT000000801164/LEGISCTA000006089778/" target="_blank" rel="noreferrer">l’article 1-1 de la loi pour la confiance dans l’économie numérique</a>.
            </p>
          </section>

          <section className="legal-card">
            <span className="legal-kicker">02 · HÉBERGEMENT</span>
            <h2>Hébergement et stockage des données</h2>
            <h3>Site et application</h3>
            <address>
              <strong>{legalIdentity.host.name}</strong><br />
              {legalIdentity.host.address}<br />
              Téléphone : {legalIdentity.host.phone}<br />
              <a href={legalIdentity.host.website} target="_blank" rel="noreferrer">www.ovhcloud.com</a>
            </address>
            <h3>Base de données et authentification</h3>
            <address>
              <strong>{legalIdentity.dataHost.name}</strong><br />
              {legalIdentity.dataHost.address}<br />
              {legalIdentity.dataHost.region}<br />
              <a href={legalIdentity.dataHost.website} target="_blank" rel="noreferrer">supabase.com</a>
            </address>
          </section>

          <section className="legal-card">
            <span className="legal-kicker">03 · OBJET DU SITE</span>
            <h2>Une plateforme indépendante d’information sportive</h2>
            <p>
              974 Darts AI présente des calendriers, résultats, classements et
              analyses statistiques consacrés aux fléchettes à La Réunion. Le site
              est un projet indépendant et n’est pas le site officiel de Nakka/N01,
              d’un club ou d’un organisateur, sauf indication explicite contraire.
            </p>
            <p>
              Les résultats sportifs proviennent notamment de publications Nakka/N01
              et de documents de compétition. La source est indiquée lorsque cela est
              pertinent. En cas d’écart, la publication de l’organisateur demeure la
              référence.
            </p>
          </section>

          <section className="legal-card">
            <span className="legal-kicker">04 · CONTENUS</span>
            <h2>Propriété intellectuelle et signes distinctifs</h2>
            <p>
              La structure du site, ses textes originaux, ses traitements, ses
              visualisations et son identité graphique sont protégés par les règles
              applicables à la propriété intellectuelle. Toute reproduction substantielle
              nécessite l’autorisation préalable de l’éditeur, sauf exception légale.
            </p>
            <p>
              Les noms, logos et marques de clubs, organisateurs, plateformes ou
              partenaires restent la propriété de leurs titulaires respectifs. Leur
              présence sert uniquement à identifier les acteurs ou les sources concernés
              et ne vaut ni affiliation ni approbation.
            </p>
            <p>
              Sauf mention différente au plus près d’un contenu, les créations graphiques
              propres à 974 Darts AI sont créditées à Nicolas Dupont / 974 Darts AI.
              Les photographies, logos et documents provenant de tiers restent crédités
              à leurs auteurs ou titulaires respectifs.
            </p>
          </section>

          <section className="legal-card">
            <span className="legal-kicker">05 · RESPONSABILITÉ</span>
            <h2>Fiabilité des informations</h2>
            <p>
              L’éditeur s’efforce de publier des informations exactes et actualisées,
              sans pouvoir garantir l’absence totale d’erreur, de retard ou d’interruption.
              Les informations du site sont fournies à titre informatif et ne remplacent
              pas les décisions, règlements ou publications des organisateurs.
            </p>
            <p>
              Les liens externes sont proposés pour faciliter la consultation des sources.
              L’éditeur ne contrôle pas leur disponibilité ni leur contenu.
            </p>
          </section>

          <section className="legal-card legal-contact">
            <div>
              <span className="legal-kicker">06 · CONTACT</span>
              <h2>Signaler une erreur, exercer un droit de réponse</h2>
              <p>
                Toute personne nommée ou désignée peut demander une correction, une
                suppression ou exercer son droit de réponse dans les conditions prévues
                par la loi. La demande doit identifier précisément le contenu concerné.
              </p>
            </div>
            <a className="btn btn-primary" href={`mailto:${legalContactEmail}`}>Écrire à l’éditeur</a>
          </section>
        </div>
      </div>
    </main>
  );
}
