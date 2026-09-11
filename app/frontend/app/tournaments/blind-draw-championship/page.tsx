import type { Metadata } from "next";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { BdcRoundOne } from "@/components/BdcRoundOne";
import { BDC_ROUNDS, BDC_RESULTS, BDC_RULES_URL, bdcDate, bdcStandings } from "@/lib/bdc";
import "../../competitions/competition-hub.css";
import "./bdc.css";

export const metadata: Metadata = {
  title: "Blind Draw Championship · Tampon Darts Club",
  alternates: { canonical: "/tournaments/blind-draw-championship" },
  description: "Les six manches du BDC 2026–2027 : doublettes tirées au sort, points individuels et qualification pour la Super Finale.",
};

export default function BdcPage() {
  const standings = bdcStandings(BDC_RESULTS);
  return <div className="dashboard"><Sidebar /><main className="main competition-page tournament-theme bdc-page">
    <Link href="/tournaments" className="hub-back">← Retour aux tournois</Link>
    <header className="bdc-card">
      <div className="bdc-card-copy"><span className="bdc-eyebrow">TAMPON DARTS CLUB · SAISON 1</span>
        <h1>Blind Draw Championship</h1>
        <p>Six manches en double. Un classement individuel.</p>
        <div className="bdc-tags"><span>Nouveau tirage à chaque manche</span><span>501 · Double Out</span><span>Sept. 2026 → fév. 2027</span></div>
        <nav className="bdc-links" aria-label="Dans le BDC"><a href="#resultats-manche-1">Résultats et statistiques M1</a><a href="#classement">Classement individuel</a><a href="#manches">Les manches</a><a href="#bareme">Barème</a></nav>
      </div><div className="bdc-card-mark" aria-hidden="true">BDC<span>2026 — 2027</span></div>
    </header>

    <BdcRoundOne />

    <section id="manches" className="bdc-section">
      <div className="bdc-heading"><h2>Les six manches</h2><Link href="/calendar">Calendrier complet →</Link></div>
      <div className="bdc-rounds">{BDC_ROUNDS.map((round) => {
        const result = BDC_RESULTS.find((item) => item.round === round.number);
        return <article id={`manche-${round.number}`} className="bdc-round" key={round.number}>
          <span className="bdc-eyebrow">MANCHE {round.number}</span><h3><time dateTime={round.date}>{bdcDate(round.date)}</time></h3>
          <p>19 h · heure de La Réunion</p><p>{round.location}</p>
          <span className="bdc-status">{result ? "Terminée · classement corrigé" : "Résultats à venir"}</span>
          {round.sourceUrl ? <><a href={round.sourceUrl} target="_blank" rel="noopener noreferrer">Ouvrir la manche sur Nakka ↗</a>{!result && <small>Accès protégé : mot de passe communiqué lors du tirage au sort.</small>}</> : <small>Doublettes et lien de suivi à venir.</small>}
          {result && <a href="#resultats-manche-1">Résultats et statistiques partielles →</a>}
        </article>;
      })}</div>
    </section>

    <section id="classement" className="bdc-section">
      <div className="bdc-heading"><h2>Classement individuel</h2><span className="bdc-status">{standings.length ? "Provisoire" : "En attente des premiers résultats"}</span></div>
      <p>Chaque joueur cumule ses points sur les six manches, même lorsqu’il change de partenaire.</p>
      <p className="bdc-note"><strong>Résultats officiels :</strong> les résultats et le classement officiels sont tenus par le directeur sportif du Tampon Darts Club (TDC). Les données présentées sur 974 Darts AI sont fournies à titre informatif.</p>
      <div className="bdc-table-scroll" role="region" aria-label="Classement individuel BDC" tabIndex={0}>
        <table className="bdc-table"><caption>Points par manche, total et seuil de participation</caption><thead><tr><th scope="col">Rang</th><th scope="col">Joueur</th>{BDC_ROUNDS.map((round) => <th scope="col" key={round.number}>M{round.number}</th>)}<th scope="col">Total</th><th scope="col">Manches</th><th scope="col">Seuil de 3 manches</th></tr></thead>
          <tbody>{standings.length ? standings.map((row) => <tr key={row.id}><td>{row.rank}</td><th scope="row">{row.name}</th>{row.points.map((points, i) => <td key={i}>{points ?? "—"}</td>)}<td><strong>{row.total}{row.pending ? "*" : ""}</strong></td><td>{row.participations}/6</td><td>{row.eligible ? "Atteint" : `${3 - row.participations} restante(s)`}</td></tr>) : <tr><td colSpan={11} className="bdc-empty">Les joueurs et leurs points apparaîtront après la saisie des premiers résultats validés.</td></tr>}</tbody>
        </table>
      </div>
      <p className="bdc-note">— : absence ou points non encore validés. * : total incomplet. Les égalités de points restent ex æquo dans l’attente du départage officiel.</p>
      <aside className="bdc-finale"><strong>Objectif : la Super Finale en simple</strong><p>Les huit meilleurs joueurs éligibles, avec au moins trois manches disputées, accéderont à la finale prévue le 21 février 2027 à 9 h. Lieu à confirmer dans le sud de La Réunion. Atteindre trois participations ne garantit pas la qualification.</p></aside>
    </section>

    <section id="bareme" className="bdc-section">
      <div className="bdc-heading"><h2>Des points pour chaque joueur</h2><a href={BDC_RULES_URL} target="_blank" rel="noopener noreferrer">Règles de l’organisateur ↗</a></div>
      <p>Les deux membres d’une doublette reçoivent chacun les points correspondant à leur classement, ainsi que le bonus de poules. Les points ne sont pas divisés entre les partenaires.</p>
      <div className="bdc-scoring"><div className="bdc-table-scroll"><table className="bdc-table"><thead><tr><th scope="col">Place de la doublette</th><th scope="col">Points par joueur</th></tr></thead><tbody>{[["1re", "8"], ["2e", "6"], ["3e", "5"], ["4e", "4"], ["5e à 8e", "2"], ["9e à 12e · manche à 12 doublettes", "1"]].map(([place, points]) => <tr key={place}><th scope="row">{place}</th><td>{points}</td></tr>)}</tbody></table></div>
        <aside className="bdc-bonus"><span className="bdc-eyebrow">BONUS DE POULES</span><strong>+1 point</strong><p>par match gagné en poules, limité à <b>3 points par joueur et par manche</b>.</p><p>Exemple : une victoire finale et deux victoires en poules donnent <b>10 points à chacun des deux joueurs</b>.</p></aside>
      </div>
      <p className="bdc-note">Dates et lieux prévisionnels selon l’organisateur. Les résultats du BDC alimentent son propre classement individuel.</p>
    </section>
  </main></div>;
}
