import type { Metadata } from "next";
import Link from "next/link";
import { AudiencePrivacyControl } from "@/components/legal/AudiencePrivacyControl";
import { legalContactEmail } from "@/lib/legal";
import "../legal.css";

export const metadata: Metadata = {
  title: "Confidentialité et traceurs",
  description: "Politique de confidentialité, données personnelles et traceurs de 974 Darts AI.",
  alternates: { canonical: "/confidentialite" },
};

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <div className="legal-shell">
        <Link className="legal-back" href="/">← Retour à l’accueil</Link>

        <header className="legal-hero">
          <span className="legal-kicker">DONNÉES PERSONNELLES</span>
          <h1>Confidentialité & traceurs</h1>
          <p>
            Cette page explique simplement quelles données sont utilisées par
            974 Darts AI, pourquoi elles le sont et comment exercer vos droits.
          </p>
          <span className="legal-update">Dernière mise à jour : 2 septembre 2026</span>
        </header>

        <section className="legal-summary" aria-label="Résumé de confidentialité">
          <article><strong>Aucune publicité</strong><span>Aucun traceur publicitaire ou de reciblage</span></article>
          <article><strong>Aucune revente</strong><span>Les données ne sont ni vendues ni louées</span></article>
          <article><strong>Audience interne</strong><span>Le module 974Darts n’enregistre ni adresse IP ni donnée nominative</span></article>
        </section>

        <div className="legal-stack">
          <section className="legal-card">
            <span className="legal-kicker">01 · RESPONSABLE</span>
            <h2>Qui traite les données ?</h2>
            <p>
              Le responsable des traitements réalisés par le site est Nicolas Dupont,
              éditeur de 974 Darts AI à titre personnel. Pour toute question ou demande :
              {" "}<a href={`mailto:${legalContactEmail}`}>{legalContactEmail}</a>.
            </p>
          </section>

          <section className="legal-card">
            <span className="legal-kicker">02 · TRAITEMENTS</span>
            <h2>Données utilisées, finalités et conservation</h2>
            <div className="privacy-table-wrap">
              <table className="privacy-table">
                <thead>
                  <tr>
                    <th>Données</th>
                    <th>Pourquoi</th>
                    <th>Base juridique</th>
                    <th>Conservation</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Noms ou pseudonymes, club, équipe, résultats et statistiques de jeu publiés par Nakka/N01 ou transmis dans les documents de compétition</td>
                    <td>Informer sur les compétitions et constituer un historique sportif local</td>
                    <td>Intérêt légitime d’information et de valorisation des fléchettes réunionnaises</td>
                    <td>Pendant la durée utile de l’historique sportif, sous réserve d’une demande justifiée de correction, d’opposition ou de suppression</td>
                  </tr>
                  <tr>
                    <td>Adresse électronique, identifiant technique, nom affiché, rôle et rattachement éventuel à un joueur ou une équipe</td>
                    <td>Créer et sécuriser l’espace personnel, gérer les droits d’accès</td>
                    <td>Exécution du service demandé et intérêt légitime de sécurisation</td>
                    <td>Durée de vie du compte ; suppression de la base active après traitement d’une demande de fermeture, sous réserve des sauvegardes techniques temporaires</td>
                  </tr>
                  <tr>
                    <td>Noms affichés, membres d’une partie, paramètres, scores, volées, flèches et résultats saisis dans les jeux</td>
                    <td>Créer des parties individuelles ou partagées, calculer les scores et fournir un historique de jeu</td>
                    <td>Exécution du service demandé par les joueurs</td>
                    <td>Tant que l’historique est utile au compte ou à la partie ; suppression sur demande du créateur ou de la personne concernée, sauf données déjà intégrées à un résultat sportif public justifié</td>
                  </tr>
                  <tr>
                    <td>Date et heure, page consultée, catégorie d’appareil et identifiant aléatoire limité à la session</td>
                    <td>Mesurer la fréquentation et améliorer les pages du site</td>
                    <td>Intérêt légitime de l’éditeur, avec droit d’opposition ci-dessous</td>
                    <td>12 mois maximum</td>
                  </tr>
                  <tr>
                    <td>Données techniques de connexion et de sécurité susceptibles d’être générées par OVHcloud ou Supabase, telles que l’adresse IP, l’horodatage et le navigateur</td>
                    <td>Assurer le fonctionnement, prévenir les abus et sécuriser l’hébergement et l’authentification</td>
                    <td>Intérêt légitime de sécurité et obligations légales applicables aux prestataires</td>
                    <td>Selon les durées techniques et légales appliquées par les prestataires, limitées à ce qui est nécessaire à la sécurité du service</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <AudiencePrivacyControl />

          <section className="legal-card">
            <span className="legal-kicker">03 · TRACEURS</span>
            <h2>Cookies et stockage dans le navigateur</h2>
            <ul>
              <li><strong>Authentification :</strong> Supabase utilise des cookies techniques nécessaires pour maintenir une connexion sécurisée. Ils ne servent pas à la publicité.</li>
              <li><strong>Audience :</strong> un identifiant aléatoire est conservé dans le stockage de session du navigateur. Il disparaît avec la session et n’est associé ni à un compte ni à une adresse IP enregistrée.</li>
              <li><strong>Opposition :</strong> votre choix de désactiver l’audience est mémorisé localement afin que le site le respecte lors des prochaines visites.</li>
            </ul>
            <p>
              Aucun outil publicitaire, dispositif de reciblage ou traceur permettant
              de suivre une personne sur plusieurs sites n’est utilisé. Les liens vers
              Nakka/N01, Facebook ou d’autres services externes ne leur transmettent des
              informations qu’au moment où vous choisissez de les ouvrir.
            </p>
            <p>
              La mesure d’audience est limitée au compte exclusif de l’éditeur, ne permet
              aucun suivi entre plusieurs sites, ne recoupe aucune autre donnée et sert à
              produire uniquement des statistiques internes. Elle est donc mise en œuvre
              sans consentement préalable dans le cadre de l’exemption décrite par la
              {" "}<a href="https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience" target="_blank" rel="noreferrer">CNIL</a>, avec un mécanisme d’opposition accessible ci-dessus.
            </p>
          </section>

          <section className="legal-card">
            <span className="legal-kicker">04 · DESTINATAIRES</span>
            <h2>Qui peut accéder aux données ?</h2>
            <p>
              L’éditeur et les seules personnes expressément autorisées pour
              l’administration ou la maintenance sont les destinataires fonctionnels
              des données privées.
              Les statistiques sportives destinées à l’information du public sont visibles
              sur le site. Les prestataires techniques interviennent uniquement pour fournir
              leurs services : OVHcloud pour l’hébergement et Supabase pour l’authentification
              et la base de données.
            </p>
            <p>
              La base de données principale, l’authentification et le stockage Supabase
              du projet sont hébergés dans la région eu-west-3, à Paris. Certains services
              de support, sauvegardes, journaux ou sous-traitants peuvent néanmoins
              impliquer un traitement hors de l’Espace économique européen ; les garanties
              contractuelles prévues par le RGPD et le prestataire concerné s’appliquent alors.
            </p>
          </section>

          <section className="legal-card">
            <span className="legal-kicker">05 · VOS DROITS</span>
            <h2>Accès, correction, suppression et opposition</h2>
            <p>
              Vous pouvez demander l’accès à vos données, leur rectification, leur
              effacement ou la limitation de leur utilisation. Vous pouvez également
              vous opposer aux traitements fondés sur l’intérêt légitime et demander la
              suppression de votre compte. Le droit à la portabilité s’applique lorsque
              les conditions légales sont réunies. Une preuve d’identité pourra être demandée
              uniquement lorsque cela est nécessaire pour éviter de transmettre des
              données à la mauvaise personne.
            </p>
            <p>
              Pour une personne mineure, la demande peut être formulée par son représentant
              légal. Les demandes sont à adresser à
              {" "}<a href={`mailto:${legalContactEmail}`}>{legalContactEmail}</a>.
              Vous disposez aussi du droit d’introduire une réclamation auprès de la
              {" "}<a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noreferrer">CNIL</a>.
            </p>
          </section>

          <section className="legal-card">
            <span className="legal-kicker">06 · SÉCURITÉ ET ÉVOLUTION</span>
            <h2>Protection et mise à jour de cette politique</h2>
            <p>
              Des mesures techniques et organisationnelles raisonnables protègent les
              accès, les sessions et les interfaces d’administration. Aucune décision
              produisant un effet juridique n’est prise automatiquement à partir des
              statistiques ou analyses affichées sur le site.
            </p>
            <p>
              Cette politique pourra être mise à jour si les fonctionnalités, les
              prestataires ou le statut juridique de l’éditeur évoluent. La date affichée
              en haut de cette page permet d’identifier la version applicable.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
