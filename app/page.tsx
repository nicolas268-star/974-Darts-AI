
import Link from "next/link";
import { demoData } from "@/lib/demo-data";

export default function HomePage() {
  return (
    <main>
      <section className="container hero">
        <div>
          <div className="eyebrow">Championnat 974 • Analyse sportive</div>
          <h1>Vos fléchettes.<br/>Vos données.<br/>Votre progression.</h1>
          <p>
            974 Darts AI transforme les résultats du championnat en profils joueurs,
            classements, tendances, analyses d'équipe et conseils personnalisés.
          </p>
          <div style={{display:"flex", gap:12, flexWrap:"wrap", marginTop:26}}>
            <Link className="btn btn-primary" href="/login">Accéder à mon espace</Link>
            <Link className="btn btn-secondary" href="/dashboard">Voir le classement public</Link>
          </div>
        </div>
        <div className="hero-card">
          <span className="badge">Dernière mise à jour • J7</span>
          <h2 style={{marginTop:18}}>Le championnat en un regard</h2>
          <div className="grid" style={{gridTemplateColumns:"repeat(2,1fr)"}}>
            <div><div className="muted">Joueurs suivis</div><div className="metric">42</div></div>
            <div><div className="muted">Équipes</div><div className="metric">6</div></div>
            <div><div className="muted">Legs analysés</div><div className="metric">3 389</div></div>
            <div><div className="muted">Matchs validés</div><div className="metric">97%</div></div>
          </div>
        </div>
      </section>

      <section className="container section">
        <h2>Classement joueurs</h2>
        <div className="card">
          <table className="table">
            <thead><tr><th>Rang</th><th>Joueur</th><th>Équipe</th><th>Moyenne</th><th>ELO</th><th>Tendance</th></tr></thead>
            <tbody>
              {demoData.players.map(p => (
                <tr key={p.name}><td>{p.rank}</td><td><strong>{p.name}</strong></td><td>{p.team}</td><td>{p.average}</td><td>{p.elo}</td><td>{p.trend}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="container section">
        <div className="grid">
          <div className="card"><span className="badge">Joueur</span><h3>Suivez votre progression</h3><p>Moyenne, First 9, finishes, ELO, historique et ADN de jeu.</p></div>
          <div className="card"><span className="badge">Capitaine</span><h3>Pilotez votre équipe</h3><p>Comparez les joueurs, analysez les doubles et préparez les rencontres.</p></div>
          <div className="card"><span className="badge">Administrateur</span><h3>Publiez une journée</h3><p>Import, anomalies, reconstruction, validation et publication centralisée.</p></div>
        </div>
      </section>
    </main>
  );
}
