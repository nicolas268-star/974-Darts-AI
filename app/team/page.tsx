
import { Sidebar } from "@/components/Sidebar";
import { demoData } from "@/lib/demo-data";

export default function TeamPage() {
  const members = demoData.players.filter(p => p.team === "Fournaise");
  return (
    <div className="dashboard">
      <Sidebar />
      <main className="main">
        <span className="badge">Capitaine</span>
        <h2 style={{marginTop:14}}>La Fournaise</h2>
        <p>Comparaison des joueurs, dynamique d'équipe et préparation des compositions.</p>

        <div className="kpi-grid" style={{margin:"24px 0"}}>
          <div className="card"><div className="muted">Matchs</div><div className="metric">7</div></div>
          <div className="card"><div className="muted">Victoires</div><div className="metric">4</div></div>
          <div className="card"><div className="muted">Taux</div><div className="metric">57%</div></div>
          <div className="card"><div className="muted">Force estimée</div><div className="metric">74</div></div>
        </div>

        <section className="card">
          <h3>Effectif</h3>
          <table className="table">
            <thead><tr><th>Joueur</th><th>Moyenne</th><th>Taux victoire</th><th>ELO</th><th>Dynamique</th></tr></thead>
            <tbody>{members.map(p => (
              <tr key={p.name}><td><strong>{p.name}</strong></td><td>{p.average}</td><td>{Math.round(p.winRate*100)}%</td><td>{p.elo}</td><td>{p.trend}</td></tr>
            ))}</tbody>
          </table>
        </section>

        <div className="notice" style={{marginTop:18}}>
          Module 8 futur : simulation de composition, probabilités de victoire et War Room.
        </div>
      </main>
    </div>
  );
}
