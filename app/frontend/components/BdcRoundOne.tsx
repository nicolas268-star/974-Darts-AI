import { BDC_RESULTS, bdcPoints } from "@/lib/bdc";
import source from "@/lib/bdc-round-one.json";
import matches from "@/lib/bdc-round-one-matches.json";

const number = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
const average = (score: number, darts: number) => darts > 0 ? number(score * 3 / darts) : "—";
const names = Object.fromEntries(source.entries.map(entry => [entry.tpid, entry.name]));
const pool = source.pool as Record<string, Record<string, { r: number; a: number }>>;

export function BdcRoundOne() {
  return <section id="resultats-manche-1" className="bdc-section">
    <div className="bdc-heading"><h2>Manche 1 · Résultats</h2><span className="bdc-status">Terminée · 8 doublettes · 16 joueurs</span></div>
    <p><strong>Super Mario / Pierre remportent la manche</strong>, devant Abrousse / Alexandre et Vincent / Guillaume.</p>
    <aside className="bdc-finale" aria-label="Qualité des données"><strong>Statistiques partielles — incident Nakka</strong><p>Des matchs se sont arrêtés à 1–1 dans Nakka et ont été terminés hors application. Les résultats ont ensuite été corrigés manuellement pour établir le classement. Les statistiques ci-dessous couvrent uniquement le jeu enregistré : les legs manquants ne sont ni reconstitués ni comptés comme des zéros.</p></aside>
    <h3>Classement des doublettes et points BDC</h3>
    <div className="bdc-table-scroll" role="region" aria-label="Résultats de la manche 1" tabIndex={0}><table className="bdc-table">
      <caption>Tableau corrigé · points attribués intégralement à chacun des deux joueurs</caption>
      <thead><tr><th scope="col">Place</th><th scope="col">Doublette</th><th scope="col">Victoires en poule</th><th scope="col">Base</th><th scope="col">Bonus plafonné</th><th scope="col">Points par joueur</th></tr></thead>
      <tbody>{BDC_RESULTS[0].teams.map(team => <tr key={team.id}><td>{team.place}</td><th scope="row">{names[team.id]}</th><td>{team.poolWins}/7</td><td>{bdcPoints(team.place!, 0, 8)}</td><td>+{Math.min(team.poolWins!, 3)}</td><td><strong>{bdcPoints(team.place!, team.poolWins!, 8)}</strong></td></tr>)}</tbody>
    </table></div>
    <p className="bdc-note">Places 1 à 4 : phase finale, dont le match pour la 3e place. Places 5 à 8 : ordre de la poule pour les doublettes non qualifiées. Le résultat officiel reste détenu par le directeur sportif du TDC.</p>
    <h3>Statistiques des doublettes · données partielles</h3>
    <div className="bdc-table-scroll" role="region" aria-label="Statistiques partielles des doublettes" tabIndex={0}><table className="bdc-table">
      <caption>Moyennes sur les fléchettes enregistrées uniquement · pas de classement de performance sur l’ensemble du tournoi</caption>
      <thead><tr><th scope="col">Doublette</th><th scope="col">Score enregistré</th><th scope="col">Fléchettes</th><th scope="col">Moy. 3 fl.</th><th scope="col">First 9</th><th scope="col">100–139</th><th scope="col">140–169</th><th scope="col">170–179</th><th scope="col">180</th><th scope="col">Meilleure sortie enregistrée</th></tr></thead>
      <tbody>{BDC_RESULTS[0].teams.map(team => {
        const stats = source.stats[team.id as keyof typeof source.stats];
        return <tr key={team.id}><th scope="row">{names[team.id]}</th><td>{number(stats.score)}</td><td>{stats.darts}</td><td>{average(stats.score, stats.darts)}</td><td>{average(stats.f9Score, stats.f9Darts)}</td><td>{stats.ton00}</td><td>{stats.ton40}</td><td>{stats.ton70}</td><td>{stats.ton80}</td><td>{stats.highOut || "—"}</td></tr>;
      })}</tbody>
    </table></div>
    <p className="bdc-note">Un zéro indique qu’aucune occurrence n’est enregistrée, pas qu’aucune n’a été réalisée pendant le tournoi. Source : statistiques Nakka consultées le 11 septembre 2026.</p>
    <h3>Performances individuelles</h3>
    <p>Les points BDC sont disponibles pour les 16 joueurs dans le classement individuel. Les moyennes, First 9, 180, contributions au score et finishes personnels ne sont pas attribués à partir des seuls totaux d’une doublette. Ils nécessitent des données nominatives par joueur ; aucune répartition arbitraire entre partenaires n’est appliquée.</p>
    <details className="bdc-match-details"><summary>Les 32 matchs · résultats corrigés et moyennes partielles</summary>
      <div className="bdc-table-scroll" role="region" aria-label="Matchs de la manche 1" tabIndex={0}><table className="bdc-table">
        <caption>Scores du tableau corrigé : legs en poule, sets en phase finale. Les moyennes restent partielles.</caption>
        <thead><tr><th scope="col">Phase</th><th scope="col">Doublette A</th><th scope="col">Score corrigé</th><th scope="col">Doublette B</th><th scope="col">Moy. A</th><th scope="col">Moy. B</th><th scope="col">Source</th></tr></thead>
        <tbody>{matches.map(match => {
          const isPool = match.tmid.includes("_rr_");
          const scoreA = isPool ? pool[match.p1tpid][match.p2tpid].r : match.p1winLegs;
          const scoreB = isPool ? pool[match.p2tpid][match.p1tpid].r : match.p2winLegs;
          return <tr key={match.tmid}><td>{match.title.replace("#Manche 1 Blind Draw Championship ", "")}</td><th scope="row">{names[match.p1tpid]}</th><td>{scoreA} – {scoreB}</td><td>{names[match.p2tpid]}</td><td>{average(match.p1allScore, match.p1allDarts)}</td><td>{average(match.p2allScore, match.p2allDarts)}</td><td><a href={`https://n01darts.com/n01/league/n01_view.html?tmid=${encodeURIComponent(match.tmid)}`} target="_blank" rel="noopener noreferrer">Feuille Nakka ↗</a></td></tr>;
        })}</tbody>
      </table></div>
    </details>
  </section>;
}
