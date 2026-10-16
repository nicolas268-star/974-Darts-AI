import { StatsTable } from "@/components/stats/StatsTable";
import Link from "next/link";
import { Activity, Award, Crown, Gauge, Medal, ShieldCheck, Target, Trophy } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { MINIMUM_LEGS, mvpStanding, type MvpSeason } from "@/lib/records/mvp";
import { loadMvpSeason } from "@/lib/records/mvp-server";
import { Mvp2027Hero } from "./Mvp2027Hero";
import { MvpCalculationDisclosure } from "./MvpCalculation";
import "../record-pages.css";
import "./mvp-seasons.css";

export async function MvpSeasonPage({ season }: { season: MvpSeason }) {
  const source = await loadMvpSeason(season);
  const standing = mvpStanding(source.players);
  const mvpPlayers = standing.displayed;
  const winner = mvpPlayers[0] ?? null;

  return (
    <div className="dashboard">
      <Sidebar />
      <main className="stats-responsive main record-page mvp-page">
        <Link className="back-link" href="/records/mvp">← Retour aux saisons MVP</Link>
        {season === "2027" ? <Mvp2027Hero provisional={standing.provisional} /> : <section className="record-hero mvp-hero">
          <div className="record-hero-icon mvp-crown" aria-hidden="true">
            <Crown size={44} />
            <span>MVP</span>
          </div>
          <div>
            <span className="eyebrow">Indice analytique · Saison {season}</span>
            <h1>MVP {season}</h1>
            <p>
              Un classement global fondé sur le scoring, les résultats, le
              volume observé et les finishs des joueurs.
            </p>
          </div>
          <span className="record-data-badge mvp-badge"><i /> {standing.provisional ? "Classement provisoire" : "Calcul transparent"}</span>
        </section>}

        {standing.provisional && <aside className="record-integrity mvp-integrity mvp-provisional-note"><ShieldCheck size={17}/><span><strong>Classement provisoire de début de saison.</strong> Aucun joueur n’a encore atteint le seuil de {MINIMUM_LEGS} legs avec une moyenne exploitable. Les premiers résultats individuels sont affichés ; le classement principal retiendra les joueurs ayant au moins {MINIMUM_LEGS} legs.</span></aside>}

        {winner ? (
          <section className="card mvp-winner">
            <div className="mvp-winner-rank"><Crown size={30} /> #1</div>
            <div className="mvp-winner-avatar">{winner.name.slice(0, 2).toUpperCase()}</div>
            <div className="mvp-winner-identity">
              <span className="eyebrow">{standing.provisional ? "Leader provisoire de l’indice MVP" : "Leader de l’indice MVP"}</span>
              <h2>{winner.name}</h2>
              <p>{winner.team || "Équipe non renseignée"}</p>
              <Link href={`/players/${winner.player_id}?season=${season}`}>Découvrir son profil →</Link>
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
            <span>{standing.provisional ? "Leader provisoire" : "Leader"}</span>
            <strong>{winner?.name ?? "—"}</strong>
            <small>{winner ? `${winner.score} / 100` : "Données insuffisantes"}</small>
          </article>
          <article className="card">
            <Target size={22} />
            <span>Joueurs classés</span>
            <strong>{source.status === "unavailable" ? "—" : mvpPlayers.length}</strong>
            <small>{standing.provisional ? "Premiers résultats individuels" : `Minimum ${MINIMUM_LEGS} legs analysés`}</small>
          </article>
          <article className="card">
            <Activity size={22} />
            <span>Profils à confirmer</span>
            <strong>{source.status === "unavailable" ? "—" : standing.developing.length}</strong>
            <small>Échantillon inférieur à {MINIMUM_LEGS} legs</small>
          </article>
          <article className="card">
            <Gauge size={22} />
            <span>Profils confirmés</span>
            <strong>{source.status === "unavailable" ? "—" : standing.confirmed.length}</strong>
            <small>Au moins {MINIMUM_LEGS} legs et une moyenne</small>
          </article>
        </section>

        {mvpPlayers.length ? (
          <>
            <section className="card record-podium mvp-podium">
              <div className="record-section-heading">
                <div>
                  <span className="eyebrow">Top 3</span>
                  <h2>{standing.provisional ? "Le podium provisoire" : "Le podium MVP"}</h2>
                </div>
                <Medal size={26} />
              </div>
              <div className="record-podium-grid">
                {mvpPlayers.slice(0, 3).map((player, index) => (
                  <Link
                    className={`record-podium-card mvp-podium-card podium-${index + 1}`}
                    href={`/players/${player.player_id}?season=${season}`}
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
                  <h2>Course au MVP {season}{standing.provisional ? " · provisoire" : ""}</h2>
                </div>
                <span className="record-count">{mvpPlayers.length} joueurs {standing.provisional ? "à confirmer" : "éligibles"}</span>
              </div>
              <div className="table-scroll">
                <StatsTable className="table record-table mvp-table" aria-label={`Classement MVP ${season}`}
                  rowDetails={mvpPlayers.map(player => <MvpCalculationDisclosure key={player.player_id} player={player} season={season} />)}>
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
                          <Link className="record-player-link" href={`/players/${player.player_id}?season=${season}`}>
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
                </StatsTable>
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
                Le classement principal requiert au moins {MINIMUM_LEGS} legs et une moyenne disponible.
                Avant qu’un joueur n’atteigne ce seuil, un classement provisoire présente les joueurs ayant au moins un leg et une moyenne, avec les mêmes pondérations.
                Le repère des gros scores est calculé parmi les joueurs du classement affiché.
                Les volées 100–139, 140–169, 170–179 et 180 sont pondérées respectivement ×1, ×2, ×3 et ×4.
                En cas d’égalité : résultats fiables, moyenne 3 fléchettes puis ordre alphabétique.
              </p>
            </section>
          </>
        ) : (
          <section className="card record-empty">
            <Award size={42} />
            <h2>{source.status === "unavailable" ? "Statistiques temporairement indisponibles" : standing.observed > 0 ? "Statistiques individuelles incomplètes" : `En attente des statistiques individuelles ${season}`}</h2>
            <p>{source.status === "unavailable" ? "Le classement ne peut pas être chargé actuellement. Réessayez dans quelques instants." : standing.observed > 0 ? "Des legs sont enregistrés, mais aucun profil ne dispose encore des données nécessaires au calcul de l’indice MVP." : source.publishedRounds > 0 ? "Des journées sont publiées. Le MVP apparaîtra dès que les legs et les moyennes des joueurs seront disponibles pour cette saison." : "Les joueurs apparaîtront dès la publication de leurs premières statistiques de la saison."}</p>
            {source.status === "unavailable" && <a className="btn btn-secondary" href={`/records/mvp/${season}`}>Réessayer</a>}
          </section>
        )}

        <div className="record-integrity mvp-integrity">
          <ShieldCheck size={17} />
          <span>
            Le MVP {season} est un indice analytique interne à 974 Darts AI, et non
            un titre officiel du championnat. Il utilise uniquement les données
            de la saison {season} et les identités fusionnées. Une rencontre sans détail individuel
            n’ajoute aucune performance de joueur. Les totaux de finish Nakka ne permettent pas de déduire une route de checkout ou une précision aux doubles.
          </span>
        </div>
      </main>
    </div>
  );
}
