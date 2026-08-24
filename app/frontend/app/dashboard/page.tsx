import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import type { RankingPayload } from "@/lib/types/sprint4";
import "./championship.css";

const backend = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";

type SeasonOption = { key:string; label:string; status:string; dbSeasonId?:string|null; active:boolean };
async function loadSeasons(): Promise<{seasons:SeasonOption[];defaultSeason:string}> {
  try { const response=await fetch(`${backend}/api/v1/seasons`,{cache:"no-store",signal:AbortSignal.timeout(5000)}); return response.ok?response.json():{seasons:[],defaultSeason:"2026"}; } catch { return {seasons:[],defaultSeason:"2026"}; }
}
async function loadRanking(seasonId?:string|null): Promise<RankingPayload | null> {
  try {
    const response = await fetch(`${backend}/api/v1/ranking${seasonId?`?season_id=${encodeURIComponent(seasonId)}`:""}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
}

export default async function DashboardPage({searchParams}:{searchParams:Promise<{season?:string}>}) {
  const params=await searchParams; const registry=await loadSeasons();
  const selectedKey=params.season||"2026"; const selected=registry.seasons.find(item=>item.key===selectedKey)||registry.seasons[0];
  const futureWithoutData=selectedKey!=="2026"&&!selected?.dbSeasonId;
  const data = futureWithoutData?null:await loadRanking(selected?.dbSeasonId);

  const standings = data?.standings ?? [];

  const leader = standings[0] ?? null;
  const bestAttack = [...standings].sort((a, b) => b.sets_won - a.sets_won)[0] ?? null;
  const bestDefense = [...standings].sort((a, b) => a.sets_lost - b.sets_lost)[0] ?? null;

  return (
    <div className="dashboard championship-shell">
      <Sidebar />

      <main className="main championship-main">
        <header className="championship-hero">
          <div>
            <span className="championship-kicker">CHAMPIONNAT OFFICIEL · LA RÉUNION</span>
            <h1>Championnat {data?.season?.name ?? "2026"}</h1>
            <p>
              Classement, performances collectives et leaders statistiques de la saison.
            </p>
          </div>

          <div className="championship-status">
            <span>Source du classement</span>
            <strong>
              {data?.ranking_source === "CALENDRIER_SCORE"
                ? "Calendrier Score vérifié"
                : data
                  ? "Secours PvP"
                  : "Backend indisponible"}
            </strong>
          </div>
        </header>

        <nav className="season-switcher" aria-label="Choisir la saison">{registry.seasons.map(item=><Link key={item.key} href={`/dashboard?season=${item.key}`} className={item.key===selectedKey?"active":""}>{item.label}<small>{item.status}</small></Link>)}</nav>

        {!data ? (
          <section className="championship-empty">
            <strong>Aucune donnée de championnat disponible</strong>
            <p>
              {futureWithoutData ? "La saison est enregistrée et surveillée. Le classement apparaîtra après l’import des premières données officielles." : <>La page est prête, mais l’endpoint <code>/api/v1/ranking</code> ne retourne actuellement aucune donnée exploitable.</>}
            </p>
          </section>
        ) : (
          <>
            <section className="championship-kpis">
              <article>
                <span>Journées</span>
                <strong>{data.summary.rounds}</strong>
              </article>
              <article>
                <span>Équipes</span>
                <strong>{data.summary.teams}</strong>
              </article>
              <article>
                <span>Rencontres</span>
                <strong>{data.summary.encounters}</strong>
              </article>
              <article>
                <span>Résultats officiels</span>
                <strong>{data.summary.official_results ?? 0}</strong>
              </article>
              <article>
                <span>Leader</span>
                <strong>{leader?.name ?? "—"}</strong>
              </article>
              <article>
                <span>Barème</span>
                <strong>
                  {data.rules.win_points}/{data.rules.draw_points}/{data.rules.loss_points}
                </strong>
              </article>
            </section>

            {data.data_quality_notes.length ? (
              <section className="championship-quality" aria-label="Qualité des données">
                <div>
                  <strong>Classement collectif complet</strong>
                  <span>
                    {data.summary.collective_only_encounters ?? 0} rencontre(s) sans
                    détail PvP · aucune statistique individuelle inventée
                  </span>
                </div>
                <ul>
                  {data.data_quality_notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="championship-grid">
              <article className="championship-panel championship-panel-wide">
                <div className="championship-section-heading">
                  <div>
                    <span>CLASSEMENT OFFICIEL</span>
                    <h2>Classement des équipes</h2>
                  </div>
                  <small>{standings.length} équipe(s)</small>
                </div>

                <div className="championship-table-wrap">
                  <table className="championship-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Équipe</th>
                        <th>MJ</th>
                        <th>V</th>
                        <th>N</th>
                        <th>D</th>
                        <th>Sets +</th>
                        <th>Sets −</th>
                        <th>Diff.</th>
                        <th>Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((team) => (
                        <tr key={team.team_id}>
                          <td>
                            <span className={`rank-badge rank-${Math.min(team.rank, 3)}`}>
                              {team.rank}
                            </span>
                          </td>
                          <td>
                            <Link className="team-link" href={`/teams/${team.team_id}`}>
                              <strong>{team.name}</strong>
                              <span>Voir l’équipe →</span>
                            </Link>
                          </td>
                          <td>{team.played}</td>
                          <td>{team.wins}</td>
                          <td>{team.draws}</td>
                          <td>{team.losses}</td>
                          <td>{team.sets_won}</td>
                          <td>{team.sets_lost}</td>
                          <td className={team.set_difference >= 0 ? "positive" : "negative"}>
                            {team.set_difference > 0 ? `+${team.set_difference}` : team.set_difference}
                          </td>
                          <td><strong>{team.points}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="championship-panel">
                <div className="championship-section-heading">
                  <div>
                    <span>PERFORMANCES</span>
                    <h2>Leaders collectifs</h2>
                  </div>
                </div>

                <div className="championship-leaders">
                  <div>
                    <span>Leader championnat</span>
                    <strong>{leader?.name ?? "—"}</strong>
                    <small>{leader?.points ?? 0} points</small>
                  </div>
                  <div>
                    <span>Meilleure attaque</span>
                    <strong>{bestAttack?.name ?? "—"}</strong>
                    <small>{bestAttack?.sets_won ?? 0} sets gagnés</small>
                  </div>
                  <div>
                    <span>Meilleure défense</span>
                    <strong>{bestDefense?.name ?? "—"}</strong>
                    <small>{bestDefense?.sets_lost ?? 0} sets concédés</small>
                  </div>
                </div>
              </article>

              <article className="championship-panel">
                <div className="championship-section-heading">
                  <div>
                    <span>ACCÈS PUBLIC</span>
                    <h2>Statistiques individuelles</h2>
                  </div>
                </div>
                <div className="private-stats-notice">
                  <div>
                    <strong>Toutes les performances sont accessibles</strong>
                    <span>
                      Consultez librement les moyennes, First 9, historiques,
                      comparaisons et classements des duos.
                    </span>
                  </div>
                  <Link href="/players">Explorer les joueurs →</Link>
                </div>
              </article>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
