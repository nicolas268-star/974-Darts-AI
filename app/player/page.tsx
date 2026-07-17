
import { Sidebar } from "@/components/Sidebar";
import { demoData } from "@/lib/demo-data";

export default function PlayerPage() {
  const player = demoData.players.find(p => p.name === "Nico")!;
  const max = Math.max(...demoData.daily.map(d => d.average));
  return (
    <div className="dashboard">
      <Sidebar />
      <main className="main">
        <span className="badge">Espace joueur</span>
        <h2 style={{marginTop:14}}>{player.name} • {player.team}</h2>
        <p>Profil personnel sécurisé — démonstration reliée au futur compte Supabase.</p>

        <div className="kpi-grid" style={{margin:"24px 0"}}>
          <div className="card"><div className="muted">Moyenne 3 darts</div><div className="metric">{player.average}</div></div>
          <div className="card"><div className="muted">Taux victoire</div><div className="metric">{Math.round(player.winRate*100)}%</div></div>
          <div className="card"><div className="muted">Classement ELO</div><div className="metric">{player.elo}</div></div>
          <div className="card"><div className="muted">Évolution</div><div className="metric">{player.trend}</div></div>
        </div>

        <div className="grid" style={{gridTemplateColumns:"1.3fr .7fr"}}>
          <section className="card">
            <h3>Progression de la moyenne</h3>
            <div className="chart-placeholder">
              {demoData.daily.map(d => (
                <div key={d.day} style={{flex:1,textAlign:"center"}}>
                  <div className="bar" style={{height:`${Math.max(20,(d.average/max)*210)}px`}}></div>
                  <small className="muted">{d.day}</small>
                </div>
              ))}
            </div>
          </section>
          <section className="card">
            <span className="badge">ADN joueur</span>
            <h3>TACTICIAN</h3>
            <p>Profil régulier, efficace dans les legs serrés et capable de limiter les erreurs.</p>
            <div className="notice">La tendance récente est en hausse. Fiabilité statistique : élevée.</div>
          </section>
        </div>

        <section className="card" style={{marginTop:18}}>
          <h3>Repères personnels</h3>
          <table className="table">
            <tbody>
              <tr><td>Legs gagnés / joués</td><td><strong>40 / 87</strong></td></tr>
              <tr><td>First 9</td><td><strong>52,96</strong></td></tr>
              <tr><td>Meilleur finish</td><td><strong>104</strong></td></tr>
              <tr><td>Scores 140+</td><td><strong>9</strong></td></tr>
              <tr><td>Scores 100+</td><td><strong>44</strong></td></tr>
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
