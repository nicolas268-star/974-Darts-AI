import Link from "next/link";
import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import type {
  MatchHubPayload,
  MatchHubSingle,
} from "@/lib/types/sprint11";
import "../match-hub.css";

const backend = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";

async function getMatchHub(resultId: string): Promise<MatchHubPayload | null> {
  try {
    const response = await fetch(`${backend}/api/v1/match-hub/${resultId}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
}

function number(value: number | null | undefined, digits = 2) {
  if (value == null) return "—";
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function dateLabel(value: string | null) {
  if (!value) return "Date non renseignée";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function playersLabel(players: Array<{ name: string }>) {
  return players.map((player) => player.name).join(" / ") || "—";
}

function analysisSentence(data: MatchHubPayload) {
  const top = data.highlights.top_player;
  const remaining = data.summary.average_opponent_remaining;
  const bestLeg = data.summary.best_leg;

  return [
    `${data.summary.legs_analysed} legs ont été analysés sur ${data.summary.matches} matchs.`,
    data.summary.finish_coverage
      ? `Un finish est renseigné sur ${number(data.summary.finish_coverage, 1)} % des legs.`
      : "Aucun finish exploitable n’est renseigné.",
    top
      ? `${top.name} ressort avec ${top.matches_won} match(s) gagné(s) et ${top.legs_won} leg(s) gagné(s).`
      : "Aucun classement individuel fiable n’est disponible.",
    bestLeg
      ? `Le meilleur leg enregistré est terminé en ${bestLeg} fléchettes.`
      : "Le nombre de fléchettes du meilleur leg n’est pas disponible.",
    remaining != null
      ? `Le restant adverse moyen lors des finishes est de ${number(remaining)} points.`
      : "Le restant adverse ne peut pas être calculé sur cette rencontre.",
  ];
}

function PlayerName({ player }: { player: MatchHubSingle }) {
  return (
    <Link href={`/players/${player.player_id}`} className="hub-player-link">
      {player.name}
    </Link>
  );
}

export default async function MatchHubPage({
  params,
}: {
  params: Promise<{ result_id: string }>;
}) {
  const { result_id } = await params;
  const data = await getMatchHub(result_id);

  if (!data) notFound();

  const result = data.result;
  const backTeamId = result.home_team_id;
  const maxPressure = Math.max(
    1,
    ...data.finish_pressure.map((bucket) => bucket.count),
  );

  return (
    <div className="dashboard match-hub-shell">
      <Sidebar />

      <main className="main match-hub-main">
        <div className="hub-topline">
          <Link href={`/teams/${backTeamId}`}>← Retour à l’équipe</Link>
          <span>
            {result.round_code} · {dateLabel(result.played_on)}
          </span>
        </div>

        <header className="match-hub-hero">
          <div className="hub-team home">
            <span>Domicile</span>
            <strong>{result.home_team_name}</strong>
            <small>
              Moyenne {number(data.summary.home_average_3_darts)}
            </small>
          </div>

          <div className="hub-score">
            <span>Score officiel</span>
            <strong>
              {result.home_score}–{result.away_score}
            </strong>
            <small>Saison {data.season?.name ?? "—"}</small>
          </div>

          <div className="hub-team away">
            <span>Extérieur</span>
            <strong>{result.away_team_name}</strong>
            <small>
              Moyenne {number(data.summary.away_average_3_darts)}
            </small>
          </div>
        </header>

        {data.data_quality_notes.length ? (
          <section
            className={
              data.detail_available
                ? "hub-quality"
                : "hub-quality collective-only"
            }
          >
            <strong>
              {data.detail_available
                ? "Contrôle des données"
                : "Résultat collectif uniquement"}
            </strong>
            <span>{data.data_quality_notes.join(" ")}</span>
          </section>
        ) : null}

        {!data.detail_available ? (
          <section className="hub-empty-detail">
            <span>DONNÉES PROTÉGÉES</span>
            <h1>Aucun match individuel reconstitué</h1>
            <p>
              Le score officiel reste visible et compte dans le classement.
              Les simples, doubles, legs et statistiques joueurs restent vides
              tant que la feuille PvP correcte n’est pas disponible.
            </p>
            <Link href={`/teams/${backTeamId}`}>Voir les autres rencontres</Link>
          </section>
        ) : (
          <>
            <nav className="hub-nav" aria-label="Sections de l’analyse">
              <a href="#resume">Résumé</a>
              <a href="#simples">Simples</a>
              <a href="#doubles">Doubles</a>
              <a href="#legs">Détail des legs</a>
            </nav>

            <section className="hub-kpis" id="resume">
              <article>
                <span>Matchs analysés</span>
                <strong>{data.summary.matches}</strong>
                <small>
                  {data.summary.singles} simples · {data.summary.doubles} doubles
                </small>
              </article>
              <article>
                <span>Legs analysés</span>
                <strong>{data.summary.legs_analysed}</strong>
                <small>{data.summary.finishes_recorded} finishes renseignés</small>
              </article>
              <article>
                <span>Couverture finish</span>
                <strong>{number(data.summary.finish_coverage, 1)} %</strong>
                <small>Données réellement disponibles</small>
              </article>
              <article>
                <span>Meilleur leg</span>
                <strong>
                  {data.summary.best_leg
                    ? `${data.summary.best_leg} fl.`
                    : "—"}
                </strong>
                <small>Moy. finish {number(data.summary.average_finish)}</small>
              </article>
              <article>
                <span>No score</span>
                <strong>{data.summary.no_score}</strong>
                <small>Sur l’ensemble de la soirée</small>
              </article>
            </section>

            <section className="hub-overview-grid">
              <article className="hub-panel">
                <div className="hub-section-title">
                  <span>ANALYSE AUTOMATIQUE</span>
                  <h2>Résumé de la soirée</h2>
                </div>
                <div className="hub-analysis-copy">
                  {analysisSentence(data).map((sentence) => (
                    <p key={sentence}>{sentence}</p>
                  ))}
                </div>
              </article>

              <article className="hub-panel">
                <div className="hub-section-title">
                  <span>PRESSION AU FINISH</span>
                  <h2>Restant adverse</h2>
                </div>
                <div className="hub-pressure">
                  {data.finish_pressure.map((bucket) => (
                    <div key={bucket.label}>
                      <span>{bucket.label}</span>
                      <div>
                        <i
                          style={{
                            width: `${Math.round(
                              (bucket.count / maxPressure) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                      <strong>{bucket.count}</strong>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <section className="hub-panel hub-table-panel" id="simples">
              <div className="hub-section-title">
                <span>LES SIMPLES</span>
                <h2>Performance des joueurs</h2>
              </div>
              <div className="hub-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Joueur</th>
                      <th>MJ</th>
                      <th>Gagnés</th>
                      <th>% matchs</th>
                      <th>Legs</th>
                      <th>% legs</th>
                      <th>Moyenne</th>
                      <th>First 9</th>
                      <th>Best leg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.singles.map((player) => (
                      <tr key={player.player_id}>
                        <td><PlayerName player={player} /></td>
                        <td>{player.matches_played}</td>
                        <td>{player.matches_won}</td>
                        <td>{number(player.match_win_rate, 1)} %</td>
                        <td>{player.legs_won}/{player.legs_played}</td>
                        <td>{number(player.leg_win_rate, 1)} %</td>
                        <td>{number(player.average_3_darts)}</td>
                        <td>{number(player.first_9)}</td>
                        <td>{player.best_leg ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="hub-panel hub-table-panel" id="doubles">
              <div className="hub-section-title">
                <span>LES DOUBLES</span>
                <h2>Legs de double</h2>
              </div>
              <div className="hub-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Match</th>
                      <th>Duo gagnant</th>
                      <th>Duo perdant</th>
                      <th>Leg</th>
                      <th>Finisseur</th>
                      <th>Finish</th>
                      <th>Restant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.doubles.map((leg) => (
                      <tr key={leg.leg_id}>
                        <td>{leg.match_number ?? "—"}</td>
                        <td>{leg.winning_duo}</td>
                        <td>{leg.losing_duo}</td>
                        <td>{leg.leg_number ?? "—"}</td>
                        <td>{leg.finisher_name}</td>
                        <td>{leg.finish ?? "—"}</td>
                        <td>{leg.opponent_remaining ?? "—"}</td>
                      </tr>
                    ))}
                    {!data.doubles.length ? (
                      <tr>
                        <td colSpan={7}>Aucun double renseigné.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="hub-panel hub-table-panel" id="legs">
              <div className="hub-section-title">
                <span>DÉTAIL COMPLET</span>
                <h2>Tous les legs de la soirée</h2>
              </div>
              <div className="hub-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Match</th>
                      <th>Type</th>
                      <th>Leg</th>
                      <th>Équipe gagnante</th>
                      <th>Finisseur</th>
                      <th>Adversaire</th>
                      <th>Finish</th>
                      <th>Fléchettes</th>
                      <th>No score</th>
                      <th>Restant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.legs.map((leg) => (
                      <tr key={leg.leg_id}>
                        <td>{leg.match_number ?? "—"}</td>
                        <td>{leg.mode === "SIMPLE" ? "Simple" : "Double"}</td>
                        <td>{leg.leg_number ?? "—"}</td>
                        <td>{leg.winner_team_name}</td>
                        <td>{leg.finisher_name}</td>
                        <td>{leg.opponent_names ?? "—"}</td>
                        <td>{leg.finish ?? "—"}</td>
                        <td>{leg.darts ?? "—"}</td>
                        <td>{leg.no_score}</td>
                        <td>{leg.opponent_remaining ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
