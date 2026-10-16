import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { MINIMUM_LEGS, MVP_HIGH_SCORE_WEIGHTS, MVP_REFERENCES, MVP_SCORING_WEIGHTS, MVP_WEIGHTS, type MvpPlayer, type MvpSeason } from "@/lib/records/mvp";

const number = (value: number, digits = 2) => value.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const percent = (value: number) => `${number(value * 100, 0)} %`;

/** Every result comes from the same unrounded calculation that produced the ranking. */
export function MvpCalculation({ player, season, showGuideLink = true }: { player: MvpPlayer; season: MvpSeason; showGuideLink?: boolean }) {
  const c = player.calculation, n = player.legs_played ?? 0, won = player.legs_won ?? 0;
  const p = won / n, z = MVP_REFERENCES.wilsonZ, z2 = number(z * z, 4);
  const indices = [
    { label: "Scoring", value: c.scoringIndex, weight: MVP_WEIGHTS.scoring, contribution: c.contributions.scoring },
    { label: "Résultats fiables", value: c.resultsIndex, weight: MVP_WEIGHTS.results, contribution: c.contributions.results },
    { label: "Impact", value: c.impactIndex, weight: MVP_WEIGHTS.impact, contribution: c.contributions.impact },
    { label: "Finishs", value: c.finishIndex, weight: MVP_WEIGHTS.finish, contribution: c.contributions.finish },
  ];
  return <div className="mvp-calculation">
    <div className="mvp-calculation-heading">
      <div><span className="eyebrow">Saison {season} · données du classement affiché</span><h3>Calcul de {player.name}</h3></div>
      <span className="record-count">{n >= MINIMUM_LEGS ? `Seuil de ${MINIMUM_LEGS} legs atteint` : `Provisoire · ${n}/${MINIMUM_LEGS} legs`}</span>
    </div>
    <dl className="mvp-inputs" aria-label={`Statistiques utilisées pour ${player.name}`}>
      <div><dt>Legs gagnés / joués</dt><dd>{won} / {n}</dd></div>
      <div><dt>Moyenne 3 fléchettes</dt><dd>{number(player.average_3_darts ?? 0)}</dd></div>
      <div><dt>First 9</dt><dd>{player.first_9 == null ? "Non renseigné" : number(player.first_9)}</dd></div>
      <div><dt>Meilleur finish</dt><dd>{player.best_finish ?? "Non renseigné"}</dd></div>
      <div><dt>100–139</dt><dd>{player.scores_100}</dd></div>
      <div><dt>140–169</dt><dd>{player.scores_140}</dd></div>
      <div><dt>170–179 · ×{MVP_HIGH_SCORE_WEIGHTS.scores_170}</dt><dd>{player.scores_170}</dd></div>
      <div><dt>180</dt><dd>{player.scores_180}</dd></div>
    </dl>

    <div className="mvp-calculation-grid">
      <section className="mvp-calculation-step">
        <h4>1. Scoring <span>{percent(MVP_WEIGHTS.scoring)} du MVP</span></h4>
        <p>Indice moyenne = min(100 ; {number(player.average_3_darts ?? 0)} / {MVP_REFERENCES.average} × 100) ≈ <b>{number(c.averageIndex)}</b></p>
        <p>{player.first_9 == null
          ? <>First 9 absent : reprise de l’indice moyenne, soit <b>{number(c.first9Index)}</b>.</>
          : <>Indice First 9 = min(100 ; {number(player.first_9)} / {MVP_REFERENCES.first9} × 100) ≈ <b>{number(c.first9Index)}</b></>}</p>
        <p>Poids gros scores = {player.scores_100} + {MVP_HIGH_SCORE_WEIGHTS.scores_140} × {player.scores_140} + {MVP_HIGH_SCORE_WEIGHTS.scores_170} × {player.scores_170} + {MVP_HIGH_SCORE_WEIGHTS.scores_180} × {player.scores_180} = <b>{c.highScoreWeight}</b></p>
        <p>Taux joueur = {c.highScoreWeight} / {n} × 100 ≈ <b>{number(c.highScoreRate)}</b></p>
        <p>Repère du classement = <b>{number(c.bestHighScoreRate)}</b> (meilleur taux du groupe affiché, avec un minimum de 1).</p>
        <p>Indice gros scores = min(100 ; {number(c.highScoreRate)} / {number(c.bestHighScoreRate)} × 100) ≈ <b>{number(c.highScoreIndex)}</b></p>
        <p className="mvp-step-result">Scoring ≈ {number(c.averageIndex)} × {number(MVP_SCORING_WEIGHTS.average)} + {number(c.first9Index)} × {number(MVP_SCORING_WEIGHTS.first9)} + {number(c.highScoreIndex)} × {number(MVP_SCORING_WEIGHTS.highScores)} ≈ <b>{number(c.scoringIndex)} / 100</b></p>
      </section>
      <section className="mvp-calculation-step">
        <h4>2. Résultats fiables <span>{percent(MVP_WEIGHTS.results)} du MVP</span></h4>
        <p>Taux de victoire observé = {won} / {n} × 100 ≈ <b>{number(p * 100)} %</b></p>
        <p>La borne basse de Wilson à 95 % tient compte du nombre de legs. Elle utilise n = {n}, p = {won}/{n} ≈ {number(p, 4)} et z = {number(z)}.</p>
        <p className="mvp-formula">100 × [(p + {z2}/(2 × {n}) − {number(z)} × √((p × (1 − p) + {z2}/(4 × {n}))/{n})) / (1 + {z2}/{n})]</p>
        <p className="mvp-step-result">Résultats fiables ≈ <b>{number(c.resultsIndex)} / 100</b></p>
        <p>Le pourcentage de victoire brut et l’indice de confiance sont deux valeurs différentes.</p>
      </section>
      <section className="mvp-calculation-step">
        <h4>3. Impact <span>{percent(MVP_WEIGHTS.impact)} du MVP</span></h4>
        <p>Volume de legs disputés, plafonné à {MVP_REFERENCES.legs} legs.</p>
        <p className="mvp-step-result">min(100 ; {n} / {MVP_REFERENCES.legs} × 100) = <b>{number(c.impactIndex)} / 100</b></p>
      </section>
      <section className="mvp-calculation-step">
        <h4>4. Finishs <span>{percent(MVP_WEIGHTS.finish)} du MVP</span></h4>
        <p>{player.best_finish == null ? "Meilleur finish absent : cette composante utilise 0." : `Meilleur finish enregistré : ${player.best_finish}.`}</p>
        <p className="mvp-step-result">min(100 ; {player.best_finish ?? 0} / {MVP_REFERENCES.finish} × 100) ≈ <b>{number(c.finishIndex)} / 100</b></p>
      </section>
    </div>
    <section className="mvp-total" aria-label={`Somme pondérée de ${player.name}`}>
      <h4>Contribution de chaque KPI à l’indice MVP</h4>
      <dl className="mvp-contributions">
        {indices.map(index => <div key={index.label}><dt>{index.label} · {percent(index.weight)}</dt><dd>{number(index.value, 4)} × {number(index.weight)} ≈ <b>{number(index.contribution, 4)} pts</b></dd></div>)}
      </dl>
      <p className="mvp-total-result">{indices.map(index => number(index.contribution, 4)).join(" + ")} ≈ <span data-mvp-total>{number(c.total, 4)}</span> → <strong>{player.score} / 100</strong></p>
      <p>Les étapes ci-dessus sont affichées avec des décimales arrondies. Le calcul conserve toute sa précision jusqu’à l’arrondi final à l’entier ; les KPI du tableau sont arrondis séparément.</p>
    </section>
    <p className="mvp-calculation-note">Barème gros scores : 100–139 ×{MVP_HIGH_SCORE_WEIGHTS.scores_100}, 140–169 ×{MVP_HIGH_SCORE_WEIGHTS.scores_140}, 170–179 ×{MVP_HIGH_SCORE_WEIGHTS.scores_170}, 180 ×{MVP_HIGH_SCORE_WEIGHTS.scores_180}. Les 120–139 sont déjà compris dans les 100–139 et ne sont pas ajoutés une seconde fois. Le repère des gros scores peut évoluer avec les joueurs du classement.</p>
    {showGuideLink && season === "2027" && <Link className="mvp-guide-link" href="/records/mvp/2027/explications">Voir toutes les règles du trophée MVP 2027 →</Link>}
  </div>;
}

export function MvpCalculationDisclosure({ player, season }: { player: MvpPlayer; season: MvpSeason }) {
  return <details className="mvp-calculation-disclosure">
    <summary><span>Voir le calcul de {player.name}</span><ChevronDown size={17} aria-hidden="true" /></summary>
    <MvpCalculation player={player} season={season} />
  </details>;
}
