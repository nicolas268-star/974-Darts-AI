import type { Metadata } from "next";
import Link from "next/link";
import { legalContactEmail, legalIdentity } from "@/lib/legal";
import "../legal.css";

export const metadata: Metadata = {
  title: "Conditions d’utilisation",
  description: "Conditions d’utilisation du site, des comptes et des jeux 974 Darts AI.",
  alternates: { canonical: "/conditions-utilisation" },
};

export default function TermsOfUsePage() {
  return (
    <main className="legal-page">
      <div className="legal-shell">
        <Link className="legal-back" href="/">← Retour à l’accueil</Link>

        <header className="legal-hero">
          <span className="legal-kicker">RÈGLES DU SERVICE</span>
          <h1>Conditions d’utilisation</h1>
          <p>
            Ces conditions encadrent l’accès aux informations, aux comptes et aux
            outils de jeu proposés gratuitement par {legalIdentity.siteName}.
          </p>
          <span className="legal-update">Dernière mise à jour : 2 septembre 2026</span>
        </header>

        <section className="legal-summary" aria-label="Résumé des conditions d’utilisation">
          <article><strong>Service gratuit</strong><span>Aucun achat ni abonnement proposé</span></article>
          <article><strong>Données sportives</strong><span>Les sources officielles restent prioritaires</span></article>
          <article><strong>Usage loyal</strong><span>Respect des personnes, des comptes et du service</span></article>
        </section>

        <div className="legal-stack">
          <section className="legal-card">
            <span className="legal-kicker">01 · CHAMP D’APPLICATION</span>
            <h2>Accès au site</h2>
            <p>
              La consultation des pages publiques vaut acceptation des présentes
              conditions. La création ou l’utilisation d’un compte implique également
              le respect des règles applicables aux espaces personnels et aux parties.
              Si vous n’acceptez pas ces conditions, vous devez cesser d’utiliser le service.
            </p>
          </section>

          <section className="legal-card">
            <span className="legal-kicker">02 · COMPTES</span>
            <h2>Accès personnel et sécurité</h2>
            <ul>
              <li>Chaque utilisateur doit fournir des informations exactes et utiliser son propre accès.</li>
              <li>Les identifiants de connexion doivent rester confidentiels ; toute utilisation suspecte doit être signalée rapidement.</li>
              <li>Les rôles d’administration, de capitaine ou de joueur ne doivent pas être utilisés au-delà des droits attribués.</li>
              <li>Un accès peut être suspendu en cas d’abus, de tentative d’intrusion, d’usurpation ou d’atteinte aux données d’autrui.</li>
            </ul>
          </section>

          <section className="legal-card">
            <span className="legal-kicker">03 · PARTIES ET CONTRIBUTIONS</span>
            <h2>Saisie des scores et sessions partagées</h2>
            <p>
              Les créateurs et participants à une partie sont responsables des noms,
              scores et informations qu’ils saisissent. Ils doivent disposer de l’accord
              nécessaire avant d’utiliser le nom d’une autre personne et ne doivent publier
              aucun contenu illicite, injurieux, discriminatoire ou portant atteinte à la vie privée.
            </p>
            <p>
              Les codes de session doivent être transmis uniquement aux personnes invitées.
              Une partie peut être corrigée, clôturée ou supprimée lorsqu’une erreur, un abus
              ou une demande légitime est signalé à l’éditeur.
            </p>
          </section>

          <section className="legal-card">
            <span className="legal-kicker">04 · RÉSULTATS ET ANALYSES</span>
            <h2>Portée des informations sportives</h2>
            <p>
              Les classements, moyennes, indices, simulations et analyses sont produits à
              partir des données disponibles. Malgré les contrôles effectués, une erreur de
              saisie, de source ou de calcul reste possible. Les décisions, règlements et
              résultats publiés par les organisateurs compétents prévalent toujours.
            </p>
            <p>
              Toute personne concernée peut signaler une erreur factuelle ou demander
              l’examen d’une donnée la concernant à l’adresse indiquée ci-dessous.
            </p>
          </section>

          <section className="legal-card">
            <span className="legal-kicker">05 · PROPRIÉTÉ ET USAGES INTERDITS</span>
            <h2>Respect du site et des titulaires de droits</h2>
            <p>
              Les contenus originaux et l’identité visuelle de 974 Darts AI ne peuvent pas
              être reproduits de manière substantielle sans autorisation, hors exceptions
              légales. Les marques, logos et contenus de tiers restent la propriété de leurs
              titulaires respectifs.
            </p>
            <p>
              Il est interdit de perturber le fonctionnement du site, contourner ses contrôles
              d’accès, extraire massivement ses données, rechercher l’accès à un compte tiers
              ou utiliser le service à des fins frauduleuses ou contraires à la loi.
            </p>
          </section>

          <section className="legal-card">
            <span className="legal-kicker">06 · DISPONIBILITÉ</span>
            <h2>Évolution et interruption du service</h2>
            <p>
              Le service est fourni gratuitement et peut évoluer, être temporairement
              interrompu pour maintenance ou connaître une indisponibilité technique.
              L’éditeur met en œuvre des moyens raisonnables pour maintenir son fonctionnement,
              sans garantir une disponibilité permanente ni l’absence totale d’erreur.
            </p>
          </section>

          <section className="legal-card legal-contact">
            <div>
              <span className="legal-kicker">07 · CONTACT ET DROIT APPLICABLE</span>
              <h2>Une question ou un signalement ?</h2>
              <p>
                Le site et les présentes conditions sont soumis au droit français. Avant
                toute démarche contentieuse, vous pouvez contacter l’éditeur afin de rechercher
                une solution amiable. Consultez aussi la politique de
                {" "}<Link href="/confidentialite">confidentialité et des traceurs</Link>.
              </p>
            </div>
            <a className="btn btn-primary" href={`mailto:${legalContactEmail}`}>Contacter l’éditeur</a>
          </section>
        </div>
      </div>
    </main>
  );
}
