import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import type { ChampionshipHub } from "@/lib/types/sprint14";
import "../../competitions/competition-hub.css";

async function loadChampionship(
  season: string,
): Promise<ChampionshipHub | null> {
  const base = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";
  try {
    const response = await fetch(
      `${base}/api/v1/competitions/championships/${encodeURIComponent(season)}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      },
    );
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
}

const formatNumber = (value: number | null | undefined) =>
  value == null ? "—" : value.toLocaleString("fr-FR");

const formatDecimal = (value: number | null | undefined) =>
  value == null
    ? "—"
    : value.toLocaleString("fr-FR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("fr-RE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Indian/Reunion",
  }).format(new Date(`${value}T12:00:00+04:00`));

export default async function ChampionshipPage({
  params,
}: {
  params: Promise<{ season: string }>;
}) {
  const { season } = await params;
  const data = await loadChampionship(season);

  return (
    <div className="dashboard">
      <Sidebar />
      <main className="main competition-page championship-theme">
        <Link href="/competitions" className="hub-back">
          ← Retour aux compétitions
        </Link>

        {!data ? (
          <div className="competition-notice danger">
            Ce championnat est indisponible. Vérifiez que le backend est
            démarré puis actualisez la page.
          </div>
        ) : (
          <>
            <header className="competition-hero">
              <div>
                <span className="competition-eyebrow">
                  CHAMPIONNAT OFFICIEL
                </span>
                <div className="hub-title">
                  <div>
                    <h1>Saison {data.championship.year}</h1>
                    <p>
                      Classement collectif et leaders individuels de la
                      saison sélectionnée.
                    </p>
                  </div>
                </div>
              </div>
              <span className="hub-status">
                {data.championship.is_active
                  ? "Saison active"
                  : data.championship.status === "PLANNED"
                    ? "Saison à venir"
                    : "Saison archivée"}
              </span>
            </header>

            {data.status_message && (
              <div className="competition-notice">
                {data.status_message}
              </div>
            )}

            <section className="hub-kpis">
              <article>
                <span>Journées</span>
                <strong>{formatNumber(data.summary.rounds)}</strong>
              </article>
              <article>
                <span>Équipes</span>
                <strong>{formatNumber(data.summary.teams)}</strong>
              </article>
              <article>
                <span>Rencontres</span>
                <strong>{formatNumber(data.summary.encounters)}</strong>
              </article>
              <article>
                <span>Legs valides</span>
                <strong>{formatNumber(data.summary.valid_legs)}</strong>
              </article>
              <article>
                <span>Joueurs classés</span>
                <strong>{formatNumber(data.summary.players)}</strong>
              </article>
            </section>

            {!!data.schedule?.length && (
              <section className="hub-panel championship-schedule">
                <div className="championship-schedule-heading">
                  <div>
                    <span className="competition-eyebrow">CALENDRIER OFFICIEL</span>
                    <h2>Les 30 rencontres de 2026</h2>
                  </div>
                  <span>Dates Nakka · heure de La Réunion</span>
                </div>
                <div className="hub-table-scroll">
                  <table className="hub-table">
                    <thead>
                      <tr>
                        <th>Journée</th>
                        <th>Date</th>
                        <th>Domicile</th>
                        <th>Extérieur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.schedule.map((fixture) => (
                        <tr key={fixture.nakka_event_id}>
                          <td><strong>{fixture.round}</strong></td>
                          <td>{formatDate(fixture.played_on)}</td>
                          <td>{fixture.home}</td>
                          <td>{fixture.away}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.schedule_source && (
                  <p className="championship-schedule-source">
                    Source officielle : Nakka · format JJ/MM/AAAA
                  </p>
                )}
              </section>
            )}

            <section className="hub-panel">
              <h2>Classement des équipes</h2>
              {data.standings.length ? (
                <div className="hub-table-scroll">
                  <table className="hub-table">
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
                      {data.standings.map((team) => (
                        <tr key={team.team_id}>
                          <td>{team.rank}</td>
                          <td>
                            <Link href={`/teams/${team.team_id}`}>
                              {team.name}
                            </Link>
                          </td>
                          <td>{team.played}</td>
                          <td>{team.wins}</td>
                          <td>{team.draws}</td>
                          <td>{team.losses}</td>
                          <td>{team.sets_won}</td>
                          <td>{team.sets_lost}</td>
                          <td>
                            {team.set_difference > 0 ? "+" : ""}
                            {team.set_difference}
                          </td>
                          <td><strong>{team.points}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="hub-empty">
                  Le classement apparaîtra après le premier import de cette
                  saison.
                </p>
              )}
            </section>

            <section className="hub-panel">
              <h2>Leaders individuels</h2>
              {data.leaders.length ? (
                <div className="hub-table-scroll">
                  <table className="hub-table">
                    <thead>
                      <tr>
                        <th>Joueur</th>
                        <th>Équipe</th>
                        <th>Legs G/J</th>
                        <th>Moy. 3 fl.</th>
                        <th>First 9</th>
                        <th>Meilleur finish</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.leaders.map((player) => (
                        <tr key={player.player_id}>
                          <td>
                            <Link href={`/players/${player.player_id}`}>
                              {player.name}
                            </Link>
                          </td>
                          <td>{player.team}</td>
                          <td>
                            {player.legs_won}/{player.legs_played}
                          </td>
                          <td>{formatDecimal(player.average_3_darts)}</td>
                          <td>{formatDecimal(player.first_9)}</td>
                          <td>{formatNumber(player.best_finish)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="hub-empty">
                  Les leaders apparaîtront après le premier import.
                </p>
              )}
            </section>

            {!!data.data_quality_notes?.length && (
              <div className="competition-notice">
                {data.data_quality_notes.join(" · ")}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
