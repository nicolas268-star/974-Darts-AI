
import { Sidebar } from "@/components/Sidebar";
import { demoData } from "@/lib/demo-data";

export default function DashboardPage() {
  return (
    <div className="dashboard">
      <Sidebar />
      <main className="main">
        <span className="badge">Public</span>
        <h2 style={{marginTop:14}}>Classement du championnat</h2>
        <div className="kpi-grid" style={{margin:"22px 0"}}>
          <div className="card"><div className="muted">Journée</div><div className="metric">J7</div></div>
          <div className="card"><div className="muted">Équipes</div><div className="metric">6</div></div>
          <div className="card"><div className="muted">Joueurs</div><div className="metric">42</div></div>
          <div className="card"><div className="muted">Matchs</div><div className="metric">147</div></div>
        </div>

        <div className="grid" style={{gridTemplateColumns:"1fr 1fr"}}>
          <section className="card">
            <h3>Classement équipes</h3>
            <table className="table">
              <thead><tr><th>#</th><th>Équipe</th><th>MJ</th><th>V</th><th>Taux</th></tr></thead>
              <tbody>{demoData.teams.map(t => (
                <tr key={t.name}><td>{t.rank}</td><td><strong>{t.name}</strong></td><td>{t.played}</td><td>{t.wins}</td><td>{Math.round(t.rate*100)}%</td></tr>
              ))}</tbody>
            </table>
          </section>
          <section className="card">
            <h3>Top ELO</h3>
            <table className="table">
              <thead><tr><th>#</th><th>Joueur</th><th>ELO</th><th>Δ</th></tr></thead>
              <tbody>{demoData.players.map(p => (
                <tr key={p.name}><td>{p.rank}</td><td>{p.name}</td><td><strong>{p.elo}</strong></td><td>{p.trend}</td></tr>
              ))}</tbody>
            </table>
          </section>
        </div>
      </main>
    </div>
  );
}
