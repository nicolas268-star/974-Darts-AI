import type { Metadata } from "next";
import Link from "next/link";
import { Crown, ShieldCheck, Trophy } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { buildMvpPlayers, MINIMUM_LEGS, MVP_REFERENCES, MVP_SCORING_WEIGHTS, MVP_WEIGHTS } from "@/lib/records/mvp";
import { MvpCalculation } from "../../MvpCalculation";
import "../../../record-pages.css";
import "../../mvp-seasons.css";

export const metadata: Metadata = {
  title: "Trophée MVP 2027 — Règles et calculs",
  description: "Comprendre le trophée MVP 2027 de 974Darts : dotation, statistiques, éligibilité, formules et exemple détaillé du calcul de chaque KPI.",
};

const percentage = (value: number) => `${Math.round(value * 100)} %`;
const decimal = (value: number) => String(value).replace(".", ",");
const example = buildMvpPlayers([{
  player_id: "example", name: "Joueur d’exemple", team: "Exemple fictif",
  legs_played: 100, legs_won: 70, average_3_darts: 56, first_9: 64, best_finish: 102,
  scores_100: 20, scores_140: 10, scores_170: 0, scores_180: 0,
  win_rate: 70, elo: null, finishes: 0, nakka_note: "Exemple pédagogique fictif",
}])[0];

export default function Mvp2027ExplanationPage() {
  return <div className="dashboard">
    <Sidebar />
    <main className="stats-responsive main record-page mvp-page mvp-guide-page">
      <Link className="back-link" href="/records/mvp/2027">← Retour au classement MVP 2027</Link>
      <section className="record-hero mvp-hero">
        <div className="record-hero-icon mvp-crown" aria-hidden="true"><Crown size={44} /><span>MVP</span></div>
        <div><span className="eyebrow">974Darts · Transparence des statistiques</span><h1>Comprendre le trophée MVP 2027</h1><p>Le principe du trophée, les données retenues et chaque étape du calcul de l’indice MVP.</p></div>
        <span className="record-data-badge mvp-badge"><Trophy size={18} /> Trophée + 200 € de matériel</span>
      </section>

      <nav className="mvp-guide-nav" aria-label="Sommaire des explications MVP">
        <a href="#trophee">Le trophée</a><a href="#formules">Les calculs</a><a href="#statistiques">Les statistiques</a><a href="#eligibilite">Les règles</a><a href="#exemple">Un exemple complet</a>
      </nav>

      <section className="card mvp-guide-section" id="trophee">
        <span className="eyebrow">01 · Le trophée</span><h2>Récompenser une saison complète</h2>
        <p>Le MVP, pour « Most Valuable Player », met en valeur un joueur qui combine niveau de scoring, résultats fiables, participation et meilleur finish sur la saison 2027 du championnat Interclubs.</p>
        <p>La proposition présentée au Comité comprend un <strong>trophée personnalisé et une dotation de 200 € en matériel de fléchettes</strong>, financés et pris en charge par <strong>NDX Performance Lab</strong>. 974Darts assure le suivi statistique.</p>
        <aside className="record-integrity mvp-integrity"><ShieldCheck size={18} /><span>974Darts publie un indice analytique. Le Comité conserve la responsabilité d’homologuer les règles et de valider l’attribution finale. Ce trophée ne modifie ni les points ni le classement officiel du championnat.</span></aside>
      </section>

      <section className="card mvp-guide-section" id="formules">
        <span className="eyebrow">02 · Les calculs</span><h2>Quatre KPI sur une échelle de 0 à 100</h2>
        <p className="mvp-formula mvp-guide-main-formula">Indice MVP = arrondi({decimal(MVP_WEIGHTS.scoring)} × Scoring + {decimal(MVP_WEIGHTS.results)} × Résultats + {decimal(MVP_WEIGHTS.impact)} × Impact + {decimal(MVP_WEIGHTS.finish)} × Finishs)</p>
        <p>Chaque indice est limité entre 0 et 100. Le calcul utilise les valeurs non arrondies ; seul le total final est arrondi à l’entier. Les KPI affichés dans le classement sont arrondis séparément.</p>
        <div className="mvp-calculation-grid">
          <article className="mvp-calculation-step">
            <h3>Scoring <span>{percentage(MVP_WEIGHTS.scoring)} du MVP</span></h3>
            <p>La moyenne, les neuf premières fléchettes et les gros scores décrivent la qualité du scoring.</p>
            <p className="mvp-formula">A = min(100 ; moyenne 3 fléchettes / {MVP_REFERENCES.average} × 100)</p>
            <p className="mvp-formula">F = min(100 ; First 9 / {MVP_REFERENCES.first9} × 100)</p>
            <p>Si le First 9 est absent, F reprend A. Les références {MVP_REFERENCES.average} et {MVP_REFERENCES.first9} sont des repères fixes ; les indices sont plafonnés à 100.</p>
            <p className="mvp-formula">Poids = nombre de 100–139 + 2 × nombre de 140–169 + 4 × nombre de 180</p>
            <p className="mvp-formula">Taux = poids / legs joués × 100</p>
            <p className="mvp-formula">Référence = max(1 ; meilleur taux des joueurs du classement affiché)</p>
            <p className="mvp-formula">G = min(100 ; taux joueur / référence × 100)</p>
            <p className="mvp-step-result">Scoring = {decimal(MVP_SCORING_WEIGHTS.average)} × A + {decimal(MVP_SCORING_WEIGHTS.first9)} × F + {decimal(MVP_SCORING_WEIGHTS.highScores)} × G</p>
            <p>Les 120–139 font déjà partie des 100–139 : ils ne sont pas comptés une seconde fois. Les 170–179 sont suivis séparément et ne contribuent pas au MVP actuel.</p>
            <p>Le repère des gros scores évolue avec les performances et la population du classement affiché. La même référence s’applique à tous les joueurs de ce groupe.</p>
          </article>
          <article className="mvp-calculation-step">
            <h3>Résultats fiables <span>{percentage(MVP_WEIGHTS.results)} du MVP</span></h3>
            <p>Un taux de victoire obtenu sur quelques legs apporte moins d’information que le même taux sur une saison complète. La borne basse de Wilson à 95 % tient compte de cette différence.</p>
            <p className="mvp-formula">n = legs joués ; p = legs gagnés / n ; z = {decimal(MVP_REFERENCES.wilsonZ)}</p>
            <p className="mvp-formula">Résultats = 100 × [(p + z²/(2n) − z × √((p(1 − p) + z²/(4n))/n)) / (1 + z²/n)]</p>
            <p>Il s’agit d’un indice de confiance, distinct du pourcentage brut de victoires. À proportion de victoires égale, davantage de legs rendent le bilan plus robuste.</p>
          </article>
          <article className="mvp-calculation-step">
            <h3>Impact <span>{percentage(MVP_WEIGHTS.impact)} du MVP</span></h3>
            <p className="mvp-formula">Impact = min(100 ; legs joués / {MVP_REFERENCES.legs} × 100)</p>
            <p>Un point par leg disputé jusqu’à {MVP_REFERENCES.legs} legs. Au-delà, l’indice reste à 100 : le volume de jeu ne peut pas écraser les autres composantes.</p>
          </article>
          <article className="mvp-calculation-step">
            <h3>Finishs <span>{percentage(MVP_WEIGHTS.finish)} du MVP</span></h3>
            <p className="mvp-formula">Finishs = min(100 ; meilleur finish / {MVP_REFERENCES.finish} × 100)</p>
            <p>Le meilleur finish enregistré est rapporté à {MVP_REFERENCES.finish}. En l’absence de meilleur finish renseigné, cette composante vaut 0.</p>
            <p>Ce KPI ne mesure pas la précision aux doubles ni la régularité des sorties.</p>
          </article>
        </div>
      </section>

      <section className="card mvp-guide-section" id="statistiques">
        <span className="eyebrow">03 · La prise des statistiques</span><h2>Des feuilles de match au classement</h2>
        <ol>
          <li><strong>Collecte :</strong> résultats et statistiques individuelles Nakka / N01 publiés pour les rencontres, lorsqu’ils sont disponibles.</li>
          <li><strong>Consolidation :</strong> 974Darts regroupe les données individuelles par joueur et par saison, en tenant compte des identités fusionnées.</li>
          <li><strong>Contrôles :</strong> legs joués entiers et positifs, legs gagnés entre 0 et le nombre joué, moyenne finie et positive ou nulle, compteurs de gros scores entiers et non négatifs. Un profil incohérent est écarté du calcul.</li>
          <li><strong>Calcul :</strong> seuls les agrégats de la saison 2027 alimentent cette course au MVP. Une rencontre sans détail individuel exploitable n’ajoute aucune performance individuelle.</li>
          <li><strong>Corrections :</strong> les corrections sportives validées peuvent mettre à jour les données retenues. Une décision de l’organisateur reste prioritaire sur une donnée importée.</li>
        </ol>
        <p>Les entrées du calcul sont les legs gagnés et joués, la moyenne 3 fléchettes, le First 9, les volumes 100–139, 140–169 et 180, ainsi que le meilleur finish. Leur détail est consultable sous chaque joueur dans le classement.</p>
        <aside className="record-integrity mvp-integrity"><ShieldCheck size={18} /><span>Un finish Nakka correspond au total de la volée de sortie. Il ne permet pas de déduire la route de checkout, le double utilisé ou un pourcentage de réussite aux doubles.</span></aside>
      </section>

      <section className="card mvp-guide-section" id="eligibilite">
        <span className="eyebrow">04 · Éligibilité et attribution</span><h2>Le seuil de participation et les départages</h2>
        <ul>
          <li><strong>Classement principal :</strong> au moins {MINIMUM_LEGS} legs, une moyenne disponible et des données cohérentes.</li>
          <li><strong>Début de saison :</strong> tant qu’aucun profil exploitable n’atteint {MINIMUM_LEGS} legs, le classement provisoire présente les joueurs ayant au moins un leg, avec la même formule.</li>
          <li><strong>Passage au classement principal :</strong> dès qu’un joueur devient éligible, seuls les profils éligibles sont classés. Les autres restent comptés parmi les profils à confirmer.</li>
          <li><strong>Départages :</strong> indice MVP affiché, puis indice Résultats fiables affiché, puis moyenne 3 fléchettes. L’ordre alphabétique stabilise l’affichage si l’égalité subsiste.</li>
          <li><strong>Attribution :</strong> le leader statistique n’est pas automatiquement le lauréat. Le Comité valide les règles, les éventuels cas particuliers et l’attribution finale.</li>
        </ul>
        <p><strong>Neutralité du financeur :</strong> conformément à la proposition présentée au Comité, Nicolas Dupont, porteur de NDX Performance Lab, est hors concours pour le trophée et les 200 € de matériel. Ses statistiques restent calculées et visibles.</p>
        <p>L’intégration éventuelle des 170–179 à la formule relève d’une décision du Comité. Toute évolution de méthode doit être documentée et appliquée uniformément à tous les joueurs.</p>
      </section>

      <section className="card mvp-guide-section" id="exemple">
        <span className="eyebrow">05 · Exemple pédagogique</span><h2>Reconstituer un indice MVP de 75 / 100</h2>
        <p>Ce profil est fictif. Le taux de référence des gros scores vaut ici 40, calculé sur ce seul joueur d’exemple. Le classement réel utilise le groupe de joueurs affiché et peut donc avoir une autre référence.</p>
        <MvpCalculation player={example} season="2027" showGuideLink={false} />
      </section>
      <Link className="btn btn-secondary" href="/records/mvp/2027">Revenir au classement et ouvrir le calcul d’un joueur →</Link>
    </main>
  </div>;
}
