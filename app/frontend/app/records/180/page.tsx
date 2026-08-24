import Link from "next/link";
import { Award, Flame, Target, Trophy, Users } from "lucide-react";
import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import { canonicalTeamName } from "@/lib/team-identity";
import type { PlayerOverview, RankingPayload } from "@/lib/types/sprint4";
import { getTournamentRecords, normalizedPlayerName } from "@/lib/tournament-records";
import "./club-180.css";
import "./club-180-filters.css";
import "../competition-badges.css";

const backend = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";

export const metadata: Metadata = {
  title: "Club des 180 | 974 Darts AI",
  description: "Classement des scores de 180 réalisés en championnat et en tournoi.",
};

async function getPlayers(): Promise<PlayerOverview[]> {
  try {
    const response = await fetch(`${backend}/api/v1/players`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? (await response.json()).players ?? [] : [];
  } catch {
    return [];
  }
}

async function getRanking(): Promise<RankingPayload | null> {
  try {
    const response = await fetch(`${backend}/api/v1/ranking`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

const decimal = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function frequency(player: PlayerOverview) {
  if (!player.legs_played || player.scores_180 <= 0) return null;
  return player.legs_played / player.scores_180;
}

type Scope = "all" | "championship" | "tournament";

type PageProps = {
  searchParams?: Promise<{ scope?: string }>;
};

const scopeLabels: Record<Scope, string> = {
  all: "Toutes compétitions",
  championship: "Championnat",
  tournament: "Tournois",
};

export default async function Club180Page({ searchParams }: PageProps) {
  const requestedScope = (await searchParams)?.scope;
  const scope: Scope = requestedScope === "championship" || requestedScope === "tournament"
    ? requestedScope
    : "all";
  const [players, ranking, tournamentRecords] = await Promise.all([getPlayers(), getRanking(), getTournamentRecords()]);
  const officialPlayers = players
    .map((player) => ({ ...player, team: canonicalTeamName(player.team) }))
  const playerByName = new Map(officialPlayers.map((player) => [normalizedPlayerName(player.name), player]));
  const season = ranking?.season?.name ?? "2026";
  const sourceRows = [
    ...officialPlayers.map((player) => ({
      ...player,
      competition: `Championnat ${season}`,
      source_type: "championship" as const,
    })),
    ...tournamentRecords.flatMap((record) => {
      const player = playerByName.get(normalizedPlayerName(record.name));
      return player ? [{
        ...player,
        legs_played: record.legs_played,
        scores_180: record.scores_180,
        competition: record.competition,
        source_type: "tournament" as const,
      }] : [];
    }),
  ]
    .filter((player) => player.scores_180 > 0)
    .sort((left, right) => {
      const countDifference = right.scores_180 - left.scores_180;
      if (countDifference) return countDifference;
      const leftRate = left.legs_played ? left.scores_180 / left.legs_played : 0;
      const rightRate = right.legs_played ? right.scores_180 / right.legs_played : 0;
      return rightRate - leftRate || left.name.localeCompare(right.name, "fr");
    });

  const scorers = sourceRows.filter((player) => scope === "all" || player.source_type === scope);
  const total180 = scorers.reduce((total, player) => total + player.scores_180, 0);
  const allBreakdowns = sourceRows.reduce((totals, player) => {
    const current = totals.get(player.player_id) ?? { championship: 0, tournament: 0 };
    current[player.source_type] += player.scores_180;
    totals.set(player.player_id, current);
    return totals;
  }, new Map<string, { championship: number; tournament: number }>());
  const playerTotals = [...scorers.reduce((totals, player) => {
    const current = totals.get(player.player_id) ?? {
      ...player,
      scores_180: 0,
      legs_played: 0,
      championship180: allBreakdowns.get(player.player_id)?.championship ?? 0,
      tournament180: allBreakdowns.get(player.player_id)?.tournament ?? 0,
    };
    current.scores_180 += player.scores_180;
    current.legs_played = (current.legs_played ?? 0) + (player.legs_played ?? 0);
    totals.set(player.player_id, current);
    return totals;
  }, new Map<string, (typeof scorers)[number] & { championship180: number; tournament180: number }>()).values()]
    .sort((a, b) => {
      const countDifference = b.scores_180 - a.scores_180;
      if (countDifference) return countDifference;
      const leftRate = a.legs_played ? a.scores_180 / a.legs_played : 0;
      const rightRate = b.legs_played ? b.scores_180 / b.legs_played : 0;
      return rightRate - leftRate || a.name.localeCompare(b.name, "fr");
    });
  const teamTotals = [...playerTotals.reduce((teams, player) => {
    const team = player.team || "Équipe non renseignée";
    teams.set(team, (teams.get(team) ?? 0) + player.scores_180);
    return teams;
  }, new Map<string, number>())]
    .map(([team, total]) => ({ team, total }))
    .sort((left, right) => right.total - left.total || left.team.localeCompare(right.team, "fr"));
  const leader = playerTotals[0] ?? null;

  return (
    <div className="dashboard">
      <Sidebar />
      <main className="main club180-page">
        <section className="club180-hero">
          <div className="club180-target" aria-hidden="true">
            <Target size={42} />
            <span>180</span>
          </div>
          <div>
            <span className="eyebrow">Scoring maximum · Saison {season}</span>
            <h1>Le Club des 180</h1>
            <p>
              Tous les scores parfaits réalisés en championnat et dans les tournois
              amicaux, à partir des données individuelles Nakka validées.
            </p>
          </div>
          <div className="club180-live"><i /> Données officielles</div>
        </section>

        <section className="club180-kpis" aria-label="Résumé des scores de 180">
          <article className="card">
            <Target size={22} />
            <span>Total de 180</span>
            <strong>{total180}</strong>
            <small>{scopeLabels[scope]} · Saison {season}</small>
          </article>
          <article className="card">
            <Users size={22} />
            <span>Joueurs au club</span>
            <strong>{playerTotals.length}</strong>
            <small>Au moins un score de 180</small>
          </article>
          <article className="card">
            <Trophy size={22} />
            <span>Leader</span>
            <strong>{leader?.name ?? "—"}</strong>
            <small>{leader ? `${leader.scores_180} score${leader.scores_180 > 1 ? "s" : ""} de 180` : "Aucun 180 enregistré"}</small>
          </article>
          <article className="card">
            <Award size={22} />
            <span>Équipes représentées</span>
            <strong>{teamTotals.length}</strong>
            <small>{teamTotals[0] ? `${teamTotals[0].team} mène avec ${teamTotals[0].total}` : "—"}</small>
          </article>
        </section>

        <nav className="card club180-filters" aria-label="Filtrer le classement des 180">
          <div>
            <span className="eyebrow">Périmètre du classement</span>
            <strong>{scopeLabels[scope]}</strong>
          </div>
          <div className="club180-filter-actions">
            {(Object.keys(scopeLabels) as Scope[]).map((item) => (
              <Link
                className={item === scope ? "active" : ""}
                href={item === "all" ? "/records/180" : `/records/180?scope=${item}`}
                key={item}
              >
                {scopeLabels[item]}
              </Link>
            ))}
          </div>
        </nav>

        {playerTotals.length > 0 ? (
          <>
            <section className="card club180-podium">
              <div className="club180-section-heading">
                <div>
                  <span className="eyebrow">Podium</span>
                  <h2>Les meilleurs scoreurs</h2>
                </div>
                <Flame size={26} />
              </div>
              <div className="club180-podium-grid">
                {playerTotals.slice(0, 3).map((player, index) => {
                  const ratio = frequency(player);
                  return (
                    <Link
                      className={`club180-podium-card podium-${index + 1}`}
                      href={`/players/${player.player_id}`}
                      key={player.player_id}
                    >
                      <span className="club180-medal">#{index + 1}</span>
                      <div className="club180-avatar">{player.name.slice(0, 2).toUpperCase()}</div>
                      <strong>{player.name}</strong>
                      <small>{player.team || "Équipe non renseignée"}</small>
                      <b>{player.scores_180}</b>
                      <em>score{player.scores_180 > 1 ? "s" : ""} de 180</em>
                      <span className="club180-frequency">
                        {ratio ? `1 tous les ${decimal.format(ratio)} legs` : "Fréquence non disponible"}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>

            <section className="card club180-ranking">
              <div className="club180-section-heading">
                <div>
                  <span className="eyebrow">Classement complet</span>
                  <h2>Classement consolidé par joueur</h2>
                </div>
                <span className="club180-count">{playerTotals.length} joueur{playerTotals.length > 1 ? "s" : ""}</span>
              </div>
              <div className="table-scroll">
                <table className="table club180-table">
                  <thead>
                    <tr>
                      <th>Rang</th>
                      <th>Joueur</th>
                      <th>Équipe</th>
                      <th>Total 180</th>
                      <th>Championnat</th>
                      <th>Tournois</th>
                      <th>Legs joués</th>
                      <th>180 / 100 legs</th>
                      <th>Fréquence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerTotals.map((player, index) => {
                      const ratio = frequency(player);
                      const per100 = player.legs_played
                        ? (player.scores_180 * 100) / player.legs_played
                        : null;
                      return (
                        <tr key={player.player_id}>
                          <td><span className={`club180-rank rank-${Math.min(index + 1, 4)}`}>#{index + 1}</span></td>
                          <td>
                            <Link className="club180-player-link" href={`/players/${player.player_id}`}>
                              <strong>{player.name}</strong>
                              <span>Voir le profil →</span>
                            </Link>
                          </td>
                          <td>{player.team || "—"}</td>
                          <td><strong className="club180-score">{player.scores_180}</strong></td>
                          <td>{player.championship180}</td>
                          <td>{player.tournament180}</td>
                          <td>{player.legs_played ?? "—"}</td>
                          <td>{per100 == null ? "—" : decimal.format(per100)}</td>
                          <td>{ratio == null ? "—" : `1 / ${decimal.format(ratio)} legs`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card club180-ranking club180-detail">
              <div className="club180-section-heading">
                <div>
                  <span className="eyebrow">Traçabilité</span>
                  <h2>Détail par compétition</h2>
                </div>
                <span className="club180-count">{sourceRows.length} source{sourceRows.length > 1 ? "s" : ""}</span>
              </div>
              <p className="club180-detail-intro">
                Ce tableau explique le total consolidé sans créer plusieurs positions pour un même joueur.
              </p>
              <div className="table-scroll">
                <table className="table club180-table">
                  <thead><tr><th>Joueur</th><th>Équipe</th><th>Compétition</th><th>Type</th><th>180</th><th>Legs joués</th><th>180 / 100 legs</th></tr></thead>
                  <tbody>
                    {sourceRows.map((player) => {
                      const per100 = player.legs_played ? (player.scores_180 * 100) / player.legs_played : null;
                      return (
                        <tr key={`${player.player_id}-${player.source_type}-${player.competition}`}>
                          <td><Link className="club180-player-link" href={`/players/${player.player_id}`}><strong>{player.name}</strong><span>Voir le profil →</span></Link></td>
                          <td>{player.team || "—"}</td>
                          <td><span className="club180-competition">{player.competition}</span></td>
                          <td>{player.source_type === "championship" ? "Championnat" : "Tournoi"}</td>
                          <td><strong className="club180-score">{player.scores_180}</strong></td>
                          <td>{player.legs_played ?? "—"}</td>
                          <td>{per100 == null ? "—" : decimal.format(per100)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card club180-teams">
              <div className="club180-section-heading">
                <div>
                  <span className="eyebrow">Collectif</span>
                  <h2>Répartition par équipe</h2>
                </div>
              </div>
              <div className="club180-team-grid">
                {teamTotals.map((item, index) => (
                  <article key={item.team}>
                    <span>#{index + 1}</span>
                    <strong>{item.team}</strong>
                    <b>{item.total}</b>
                    <small>score{item.total > 1 ? "s" : ""} de 180</small>
                    <i style={{ width: `${Math.max(8, (item.total / (teamTotals[0]?.total || 1)) * 100)}%` }} />
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="card club180-empty">
            <Target size={42} />
            <h2>Aucun score de 180 enregistré</h2>
            <p>La page se remplira automatiquement dès qu’un 180 sera présent dans les données Nakka validées.</p>
          </section>
        )}

        <div className="club180-integrity">
          La rencontre J1 Kazadarts A – Kazadarts B reste comptée collectivement,
          mais aucun 180 individuel n’est inventé lorsque le détail PvP est absent.
        </div>
      </main>
    </div>
  );
}
