import { scoring120139Description } from "@/lib/player/scoring-ranges";
import { tournamentBrackets, tournamentMetric } from "@/lib/tournament-presentation";
import { StatsTable } from "@/components/stats/StatsTable";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import type {
  TournamentHub,
  TournamentMatch,
  TournamentParticipant,
  TournamentRoundRobinGroup,
  TournamentStage,
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
    ? "Non disponible"
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
        <span>
          {match.home}
          {match.home_average_3_darts != null && (
            <small>Moy. {decimal(match.home_average_3_darts)}</small>
          )}
        </span>
        <strong>{match.home_score}</strong>
      </div>
      <div className={match.winner === match.away ? "winner" : ""}>
        <span>
          {match.away}
          {match.away_average_3_darts != null && (
            <small>Moy. {decimal(match.away_average_3_darts)}</small>
          )}
        </span>
        <strong>{match.away_score}</strong>
      </div>
      {!match.result_complete && (
        <small>{match.unresolved_legs} leg(s) à vérifier</small>
      )}
    </article>
  );
}

function BracketPanel({
  stages,
  eyebrow,
  title,
  description,
}: {
  stages: TournamentStage[];
  eyebrow: string;
  title: string;
  description: string;
}) {
  if (!stages.length) return null;
  return (
    <section className="hub-panel tournament-visual-panel bracket-panel">
      <div className="tournament-panel-heading">
        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <p>{description}</p>
      </div>
      <div className="bracket-scroll" tabIndex={0} role="region" aria-label={`${title}, défilement horizontal`}>
        <div
          className="bracket-grid"
          style={{
            gridTemplateColumns: `repeat(${stages.length}, minmax(235px, 1fr))`,
          }}
        >
          {stages.map((round) => (
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
        Rencontres et scores disponibles dans la source Nakka du tournoi.
      </p>
    </section>
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
      <StatsTable className="hub-table">
        <thead>
          <tr>
            <th>{duo ? "Duo" : "Joueur"}</th>
            <th>{duo ? "Joueurs suivis" : "Équipe / duo"}</th>
            <th>Matchs V/J</th>
            <th>Victoires</th>
            <th>Legs G/J</th>
            <th>Moy. 3 fl.</th>
            <th>First 9</th>
            <th>Meilleur leg</th>
            <th>Finish</th>
            <th>100+</th>
            <th>120–139</th>
            <th>140+</th>
            <th>170+</th>
            <th>180</th>
          </tr>
        </thead>
        <tbody>
          {participants.map((participant) => (
            <tr key={participant.name}>
              <td><strong>{participant.canonical_player_id ? <Link href={`/players/${encodeURIComponent(participant.canonical_player_id)}`}>{aliases[participant.name] ?? participant.name}</Link> : aliases[participant.name] ?? participant.name}</strong></td>
              <td>
                {duo
                  ? participant.players?.join(" / ") || "—"
                  : participant.team || "—"}
              </td>
              <td>
                {participant.matches_won == null || participant.matches_played == null ? "Non disponible" : `${participant.matches_won}/${participant.matches_played}`}
              </td>
              <td>
                {participant.win_rate == null
                  ? "Non disponible"
                  : `${decimal(participant.win_rate)} %`}
              </td>
              <td>
                {participant.legs_won}/{participant.legs_played}
              </td>
              <td>{decimal(participant.average_3_darts)}</td>
              <td>{decimal(participant.first_9)}</td>
              <td>{tournamentMetric(participant.best_leg)}</td>
              <td>{tournamentMetric(participant.best_finish)}</td>
              <td>{tournamentMetric(participant.scores_100)}</td>
              <td><span title={scoring120139Description(participant)}>{tournamentMetric(participant.scores_120_139)}</span></td>
              <td>{tournamentMetric(participant.scores_140)}</td>
              <td>{tournamentMetric(participant.scores_170)}</td>
              <td>{tournamentMetric(participant.scores_180)}</td>
            </tr>
          ))}
        </tbody>
      </StatsTable>
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

      <p className="table-scroll-hint">Faites glisser le tableau horizontalement pour consulter toutes les confrontations.</p><div className="round-robin-scroll" tabIndex={0} role="region" aria-label={`Tableau de poule ${group.name}, défilement horizontal`}>
        <StatsTable className="round-robin-table" mobileSummaryColumns={[group.matrix.length + 8, group.matrix.length + 9, group.matrix.length + 2, group.matrix.length + 3]}>
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
              <th>Legs G/P</th>
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
                  <td>{tournamentMetric(standing?.played)}</td>
                  <td>{tournamentMetric(standing?.wins)}</td>
                  <td>{tournamentMetric(standing?.draws)}</td>
                  <td>{tournamentMetric(standing?.losses)}</td>
                  <td>{standing ? `${standing.legs_for}/${standing.legs_against}` : "Non disponible"}</td>
                  <td className={standing && standing.leg_difference >= 0 ? "rr-positive" : "rr-negative"}>
                    {standing && standing.leg_difference > 0 ? "+" : ""}
                    {tournamentMetric(standing?.leg_difference)}
                  </td>
                  <td><strong>{tournamentMetric(standing?.points)}</strong></td>
                  <td>
                    <span className={`rr-final-rank rank-${standing?.rank ?? 0}`}>
                      {tournamentMetric(standing?.rank)}
                    </span>
                    {standing?.qualified === true && <small className="rr-qualified">Qualifié</small>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </StatsTable>
      </div>
      <footer className="round-robin-legend">
        <span><i className="rr-legend-win" /> Victoire</span>
        <span><i className="rr-legend-loss" /> Défaite</span>
        <span>{group.points_available === false
          ? "Classement selon les critères Nakka · aucun barème de points activé"
          : <>Barème : {tournamentMetric(group.win_points)} pts / victoire · {tournamentMetric(group.draw_points)} / nul · {tournamentMetric(group.loss_points)} / défaite{group.include_leg_points ? " + points de legs" : ""}</>}</span>
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
  const best180 = data?.players.filter((player) => player.scores_180 != null)
    .sort((a, b) => (b.scores_180 ?? 0) - (a.scores_180 ?? 0))[0];
  const total180 = data?.players.length && data.players.every((player) => player.scores_180 != null)
    ? data.players.reduce((total, player) => total + (player.scores_180 ?? 0), 0) : null;
  const leaders180 = best180 && (best180.scores_180 ?? 0) > 0
    ? data?.players.filter((player) => player.scores_180 === best180.scores_180) ?? [] : [];
  const brackets = tournamentBrackets(data ?? { bracket: [] });
  const official = data?.classification !== "FRIENDLY" && data?.ranking_status === "PUBLISHED";
  const standings = official ? data?.official_results ?? [] : data?.final_standings ?? [];
  const sourceUrl = data?.source_url ?? data?.matches.find((match) => match.source_url)?.source_url;

  return (
    <div className="dashboard">
      <Sidebar />
      <main className="stats-responsive main competition-page tournament-theme">
        <Link href={data?.affects_committee_ranking ? "/competitions" : "/tournaments"} className="hub-back">
          ← Retour {data?.affects_committee_ranking ? "aux compétitions Comité" : "aux tournois amicaux"}
        </Link>

        {!data ? (
          <div className="competition-notice danger">
            Ce tournoi est momentanément indisponible. Veuillez réessayer dans
            quelques instants.
          </div>
        ) : (
          <>
            <header className="competition-hero">
              <div>
                <span className="competition-eyebrow">
                  {data.code.length <= 8 ? data.code : data.classification_label} · {data.event_name}
                </span>
                <h1>{data.name}</h1>
                <p>{[data.date_label ?? data.date, data.location ?? data.lieu, data.organizer, data.season].filter(Boolean).join(" · ")}</p>
                <p>
                  {data.format_label ?? "Format non disponible"} · {data.classification_label}
                </p>
                  {data.competition_type && <p>{data.competition_type}</p>}
                {official && data.official_publication?.number != null && <p>Publication officielle · version {data.official_publication.number}</p>}
                <div className="tournament-source-links">
                  {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer">Consulter la source Nakka ↗</a>}
                  {official && <Link href="/competitions/classement-individuel">Classement du Comité →</Link>}
                </div>
              </div>
              <span className="hub-status">
                {data.status === "AVAILABLE"
                  ? "Données disponibles"
                  : "En attente de données"}
              </span>
            </header>

            <div className="competition-notice">
              {data.affects_committee_ranking
                ? "Compétition officielle : les points affichés proviennent de la publication du classement individuel du Comité."
                : "Tournoi amical : aucun résultat affiché ici ne modifie le classement individuel, le championnat interclubs ou l’ELO."}
            </div>

            {(data.editorial_summary || data.winner || data.runner_up) && (
              <section className="hub-panel tournament-story-panel">
                <div className="tournament-story-heading">
                  <div>
                    <span className="competition-eyebrow">RÉSUMÉ DU TOURNOI</span>
                    <h2>{data.event_name}</h2>
                  </div>
                  <div className="tournament-podium">
                    {data.winner && <span>🏆 <strong>{displayName(data, data.winner)}</strong></span>}
                    {data.runner_up && <span>🥈 {displayName(data, data.runner_up)}</span>}
                  </div>
                </div>
                {data.editorial_summary && <p>{data.editorial_summary}</p>}
              </section>
            )}

            {!!data.players.length && (
              <section className="hub-panel tournament-highlights-panel">
                <div className="tournament-panel-heading">
                  <div>
                    <span>PERFORMANCES DU TOURNOI</span>
                    <h2>Les distinctions du tournoi</h2>
                  </div>
                  <p>Calculées à partir des statistiques validées du tournoi.</p>
                </div>
                <div className="tournament-highlights-grid">
                  <article><span>🎯 Meilleure moyenne</span><strong>{bestAverage ? displayName(data, bestAverage.name) : "Non disponible"}</strong><b>{decimal(bestAverage?.average_3_darts)}</b></article>
                  <article><span>⚡ Meilleur First 9</span><strong>{bestFirst9 ? displayName(data, bestFirst9.name) : "Non disponible"}</strong><b>{decimal(bestFirst9?.first_9)}</b></article>
                  <article><span>🔥 Plus haute sortie</span><strong>{bestFinish ? displayName(data, bestFinish.name) : "Non disponible"}</strong><b>{tournamentMetric(bestFinish?.best_finish)}</b></article>
                  <article><span>💥 Plus grand nombre de 180</span><strong>{leaders180.length ? leaders180.map((player) => displayName(data, player.name)).join(" · ") : total180 === 0 ? "Aucun 180 enregistré" : "Non disponible"}</strong><b>{tournamentMetric(leaders180.length || total180 === 0 ? best180?.scores_180 : null)}</b>{total180 != null && <small>{total180} au total</small>}</article>
                </div>
              </section>
            )}

            <section className="hub-kpis">
              <article><span>{data.duos.length && !data.players.length ? "Doublettes" : "Participants"}</span><strong>{data.summary.players ?? (data.duos.length && !data.players.length ? data.summary.tracked_duos : data.summary.tracked_players) ?? "Non disponible"}</strong></article>
              <article><span>Rencontres</span><strong>{tournamentMetric(data.summary.matches)}</strong></article>
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
                Les résultats de ce tournoi seront affichés après validation de leur import.
              </div>
            )}

            <BracketPanel
              stages={brackets.primary}
              eyebrow={brackets.doubleElimination ? "WINNER BRACKET · DOUBLE ÉLIMINATION" : "TABLEAU PRINCIPAL · ÉLIMINATION DIRECTE"}
              title="Le chemin vers la finale"
              description="Le vainqueur de chaque rencontre est surligné."
            />

            <BracketPanel
              stages={brackets.loser}
              eyebrow="LOSER BRACKET · DOUBLE ÉLIMINATION"
              title="Le parcours en double élimination"
              description="Le tableau des joueurs ayant subi une première défaite."
            />

            <BracketPanel stages={brackets.secondary} eyebrow="TABLEAU SECONDAIRE" title="La consolante" description="Un parcours distinct du tableau principal." />
            <BracketPanel stages={brackets.finals} eyebrow="FINALE DÉCISIVE · DOUBLE ÉLIMINATION" title="Grande finale" description="Le reset de finale est affiché lorsqu’il figure dans la source." />
            <BracketPanel stages={brackets.thirdPlace} eyebrow="MATCH DE CLASSEMENT" title="La troisième place" description="Rencontre de classement confirmée par la source." />

            {!!standings?.length && (
              <section className="hub-panel tournament-results-panel">
                <div className="tournament-panel-heading"><div><span>RÉSULTATS ET PALMARÈS</span><h2>Classement final</h2></div><p>{official ? "Points issus de la publication officielle." : "Places confirmées dans le tableau principal."}</p></div>
                <div className="hub-table-scroll"><StatsTable className="hub-table"><thead><tr><th>Rang</th><th>Joueur</th><th>Résultat</th>{official && <th>Points Comité</th>}</tr></thead><tbody>
                  {standings.map((standing, index) => <tr key={standing.source_ref ?? `${standing.name}-${index}`}><td>{tournamentMetric(standing.rank)}</td><td><strong>{standing.canonical_player_id ? <Link href={`/players/${encodeURIComponent(standing.canonical_player_id)}`}>{displayName(data, standing.name)}</Link> : displayName(data, standing.name)}</strong></td><td>{({ WINNER: "Vainqueur", RUNNER_UP: "Finaliste", SEMI_FINALIST: "Demi-finaliste", QUARTER_FINALIST: "Quart de finaliste", ROUND_OF_16: "Huitième de finaliste", OUTSIDE_POINTS: "Hors points" } as Record<string, string>)[standing.placement ?? ""] ?? standing.placement ?? "Non disponible"}</td>{official && <td>{tournamentMetric(standing.points)}</td>}</tr>)}
                </tbody></StatsTable></div>
                {official && <Link href="/competitions/classement-individuel">Consulter le classement officiel du Comité →</Link>}
              </section>
            )}

            {!!data.round_robin?.length && (
              <details className="hub-panel tournament-disclosure" suppressHydrationWarning>
                <summary>
                  <span><b>Phase de poules</b><small>{data.round_robin.length} poule{data.round_robin.length > 1 ? "s" : ""} · matrices et classements</small></span>
                  <strong>Consulter</strong>
                </summary>
                <div className="tournament-disclosure-content tournament-visual-panel round-robin-panel">
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
                </div>
              </details>
            )}

            {!data.round_robin?.length && !!data.pools?.length && (
              <div className="competition-notice danger">
                Les poules ont été détectées, mais leur tableau Round Robin ne peut pas encore être reconstruit.
              </div>
            )}

            <details className="hub-panel tournament-disclosure" suppressHydrationWarning>
              <summary>
                <span><b>Statistiques complètes</b><small>Joueurs et duos · mesures issues des matchs validés</small></span>
                <strong>Consulter</strong>
              </summary>
              <div className="tournament-disclosure-content tournament-statistics-stack">
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
            </details>

            {!!data.data_quality_notes.length && (
              <div className="competition-notice">
                {data.data_quality_notes.join(" · ")}
              </div>
            )}

            <details className="hub-panel tournament-disclosure" suppressHydrationWarning>
              <summary>
                <span><b>Détail complet des matchs</b><small>{data.matches.length} rencontre{data.matches.length > 1 ? "s" : ""} · scores, legs et qualité</small></span>
                <strong>Consulter</strong>
              </summary>
              <div className="tournament-disclosure-content">
              {data.matches.length ? (
                <div className="hub-table-scroll">
                  <StatsTable className="hub-table">
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
                          <td>{match.winner ?? (match.result_complete && match.home_score === match.away_score ? "Égalité" : "Non confirmé")}</td>
                          <td>{match.legs}</td>
                          <td>
                            {match.result_complete
                              ? "Complet"
                              : `${match.unresolved_legs} leg(s) à vérifier`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </StatsTable>
                </div>
              ) : (
                <p className="hub-empty">
                  Aucun match trouvé pour ce tournoi.
                </p>
              )}
              </div>
            </details>
          </>
        )}
      </main>
    </div>
  );
}
