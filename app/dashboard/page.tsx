import { Sidebar } from "@/components/Sidebar";
import type { RankingPayload } from "@/lib/types/sprint4";

async function loadRanking(): Promise<RankingPayload | null> {
  const base = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";
  try { const r = await fetch(`${base}/api/v1/ranking`, { cache: "no-store" }); return r.ok ? r.json() : null; } catch { return null; }
}
export default async function DashboardPage() {
  const data = await loadRanking();
  return <div className="dashboard"><Sidebar/><main className="main">
    <span className="badge">Sprint 4 · Données publiées</span>
    <h2 style={{marginTop:14}}>Classement {data?.season?.name ?? "du championnat"}</h2>
    <p>Barème chargé depuis Supabase : victoire {data?.rules.win_points ?? 3}, nul {data?.rules.draw_points ?? 2}, défaite {data?.rules.loss_points ?? 1}.</p>
    <div className="kpi-grid" style={{margin:"22px 0"}}>
      <div className="card"><div className="muted">Journées</div><div className="metric">{data?.summary.rounds ?? "—"}</div></div>
      <div className="card"><div className="muted">Équipes</div><div className="metric">{data?.summary.teams ?? "—"}</div></div>
      <div className="card"><div className="muted">Rencontres</div><div className="metric">{data?.summary.encounters ?? "—"}</div></div>
      <div className="card"><div className="muted">Legs valides</div><div className="metric">{data?.summary.valid_legs ?? "—"}</div></div>
    </div>
    <section className="card"><h3>Classement équipes</h3>
      {!data ? <div className="notice">Backend indisponible ou migration Sprint 4 non exécutée.</div> :
      <div style={{overflowX:"auto"}}><table className="table"><thead><tr><th>#</th><th>Équipe</th><th>MJ</th><th>V</th><th>N</th><th>D</th><th>Legs +</th><th>Legs −</th><th>Diff.</th><th>Pts</th></tr></thead>
      <tbody>{data.standings.map(t=><tr key={t.team_id}><td><strong>{t.rank}</strong></td><td><strong>{t.name}</strong></td><td>{t.played}</td><td>{t.wins}</td><td>{t.draws}</td><td>{t.losses}</td><td>{t.legs_won}</td><td>{t.legs_lost}</td><td>{t.leg_difference>0?`+${t.leg_difference}`:t.leg_difference}</td><td><strong>{t.points}</strong></td></tr>)}</tbody></table></div>}
    </section>
  </main></div>;
}
