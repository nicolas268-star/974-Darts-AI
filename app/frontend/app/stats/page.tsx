import Link from "next/link";
import "./stats-hub.css";

const groups = [
  {
    eyebrow: "CHAMPIONNAT",
    title: "Résultats & classement",
    copy: "Suivez la saison officielle, les compétitions et le calendrier à partir des données publiées.",
    links: [
      ["Classement officiel", "/dashboard"],
      ["Compétitions", "/competitions"],
      ["Calendrier", "/calendar"],
      ["Tournois amicaux", "/tournaments"],
    ],
  },
  {
    eyebrow: "PERFORMANCE",
    title: "Joueurs & équipes",
    copy: "Moyennes, First 9, progression, historiques, équipes et synergies de duos.",
    links: [
      ["Joueurs", "/players"],
      ["Équipes", "/teams"],
      ["Duos", "/duos"],
      ["Mon espace joueur", "/player"],
    ],
  },
  {
    eyebrow: "RECORDS",
    title: "Records & palmarès",
    copy: "Retrouvez les performances marquantes sans mélanger les données officielles avec les parties de jeu libre.",
    links: [
      ["Club des 180", "/records/180"],
      ["Meilleurs finishs", "/records/finishes"],
      ["MVP", "/records/mvp"],
    ],
  },
] as const;

export default function StatsHubPage() {
  return (
    <main className="stats-hub">
      <section className="stats-hub-hero">
        <div>
          <span className="stats-hub-kicker">DOMAINE 01 · DATA</span>
          <h1>Stats & Données</h1>
          <p>Tout ce qui décrit le championnat et la performance est regroupé ici. Les outils de jeu restent dans un espace séparé.</p>
        </div>
        <Link className="stats-hub-switch" href="/play">Passer aux Jeux →</Link>
      </section>

      <section className="stats-hub-grid" aria-label="Rubriques statistiques">
        {groups.map((group, index) => (
          <article className="stats-hub-card" key={group.title}>
            <span className="stats-hub-number">0{index + 1}</span>
            <small>{group.eyebrow}</small>
            <h2>{group.title}</h2>
            <p>{group.copy}</p>
            <nav aria-label={group.title}>
              {group.links.map(([label, href]) => (
                <Link href={href} key={href}>{label}<span>→</span></Link>
              ))}
            </nav>
          </article>
        ))}
      </section>
    </main>
  );
}
