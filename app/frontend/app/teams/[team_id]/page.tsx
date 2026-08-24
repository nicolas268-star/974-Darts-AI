import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { sameTeam } from "@/lib/team-identity";
import { getTeamTheme } from "@/lib/team-themes";
import type { RankingPayload, PlayerOverview } from "@/lib/types/sprint4";
import type {
  TeamMatchHistory,
  TeamMatchHistoryRow,
} from "@/lib/types/sprint11";
import "../teams.css";

const backend = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";

async function getRanking(): Promise<RankingPayload | null> {
  try {
    const response = await fetch(`${backend}/api/v1/ranking`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
}

async function getPlayers(): Promise<PlayerOverview[]> {
  try {
    const response = await fetch(`${backend}/api/v1/players`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload?.players) ? payload.players : [];
  } catch {
    return [];
  }
}

async function getTeamHistory(
  teamId: string,
): Promise<TeamMatchHistory | null> {
  try {
    const response = await fetch(`${backend}/api/v1/teams/${teamId}/matches`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
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
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

const outcomes: Record<
  TeamMatchHistoryRow["outcome"],
  { label: string; className: string }
> = {
  WIN: { label: "Victoire", className: "win" },
  DRAW: { label: "Nul", className: "draw" },
  LOSS: { label: "Défaite", className: "loss" },
};

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ team_id: string }>;
}) {
  const { team_id } = await params;
  const [ranking, players, history] = await Promise.all([
    getRanking(),
    getPlayers(),
    getTeamHistory(team_id),
  ]);
  const team = ranking?.standings.find((item) => item.team_id === team_id);

  if (!team) notFound();

  const theme = getTeamTheme(team.name);

  const roster = players
    .filter((player) => sameTeam(player.team, team.name))
    .sort((a, b) => (b.average_3_darts ?? 0) - (a.average_3_darts ?? 0));

  const average = roster.length
    ? roster
        .map((player) => player.average_3_darts)
        .filter((value): value is number => value != null)
        .reduce((sum, value, _, values) => sum + value / values.length, 0)
    : null;

  return (
    <div className="dashboard teams-shell">
      <Sidebar />

      <main className={`main teams-main team-theme team-theme-${theme.key}`}>
        <Link href="/teams" className="teams-back">
          ← Retour aux équipes
        </Link>

        <header className="team-detail-hero">
          {theme.banner ? (
            <Image
              className="team-hero-background"
              src={theme.banner}
              alt=""
              fill
              priority
              sizes="(max-width: 760px) 100vw, calc(100vw - 240px)"
            />
          ) : null}
          <div className="team-avatar" aria-hidden="true">
            {theme.logo ? (
              <Image
                className="team-avatar-logo"
                src={theme.logo}
                alt=""
                width={176}
                height={176}
                priority
              />
            ) : (
              team.name.slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="team-hero-copy">
            <span>
              {theme.label} · SAISON {ranking?.season?.name ?? "—"}
            </span>
            <h1>{team.name}</h1>
            <p>
              Classement #{team.rank} · {team.points} points
            </p>
          </div>
          <aside>
            <span>Différence de sets</span>
            <strong>
              {team.set_difference > 0
                ? `+${team.set_difference}`
                : team.set_difference}
            </strong>
          </aside>
        </header>

        <section className="team-detail-kpis">
          <article>
            <span>Matchs joués</span>
            <strong>{team.played}</strong>
          </article>
          <article>
            <span>Victoires</span>
            <strong>{team.wins}</strong>
          </article>
          <article>
            <span>Nuls</span>
            <strong>{team.draws}</strong>
          </article>
          <article>
            <span>Défaites</span>
            <strong>{team.losses}</strong>
          </article>
          <article>
            <span>Sets gagnés</span>
            <strong>{team.sets_won}</strong>
          </article>
          <article>
            <span>Sets perdus</span>
            <strong>{team.sets_lost}</strong>
          </article>
          <article>
            <span>Effectif</span>
            <strong>{roster.length}</strong>
          </article>
          <article>
            <span>Moyenne équipe</span>
            <strong>{number(average)}</strong>
          </article>
        </section>

        {team.collective_only_encounters > 0 ? (
          <section className="team-quality">
            <strong>
              Couverture PvP : {team.detailed_encounters}/{team.played}{" "}
              rencontres
            </strong>
            <span>
              Le classement collectif inclut J1 Kazadarts A–Kazadarts B, mais
              ses matchs individuels ne sont pas ajoutés aux statistiques
              joueurs.
            </span>
          </section>
        ) : null}

        <section className="team-matches">
          <div className="team-detail-heading">
            <div>
              <span>CALENDRIER & RÉSULTATS</span>
              <h2>Les soirées de {team.name}</h2>
            </div>
            <small>
              {history
                ? `${history.summary.detailed}/${history.summary.played} avec détail PvP`
                : "Historique indisponible"}
            </small>
          </div>

          {history?.matches.length ? (
            <div className="team-match-list">
              {history.matches.map((match) => {
                const outcome = outcomes[match.outcome];

                return (
                  <Link
                    href={`/matches/${match.result_id}`}
                    className="team-match-row"
                    key={match.result_id}
                  >
                    <div className="team-match-round">
                      <strong>{match.round_code}</strong>
                      <small>{dateLabel(match.played_on)}</small>
                    </div>

                    <div className="team-match-opponent">
                      <span>
                        {match.venue === "HOME" ? "Domicile" : "Extérieur"}
                      </span>
                      <strong>{match.opponent_name}</strong>
                    </div>

                    <strong className="team-match-score">
                      {match.score_for}–{match.score_against}
                    </strong>

                    <span className={`team-match-outcome ${outcome.className}`}>
                      {outcome.label}
                    </span>

                    <span
                      className={
                        match.detail_available
                          ? "team-match-coverage"
                          : "team-match-coverage warning"
                      }
                    >
                      {match.detail_available
                        ? "PvP complet"
                        : "Collectif uniquement"}
                    </span>

                    <span className="team-match-cta">
                      {match.detail_available ? "Analyser" : "Voir le résultat"}{" "}
                      →
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="teams-muted">
              Aucun résultat collectif publié pour cette équipe.
            </p>
          )}
        </section>

        <section className="team-detail-grid">
          <article className="team-detail-panel team-detail-panel-wide">
            <div className="team-detail-heading">
              <div>
                <span>EFFECTIF</span>
                <h2>Joueurs de l’équipe</h2>
              </div>
              <small>{roster.length} joueur(s)</small>
            </div>

            <div className="team-roster">
              {roster.map((player) => (
                <Link
                  href={`/players/${player.player_id}`}
                  key={player.player_id}
                >
                  <div className="team-player-avatar">
                    {player.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <strong>{player.name}</strong>
                    <small>
                      {player.legs_won ?? 0}/{player.legs_played ?? 0} legs
                      gagnés/joués
                    </small>
                  </div>
                  <div className="team-player-metrics">
                    <span>Moy. {number(player.average_3_darts)}</span>
                    <span>First 9 {number(player.first_9)}</span>
                    <span>180 × {player.scores_180 ?? 0}</span>
                  </div>
                </Link>
              ))}

              {!roster.length ? (
                <p className="teams-muted">
                  Aucun joueur rattaché à cette équipe.
                </p>
              ) : null}
            </div>
          </article>

          <article className="team-detail-panel">
            <div className="team-detail-heading">
              <div>
                <span>BILAN</span>
                <h2>Lecture de la saison</h2>
              </div>
            </div>
            <p className="team-summary">
              {team.name} occupe la place #{team.rank} avec {team.points}{" "}
              points. L’équipe compte {team.wins} victoire(s), {team.draws}{" "}
              nul(s) et
              {team.losses} défaite(s), pour une différence de sets de{" "}
              {team.set_difference > 0
                ? `+${team.set_difference}`
                : team.set_difference}
              .
            </p>
          </article>

          <article className="team-detail-panel">
            <div className="team-detail-heading">
              <div>
                <span>RÈGLES</span>
                <h2>Barème appliqué</h2>
              </div>
            </div>
            <div className="team-rules">
              <div>
                <span>Victoire</span>
                <strong>{ranking?.rules.win_points ?? "—"} pts</strong>
              </div>
              <div>
                <span>Nul</span>
                <strong>{ranking?.rules.draw_points ?? "—"} pts</strong>
              </div>
              <div>
                <span>Défaite</span>
                <strong>{ranking?.rules.loss_points ?? "—"} pt</strong>
              </div>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
