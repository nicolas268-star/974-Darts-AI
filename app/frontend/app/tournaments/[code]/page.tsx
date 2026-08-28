import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import type {
  TournamentHub,
  TournamentMatch,
  TournamentParticipant,
  TournamentRoundRobinGroup,
} from "@/lib/types/sprint14";
import "../../competitions/competition-hub.css";

async function loadTournament(code: string): Promise<TournamentHub | null> {
  const base = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";
  try {
    const response = await fetch(
      `${base}/api/v1/competitions/tournaments/${encodeURIComponent(code)}`,
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

const decimal = (value: number | null | undefined) =>
  value == null
    ? "—"
    : value.toLocaleString("fr-FR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const displayName = (data: TournamentHub, name: string) =>
  data.display_aliases?.[name] ?? name;

function MatchCard({
  match,
  compact = false,
}: {
  match: TournamentMatch;
  compact?: boolean;
}) {
  return (
    <article className={`visual-match-card${compact ? " compact" : ""}`}>
      <header>
        <span>Match {match.match_number ?? "—"}</span>
        <b>{match.legs} legs</b>
      </header>
      <div className={match.winner === match.home ? "winner" : ""}>
        <span>{match.home}</span>
        <strong>{match.home_score}</strong>
      </div>
      <div className={match.winner === match.away ? "winner" : ""}>
        <span>{match.away}</span>
        <strong>{match.away_score}</strong>
      </div>
      {!match.result_complete && (
        <small>{match.unresolved_legs} leg(s) à vérifier</small>
      )}
    </article>
  );
}

function ParticipantTable({
  participants,
  aliases = {},
  duo,
  emptyMessage = "Aucune donnée disponible.",
}: {
  participants: TournamentParticipant[];
  aliases?: Record<string, string>;
  duo?: boolean;
  emptyMessage?: string;
}) {
  if (!participants.length) {
    return <p className="hub-empty">{emptyMessage}</p>;
  }
  return (
    <div className="hub-table-scroll">
      <table className="hub-table">
        <thead>
          <tr>
            <th>{duo ? "Duo" : "Joueur"}</th>
            <th>{duo ? "Joueurs suivis" : "Équipe / duo"}</th>
            <th>Legs G/J</th>
            <th>Moy. 3 fl.</th>
            <th>First 9</th>
            <th>Finish</th>
            <th>180</th>
            <th>140+</th>
            <th>100+</th>
          </tr>
        </thead>
        <tbody>
          {participants.map((participant) => (
            <tr key={participant.name}>
              <td><strong>{aliases[participant.name] ?? participant.name}</strong></td>
              <td>
                {duo
                  ? participant.players?.join(" / ") || "—"
                  : participant.team || "—"}
              </td>
              <td>
                {participant.legs_won}/{participant.legs_played}
              </td>
              <td>{decimal(participant.average_3_darts)}</td>
              <td>{decimal(participant.first_9)}</td>
              <td>{participant.best_finish ?? "—"}</td>
              <td>{participant.scores_180}</td>
              <td>{participant.scores_140}</td>
              <td>{participant.scores_100}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoundRobinTable({ group }: { group: TournamentRoundRobinGroup }) {
  const standingByName = new Map(
    group.standings.map((standing) => [standing.name, standing]),
  );

  return (
    <article className="round-robin-card">
      <div className="round-robin-heading">
        <div>
          <span>ROUND ROBIN</span>
          <h3>{group.name}</h3>
          <p>{group.format_label}</p>
        </div>
        <div className="round-robin-badges">
          <b>{group.participant_count} joueurs</b>
          <b className={group.complete ? "complete" : "warning"}>
            {group.match_count}/{group.expected_match_count} matchs
          </b>
        </div>
      </div>

      <div className="round-robin-scroll">
        <table className="round-robin-table">
          <thead>
            <tr>
              <th className="rr-rank-index">#</th>
              <th className="rr-player-name">Joueur</th>
              {group.matrix.map((row) => (
                <th className="rr-opponent" key={row.name} title={row.name}>
                  {row.number}
                </th>
              ))}
              <th>MJ</th>
              <th>V</th>
              <th>N</th>
              <th>D</th>
              <th>+/-</th>
              <th>Pts</th>
              <th>Rang</th>
            </tr>
          </thead>
          <tbody>
            {group.matrix.map((row) => {
              const standing = standingByName.get(row.name);
              return (
                <tr key={row.name}>
                  <td className="rr-rank-index">{row.number}</td>
                  <th className="rr-player-name" scope="row">
                    <strong>{row.name}</strong>
                    <small>{decimal(row.average_3_darts)}</small>
                  </th>
                  {row.cells.map((cell, cellIndex) =>
                    cell === null ? (
                      <td
                        aria-label={`${row.name}, même joueur`}
                        className="rr-self"
                        key={`${row.name}-self`}
                      />
                    ) : (
                      <td
                        className={`rr-result${cell.won ? " won" : " lost"}${!cell.played ? " missing" : ""}`}
                        key={`${row.name}-${cell.opponent}-${cellIndex}`}
                        title={`${row.name} contre ${cell.opponent}`}
                      >
                        {cell.played ? (
                          <>
                            <strong>
                              {cell.score_for} – {cell.score_against}
                            </strong>
                            <small>{decimal(cell.average_3_darts)}</small>
                          </>
                        ) : (
                          <span>—</span>
                        )}
                      </td>
                    ),
                  )}
                  <td>{standing?.played ?? 0}</td>
                  <td>{standing?.wins ?? 0}</td>
                  <td>{standing?.draws ?? 0}</td>
                  <td>{standing?.losses ?? 0}</td>
                  <td className={(standing?.leg_difference ?? 0) >= 0 ? "rr-positive" : "rr-negative"}>
                    {(standing?.leg_difference ?? 0) > 0 ? "+" : ""}
                    {standing?.leg_difference ?? 0}
                  </td>
                  <td><strong>{standing?.points ?? 0}</strong></td>
                  <td>
                    <span className={`rr-final-rank rank-${standing?.rank ?? 0}`}>
                      {standing?.rank ?? "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="round-robin-legend">
        <span><i className="rr-legend-win" /> Victoire</span>
        <span><i className="rr-legend-loss" /> Défaite</span>
        <span>Barème : {group.win_points} points par victoire</span>
      </footer>
    </article>
  );
}

export default async function TournamentPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const data = await loadTournament(code);
  const bestAverage = data?.players
    .filter((player) => player.average_3_darts != null)
    .sort((a, b) => (b.average_3_darts ?? 0) - (a.average_3_darts ?? 0))[0];
  const bestFirst9 = data?.players
    .filter((player) => player.first_9 != null)
    .sort((a, b) => (b.first_9 ?? 0) - (a.first_9 ?? 0))[0];
  const bestFinish = data?.players
    .filter((player) => player.best_finish != null)
    .sort((a, b) => (b.best_finish ?? 0) - (a.best_finish ?? 0))[0];
  const scorers180 = data?.players.filter((player) => player.scores_180 > 0) ?? [];
  const total180 = scorers180.reduce((total, player) => total + player.scores_180, 0);

  return (
    <div className="dashboard">
      <Sidebar />
      <main className="main competition-page tournament-theme">
        <Link href="/tournaments" className="hub-back">
          ← Retour aux tournois amicaux
        </Link>

        {!data ? (
          <div className="competition-notice danger">
            Ce tournoi est indisponible. Vérifiez le backend puis actualisez.
          </div>
        ) : (
          <>
            <header className="competition-hero">
              <div>
                <span className="competition-eyebrow">
                  {data.code} · {data.event_name}
                </span>
                <h1>{data.date_label ?? data.name}</h1>
                <p>
                  {data.format_label ?? "Phase de poules et tableau final"} ·
                  Analyse indépendante du championnat.
                </p>
              </div>
              <span className="hub-status">
                {data.status === "AVAILABLE"
                  ? "Données disponibles"
                  : "En attente de données"}
              </span>
            </header>

            <div className="competition-notice">
              Tournoi hors championnat : aucun résultat affiché ici ne
              modifie les points, le classement officiel ou l’ELO.
            </div>

            {data.editorial_summary && (
              <section className="hub-panel tournament-story-panel">
                <div className="tournament-story-heading">
                  <div>
                    <span className="competition-eyebrow">RÉSUMÉ DU TOURNOI</span>
                    <h2>Papangue Dart Cup nº1</h2>
                  </div>
                  <div className="tournament-podium">
                    <span>🏆 <strong>{data.winner}</strong></span>
                    <span>🥈 {data.runner_up}</span>
                  </div>
                </div>
                <p>{data.editorial_summary}</p>
              </section>
            )}

            {!!data.players.length && (
              <section className="hub-panel tournament-highlights-panel">
                <div className="tournament-panel-heading">
                  <div>
                    <span>PERFORMANCES DU TOURNOI</span>
                    <h2>Les distinctions de T4</h2>
                  </div>
                  <p>Calculées à partir des statistiques validées du tournoi.</p>
                </div>
                <div className="tournament-highlights-grid">
                  <article><span>🎯 Meilleure moyenne</span><strong>{bestAverage ? displayName(data, bestAverage.name) : "—"}</strong><b>{decimal(bestAverage?.average_3_darts)}</b></article>
                  <article><span>⚡ Meilleur First 9</span><strong>{bestFirst9 ? displayName(data, bestFirst9.name) : "—"}</strong><b>{decimal(bestFirst9?.first_9)}</b></article>
                  <article><span>🔥 Plus haute sortie</span><strong>{bestFinish ? displayName(data, bestFinish.name) : "—"}</strong><b>{bestFinish?.best_finish ?? "—"}</b></article>
                  <article><span>💥 180 réalisés</span><strong>{total180} au total</strong><b>{scorers180.map((player) => `${displayName(data, player.name)} (${player.scores_180})`).join(" · ") || "—"}</b></article>
                </div>
              </section>
            )}

            <section className="hub-kpis">
              <article>
                <span>Matchs de poules</span>
                <strong>{data.summary.pool_matches ?? 0}</strong>
              </article>
              <article>
                <span>Tableau final</span>
                <strong>{data.summary.knockout_matches ?? 0}</strong>
              </article>
              <article>
                <span>Joueurs suivis</span>
                <strong>{data.summary.tracked_players ?? 0}</strong>
              </article>
              <article>
                <span>Duos suivis</span>
                <strong>{data.summary.tracked_duos ?? 0}</strong>
              </article>
              <article>
                <span>Résultats complets</span>
                <strong>{data.summary.complete_results ?? 0}</strong>
              </article>
            </section>

            {data.status === "WAITING_DATA" && (
              <div className="competition-notice">
                Les lignes {data.code} seront chargées automatiquement au
                prochain passage de l’installateur avec le classeur qui les
                contient.
              </div>
            )}

            {!!data.bracket?.length && (
              <section className="hub-panel tournament-visual-panel bracket-panel">
                <div className="tournament-panel-heading">
                  <div>
                    <span>ÉLIMINATION DIRECTE</span>
                    <h2>Le chemin vers la finale</h2>
                  </div>
                  <p>Le vainqueur de chaque rencontre est surligné.</p>
                </div>
                <div className="bracket-scroll">
                  <div
                    className="bracket-grid"
                    style={{
                      gridTemplateColumns: `repeat(${data.bracket.length}, minmax(235px, 1fr))`,
                    }}
                  >
                    {data.bracket.map((round) => (
                      <section className="bracket-round" key={round.code}>
                        <h3>{round.name}</h3>
                        <div className="bracket-round-matches">
                          {round.matches.map((match) => (
                            <MatchCard match={match} key={match.id} />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
                <p className="bracket-coverage">
                  Tableau reconstruit à partir des résultats officiels
                  disponibles dans le tournoi Nakka.
                </p>
              </section>
            )}

            {!!data.round_robin?.length && (
              <section className="hub-panel tournament-visual-panel round-robin-panel">
                <div className="tournament-panel-heading">
                  <div>
                    <span>PHASE DE POULES</span>
                    <h2>Tableaux Round Robin</h2>
                  </div>
                  <p>Une matrice complète par poule, quel que soit le format.</p>
                </div>
                <div className="round-robin-groups">
                  {data.round_robin.map((group) => (
                    <RoundRobinTable group={group} key={group.code} />
                  ))}
                </div>
              </section>
            )}

            {!data.round_robin?.length && !!data.pools?.length && (
              <div className="competition-notice danger">
                Les poules ont été détectées, mais leur tableau Round Robin ne peut pas encore être reconstruit.
              </div>
            )}

            <div className="tournament-statistics-stack">
              <section className="hub-panel">
                <span className="competition-eyebrow">PERFORMANCES INDIVIDUELLES</span>
                <h2>Statistiques des joueurs</h2>
                <ParticipantTable
                  participants={data.players}
                  aliases={data.display_aliases}
                  emptyMessage="Aucune statistique joueur n’est disponible pour ce tournoi."
                />
              </section>
              <section className="hub-panel">
                <span className="competition-eyebrow">ASSOCIATIONS</span>
                <h2>Statistiques des duos</h2>
                <ParticipantTable
                  participants={data.duos}
                  aliases={data.display_aliases}
                  duo
                  emptyMessage="Les données Duos ne sont pas disponibles pour ce tournoi."
                />
              </section>
            </div>

            {!!data.data_quality_notes.length && (
              <div className="competition-notice">
                {data.data_quality_notes.join(" · ")}
              </div>
            )}

            <section className="hub-panel">
              <h2>Détail complet des matchs</h2>
              {data.matches.length ? (
                <div className="hub-table-scroll">
                  <table className="hub-table">
                    <thead>
                      <tr>
                        <th>Match</th>
                        <th>Rencontre</th>
                        <th>Mode</th>
                        <th>Score</th>
                        <th>Vainqueur</th>
                        <th>Legs</th>
                        <th>Qualité</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.matches.map((match) => (
                        <tr key={match.id}>
                          <td>{match.match_number ?? "—"}</td>
                          <td>{match.home} vs {match.away}</td>
                          <td>{match.mode || "—"}</td>
                          <td>
                            <strong>
                              {match.home_score} – {match.away_score}
                            </strong>
                          </td>
                          <td>{match.winner ?? "Égalité"}</td>
                          <td>{match.legs}</td>
                          <td>
                            {match.result_complete
                              ? "Complet"
                              : `${match.unresolved_legs} leg(s) à vérifier`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="hub-empty">
                  Aucun match trouvé pour ce tournoi.
                </p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
