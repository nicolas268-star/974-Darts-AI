import Link from "next/link";
import type { Metadata } from "next";
import { Award, Crosshair, ShieldCheck, Sparkles, Target, Trophy } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { canonicalTeamName } from "@/lib/team-identity";
import type { PlayerOverview, RankingPayload } from "@/lib/types/sprint4";
import { getTournamentRecords, normalizedPlayerName } from "@/lib/tournament-records";
import "../record-pages.css";
import "../competition-badges.css";

const backend = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";

export const metadata: Metadata = {
  title: "Meilleurs finishs | 974 Darts AI",
  description: "Classement des plus hauts finishs réalisés en championnat et en tournoi.",
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

const finishLevel = (finish: number) => {
  if (finish >= 130) return "Exceptionnel";
  if (finish >= 100) return "Finish 100+";
  if (finish >= 80) return "Très haut finish";
  return "Finish confirmé";
};

export default async function HighestFinishesPage() {
  const [players, ranking, tournamentRecords] = await Promise.all([getPlayers(), getRanking(), getTournamentRecords()]);
  const officialPlayers = players
    .map((player) => ({ ...player, team: canonicalTeamName(player.team) }))
  const playerByName = new Map(officialPlayers.map((player) => [normalizedPlayerName(player.name), player]));
  const season = ranking?.season?.name ?? "2026";
  const finishers = [
    ...officialPlayers.map((player) => ({
      ...player,
      competition: `Championnat ${season}`,
      finish_count_known: true,
    })),
    ...tournamentRecords.flatMap((record) => {
      const player = playerByName.get(normalizedPlayerName(record.name));
      return player ? [{
        ...player,
        legs_played: record.legs_played,
        average_3_darts: record.average_3_darts,
        best_finish: record.best_finish,
        finishes: 0,
        competition: record.competition,
        finish_count_known: false,
      }] : [];
    }),
  ]
    .filter(
      (player) =>
        player.best_finish != null &&
        player.best_finish > 0 &&
        player.best_finish <= 170,
    )
    .sort(
      (left, right) =>
        (right.best_finish ?? 0) - (left.best_finish ?? 0) ||
        right.finishes - left.finishes ||
        (right.average_3_darts ?? 0) - (left.average_3_darts ?? 0) ||
        left.name.localeCompare(right.name, "fr"),
    );

  const bestFinishers = [...finishers.reduce((best, player) => {
    const current = best.get(player.player_id);
    if (!current || (player.best_finish ?? 0) > (current.best_finish ?? 0)) {
      best.set(player.player_id, player);
    }
    return best;
  }, new Map<string, (typeof finishers)[number]>()).values()]
    .sort(
      (left, right) =>
        (right.best_finish ?? 0) - (left.best_finish ?? 0) ||
        left.name.localeCompare(right.name, "fr"),
    );
  const leader = bestFinishers[0] ?? null;
  const centuryFinishers = bestFinishers.filter((player) => (player.best_finish ?? 0) >= 100);
  const teamLeaders = [
    ...bestFinishers.reduce((teams, player) => {
      const team = player.team || "Équipe non renseignée";
      const current = teams.get(team);
      if (!current || (player.best_finish ?? 0) > (current.best_finish ?? 0)) {
        teams.set(team, player);
      }
      return teams;
    }, new Map<string, PlayerOverview>()),
  ]
    .map(([team, player]) => ({ team, player }))
    .sort(
      (left, right) =>
        (right.player.best_finish ?? 0) - (left.player.best_finish ?? 0) ||
        left.team.localeCompare(right.team, "fr"),
    );

  return (
    <div className="dashboard">
      <Sidebar />
      <main className="main record-page finish-page">
        <section className="record-hero finish-hero">
          <div className="record-hero-icon" aria-hidden="true">
            <Crosshair size={42} />
            <span>170</span>
          </div>
          <div>
            <span className="eyebrow">Précision · Saison {season}</span>
            <h1>Les plus hauts finishs</h1>
            <p>
              Le palmarès des meilleures volées de fermeture enregistrées dans
              les données individuelles Nakka validées.
            </p>
          </div>
          <span className="record-data-badge"><i /> Données officielles</span>
        </section>

        <section className="record-kpis" aria-label="Résumé des finishs">
          <article className="card">
            <Trophy size={22} />
            <span>Record 2026</span>
            <strong>{leader?.best_finish ?? "—"}</strong>
            <small>{leader?.name ?? "Aucun finish disponible"}</small>
          </article>
          <article className="card">
            <Target size={22} />
            <span>Joueurs classés</span>
            <strong>{bestFinishers.length}</strong>
            <small>Avec un finish individuel valide</small>
          </article>
          <article className="card">
            <Sparkles size={22} />
            <span>Club des 100+</span>
            <strong>{centuryFinishers.length}</strong>
            <small>Joueurs avec un meilleur finish ≥ 100</small>
          </article>
          <article className="card">
            <Award size={22} />
            <span>Équipes représentées</span>
            <strong>{teamLeaders.length}</strong>
            <small>Meilleur finish de chaque collectif</small>
          </article>
        </section>

        {finishers.length ? (
          <>
            <section className="card record-podium">
              <div className="record-section-heading">
                <div>
                  <span className="eyebrow">Podium 2026</span>
                  <h2>Les maîtres du finish</h2>
                </div>
                <Crosshair size={26} />
              </div>
              <div className="record-podium-grid">
                {bestFinishers.slice(0, 3).map((player, index) => (
                  <Link
                    className={`record-podium-card podium-${index + 1}`}
                    href={`/players/${player.player_id}`}
                    key={player.player_id}
                  >
                    <span className="record-medal">#{index + 1}</span>
                    <div className="record-avatar">
                      {player.name.slice(0, 2).toUpperCase()}
                    </div>
                    <strong>{player.name}</strong>
                    <small>{player.team || "Équipe non renseignée"}</small>
                    <b>{player.best_finish}</b>
                    <em>{finishLevel(player.best_finish ?? 0)}</em>
                    <span className="record-chip">
                      {player.finish_count_known
                        ? `${player.finishes} finish${player.finishes > 1 ? "s" : ""} enregistré${player.finishes > 1 ? "s" : ""}`
                        : player.competition}
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            <section className="card record-ranking">
              <div className="record-section-heading">
                <div>
                  <span className="eyebrow">Classement complet</span>
                  <h2>Meilleur finish de chaque joueur</h2>
                </div>
                <span className="record-count">
                  {bestFinishers.length} joueur{bestFinishers.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="table-scroll">
                <table className="table record-table">
                  <thead>
                    <tr>
                      <th>Rang</th>
                      <th>Joueur</th>
                      <th>Équipe</th>
                      <th>Compétition</th>
                      <th>Meilleur finish</th>
                      <th>Niveau</th>
                      <th>Finishs enregistrés</th>
                      <th>Moy. 3 fl.</th>
                      <th>Legs joués</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bestFinishers.map((player, index) => (
                      <tr key={player.player_id}>
                        <td>
                          <span className={`record-rank rank-${Math.min(index + 1, 4)}`}>
                            #{index + 1}
                          </span>
                        </td>
                        <td>
                          <Link className="record-player-link" href={`/players/${player.player_id}`}>
                            <strong>{player.name}</strong>
                            <span>Voir le profil →</span>
                          </Link>
                        </td>
                        <td>{player.team || "—"}</td>
                        <td><span className="record-competition">{player.competition}</span></td>
                        <td><strong className="finish-score">{player.best_finish}</strong></td>
                        <td><span className="finish-level">{finishLevel(player.best_finish ?? 0)}</span></td>
                        <td>{player.finish_count_known ? player.finishes : "—"}</td>
                        <td>{player.average_3_darts == null ? "—" : decimal.format(player.average_3_darts)}</td>
                        <td>{player.legs_played ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card record-team-panel">
              <div className="record-section-heading">
                <div>
                  <span className="eyebrow">Collectif</span>
                  <h2>Record de chaque équipe</h2>
                </div>
              </div>
              <div className="record-team-grid">
                {teamLeaders.map(({ team, player }, index) => (
                  <article key={team}>
                    <span>#{index + 1}</span>
                    <div>
                      <strong>{team}</strong>
                      <small>{player.name}</small>
                    </div>
                    <b>{player.best_finish}</b>
                    <i
                      style={{
                        width: `${Math.max(
                          8,
                          ((player.best_finish ?? 0) /
                            (teamLeaders[0]?.player.best_finish || 1)) *
                            100,
                        )}%`,
                      }}
                    />
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="card record-empty">
            <Crosshair size={42} />
            <h2>Aucun finish individuel enregistré</h2>
            <p>Cette page se remplira automatiquement avec les prochaines données Nakka validées.</p>
          </section>
        )}

        <div className="record-integrity">
          <ShieldCheck size={17} />
          <span>
            Un finish correspond au total de la volée gagnante publié par Nakka.
            Aucun double touché ni chemin de checkout n’est reconstitué. La J1
            Kazadarts A – Kazadarts B reste exclue des statistiques individuelles
            faute de détail PvP.
          </span>
        </div>
      </main>
    </div>
  );
}
