import Link from "next/link";
import type { Metadata } from "next";
import { Activity, Award, Crown, Gauge, Medal, ShieldCheck, Target, Trophy } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import type { PlayerOverview, RankingPayload } from "@/lib/types/sprint4";
import "../record-pages.css";

const backend = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";
const MINIMUM_LEGS = 20;

export const metadata: Metadata = {
  title: "MVP 2026 | 974 Darts AI",
  description: "Classement analytique MVP du championnat 974 pour la saison 2026.",
};

type MvpPlayer = PlayerOverview & {
  score: number;
  scoringIndex: number;
  resultsIndex: number;
  impactIndex: number;
  finishIndex: number;
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

const clamp = (value: number) => Math.min(100, Math.max(0, value));
const decimal = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function wilsonLowerBound(wins: number, played: number) {
  if (!played) return 0;
  const z = 1.96;
  const proportion = wins / played;
  const denominator = 1 + (z * z) / played;
  const centre = proportion + (z * z) / (2 * played);
  const margin =
    z *
    Math.sqrt(
      (proportion * (1 - proportion) + (z * z) / (4 * played)) / played,
    );
  return ((centre - margin) / denominator) * 100;
}

function buildMvpPlayers(players: PlayerOverview[]): MvpPlayer[] {
  const eligible = players.filter(
    (player) =>
      (player.legs_played ?? 0) >= MINIMUM_LEGS &&
      player.average_3_darts != null &&
      player.legs_won != null,
  );
  const highScoreRates = eligible.map((player) => {
    const legs = player.legs_played || 1;
    return (
      ((player.scores_100 + player.scores_140 * 2 + player.scores_180 * 4) /
        legs) *
      100
    );
  });
  const bestHighScoreRate = Math.max(1, ...highScoreRates);

  return eligible
    .map((player) => {
      const legs = player.legs_played || 1;
      const won = player.legs_won || 0;
      const highScoreRate =
        ((player.scores_100 + player.scores_140 * 2 + player.scores_180 * 4) /
          legs) *
        100;
      const averageIndex = clamp(((player.average_3_darts ?? 0) / 70) * 100);
      const first9Index =
        player.first_9 == null
          ? averageIndex
          : clamp((player.first_9 / 80) * 100);
      const scoringIndex = clamp(
        averageIndex * 0.65 +
          first9Index * 0.2 +
          clamp((highScoreRate / bestHighScoreRate) * 100) * 0.15,
      );
      const resultsIndex = clamp(wilsonLowerBound(won, legs));
      const impactIndex = clamp((legs / 100) * 100);
      const finishIndex = clamp(((player.best_finish ?? 0) / 170) * 100);
      const score = Math.round(
        scoringIndex * 0.4 +
          resultsIndex * 0.35 +
          impactIndex * 0.15 +
          finishIndex * 0.1,
      );
      return {
        ...player,
        score,
        scoringIndex: Math.round(scoringIndex),
        resultsIndex: Math.round(resultsIndex),
        impactIndex: Math.round(impactIndex),
        finishIndex: Math.round(finishIndex),
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.resultsIndex - left.resultsIndex ||
        (right.average_3_darts ?? 0) - (left.average_3_darts ?? 0) ||
        left.name.localeCompare(right.name, "fr"),
    );
}

export default async function Mvp2026Page() {
  const [players, ranking] = await Promise.all([getPlayers(), getRanking()]);
  const mvpPlayers = buildMvpPlayers(players);
  const developingPlayers = players.filter(
    (player) =>
      (player.legs_played ?? 0) > 0 &&
      (player.legs_played ?? 0) < MINIMUM_LEGS,
  );
  const winner = mvpPlayers[0] ?? null;
  const season = ranking?.season?.name ?? "2026";

  return (
    <div className="dashboard">
      <Sidebar />
      <main className="main record-page mvp-page">
        <section className="record-hero mvp-hero">
          <div className="record-hero-icon mvp-crown" aria-hidden="true">
            <Crown size={44} />
            <span>MVP</span>
          </div>
          <div>
            <span className="eyebrow">Indice analytique · Saison {season}</span>
            <h1>MVP 2026</h1>
            <p>
              Un classement global fondé sur le scoring, les résultats, le
              volume observé et les finishs des joueurs.
            </p>
          </div>
          <span className="record-data-badge mvp-badge"><i /> Calcul transparent</span>
        </section>

        {winner ? (
          <section className="card mvp-winner">
            <div className="mvp-winner-rank"><Crown size={30} /> #1</div>
            <div className="mvp-winner-avatar">{winner.name.slice(0, 2).toUpperCase()}</div>
            <div className="mvp-winner-identity">
              <span className="eyebrow">Leader de l’indice MVP</span>
              <h2>{winner.name}</h2>
              <p>{winner.team || "Équipe non renseignée"}</p>
              <Link href={`/players/${winner.player_id}`}>Découvrir son profil →</Link>
            </div>
            <div className="mvp-winner-score">
              <span>Indice MVP</span>
              <strong>{winner.score}</strong>
              <small>/ 100</small>
              <i style={{ width: `${winner.score}%` }} />
            </div>
          </section>
        ) : null}

        <section className="record-kpis mvp-kpis" aria-label="Résumé du classement MVP">
          <article className="card">
            <Trophy size={22} />
            <span>Leader</span>
            <strong>{winner?.name ?? "—"}</strong>
            <small>{winner ? `${winner.score} / 100` : "Données insuffisantes"}</small>
          </article>
          <article className="card">
            <Target size={22} />
            <span>Joueurs éligibles</span>
            <strong>{mvpPlayers.length}</strong>
            <small>Minimum {MINIMUM_LEGS} legs analysés</small>
          </article>
          <article className="card">
            <Activity size={22} />
            <span>Profils à confirmer</span>
            <strong>{developingPlayers.length}</strong>
            <small>Échantillon inférieur à {MINIMUM_LEGS} legs</small>
          </article>
          <article className="card">
            <Gauge size={22} />
            <span>Dimensions</span>
            <strong>4</strong>
            <small>Scoring, résultats, impact et finishs</small>
          </article>
        </section>

        {mvpPlayers.length ? (
          <>
            <section className="card record-podium mvp-podium">
              <div className="record-section-heading">
                <div>
                  <span className="eyebrow">Top 3</span>
                  <h2>Le podium MVP</h2>
                </div>
                <Medal size={26} />
              </div>
              <div className="record-podium-grid">
                {mvpPlayers.slice(0, 3).map((player, index) => (
                  <Link
                    className={`record-podium-card mvp-podium-card podium-${index + 1}`}
                    href={`/players/${player.player_id}`}
                    key={player.player_id}
                  >
                    <span className="record-medal">#{index + 1}</span>
                    <div className="record-avatar">{player.name.slice(0, 2).toUpperCase()}</div>
                    <strong>{player.name}</strong>
                    <small>{player.team || "Équipe non renseignée"}</small>
                    <b>{player.score}</b>
                    <em>indice MVP / 100</em>
                    <div className="mvp-mini-indices">
                      <span>Scoring {player.scoringIndex}</span>
                      <span>Résultats {player.resultsIndex}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            <section className="card record-ranking">
              <div className="record-section-heading">
                <div>
                  <span className="eyebrow">Classement complet</span>
                  <h2>Course au MVP 2026</h2>
                </div>
                <span className="record-count">{mvpPlayers.length} joueurs éligibles</span>
              </div>
              <div className="table-scroll">
                <table className="table record-table mvp-table">
                  <thead>
                    <tr>
                      <th>Rang</th>
                      <th>Joueur</th>
                      <th>Équipe</th>
                      <th>Indice MVP</th>
                      <th>Scoring</th>
                      <th>Résultats</th>
                      <th>Impact</th>
                      <th>Finishs</th>
                      <th>Legs G/J</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mvpPlayers.map((player, index) => (
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
                        <td><strong className="mvp-score">{player.score}</strong></td>
                        <td>{player.scoringIndex}</td>
                        <td>{player.resultsIndex}</td>
                        <td>{player.impactIndex}</td>
                        <td>{player.finishIndex}</td>
                        <td>{player.legs_won ?? 0}/{player.legs_played ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card mvp-method">
              <div className="record-section-heading">
                <div>
                  <span className="eyebrow">Transparence</span>
                  <h2>Comment l’indice MVP est calculé</h2>
                </div>
                <ShieldCheck size={26} />
              </div>
              <div className="mvp-method-grid">
                <article><b>40 %</b><strong>Scoring</strong><span>Moyenne 3 fléchettes, First 9 et fréquence pondérée des gros scores.</span></article>
                <article><b>35 %</b><strong>Résultats fiables</strong><span>Borne basse de Wilson à 95 %, qui pénalise les très petits échantillons.</span></article>
                <article><b>15 %</b><strong>Impact</strong><span>Volume de legs réellement disputés, plafonné à 100 legs.</span></article>
                <article><b>10 %</b><strong>Finishs</strong><span>Meilleur finish rapporté au checkout maximal de 170.</span></article>
              </div>
              <p className="mvp-method-note">
                Seuls les joueurs ayant au moins {MINIMUM_LEGS} legs sont classés.
                En cas d’égalité : résultats fiables, moyenne 3 fléchettes puis ordre alphabétique.
              </p>
            </section>
          </>
        ) : (
          <section className="card record-empty">
            <Award size={42} />
            <h2>Classement MVP indisponible</h2>
            <p>Aucun joueur ne possède encore l’échantillon minimum requis.</p>
          </section>
        )}

        <div className="record-integrity mvp-integrity">
          <ShieldCheck size={17} />
          <span>
            Le MVP 2026 est un indice analytique interne à 974 Darts AI, et non
            un titre officiel du championnat. Il utilise uniquement les données
            Nakka validées et les identités fusionnées. La J1 sans détail PvP
            n’ajoute aucune performance individuelle.
          </span>
        </div>
      </main>
    </div>
  );
}
