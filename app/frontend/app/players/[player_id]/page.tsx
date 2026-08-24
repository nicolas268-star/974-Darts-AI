import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Crosshair, Gauge, Medal, Target, TrendingUp, Trophy } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { PlayerCharts } from "@/components/player/PlayerCharts";
import { PlayerDashboardControls } from "@/components/player/PlayerDashboardControls";
import { PlayerMatchHistory } from "@/components/player/PlayerMatchHistory";
import { PlayerNetwork } from "@/components/player/PlayerNetwork";
import { PlayerDNA } from "@/components/player/PlayerDNA";
import { PlayerCoach } from "@/components/player/PlayerCoach";
import { PlayerCompareLauncher } from "@/components/player/PlayerCompareLauncher";
import type { PlayerDashboard } from "@/lib/player/dashboard-types";
import type { PlayerNetworkResponse } from "@/lib/player/network-types";
import type { PlayerDNAResponse } from "@/lib/player/dna-types";
import type { PlayerCoachResponse } from "@/lib/player/coach-types";
import type { PlayerOverview } from "@/lib/types/sprint4";
import "./player-premium.css";
import "./player-affiliation-timeline.css";
import "./player-network.css";
import "./player-dna.css";
import "./player-coach.css";
import "./player-compare-launcher.css";

const backend = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";
async function getDashboard(playerId: string): Promise<PlayerDashboard | null> { try { const response = await fetch(`${backend}/api/v1/players/${playerId}/dashboard`, { cache: "no-store", signal: AbortSignal.timeout(5000) }); if (response.status === 404) return null; if (!response.ok) throw new Error(`API joueur: ${response.status}`); return response.json(); } catch (error) { console.error(error); return null; } }
async function getNetwork(playerId: string): Promise<PlayerNetworkResponse | null> {
  try {
    const response = await fetch(`${backend}/api/v1/players/${playerId}/network`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    console.error(error);
    return null;
  }
}
async function getDNA(playerId: string): Promise<PlayerDNAResponse | null> {
  try {
    const response = await fetch(`${backend}/api/v1/players/${playerId}/dna`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    console.error(error);
    return null;
  }
}
async function getCoach(playerId: string): Promise<PlayerCoachResponse | null> {
  try {
    const response = await fetch(`${backend}/api/v1/players/${playerId}/coach`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    return response.json();
  } catch (error) { console.error(error); return null; }
}

type PlayerTournamentSummary = { participation_count: number };
type PlayerAffiliations = { current:{club?:string;team?:string;start_date?:string|null}; upcoming:Array<{club?:string;team?:string;effective_date:string}>; history:Array<{club?:string;team?:string;start_date?:string|null;end_date?:string|null}>; has_history:boolean };
async function getTournamentSummary(playerId: string): Promise<PlayerTournamentSummary | null> {
  try {
    const response = await fetch(`${backend}/api/v1/players/${playerId}/tournaments`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    return response.ok ? response.json() : null;
  } catch { return null; }
}
async function getAffiliations(playerId:string):Promise<PlayerAffiliations|null>{try{const response=await fetch(`${backend}/api/v1/players/${playerId}/affiliations`,{cache:"no-store",signal:AbortSignal.timeout(5000)});return response.ok?response.json():null}catch{return null}}


async function getPlayers(): Promise<PlayerOverview[]> { try { const response = await fetch(`${backend}/api/v1/players`, { cache: "no-store", signal: AbortSignal.timeout(5000) }); return response.ok ? (await response.json()).players : []; } catch { return []; } }
const number = (value: number | null | undefined, digits = 2) => value == null ? "—" : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const playerTier = (score: number, rank: number, legsPlayed: number) => {
  if (legsPlayed < 8) return { icon: "🌱", label: "Profil à confirmer", tone: "neutral" };
  if (score >= 85 && rank > 0 && rank <= 5) return { icon: "👑", label: "Joueur Elite", tone: "elite" };
  if (score >= 72) return { icon: "🔥", label: "Joueur confirmé", tone: "good" };
  if (score >= 58) return { icon: "🎯", label: "Joueur solide", tone: "good" };
  if (score >= 42) return { icon: "📈", label: "Joueur en progression", tone: "neutral" };
  return { icon: "🛠️", label: "Profil à développer", tone: "danger" };
};

export default async function PlayerDashboardPage({ params }: { params: Promise<{ player_id: string }> }) {
  const { player_id } = await params;
  const [data, network, dna, coach, players, tournamentSummary, affiliations] = await Promise.all([getDashboard(player_id), getNetwork(player_id), getDNA(player_id), getCoach(player_id), getPlayers(), getTournamentSummary(player_id), getAffiliations(player_id)]);
  if (!data) notFound();

  const ranked = players.filter((player) => player.average_3_darts != null).sort((a, b) => (b.average_3_darts ?? 0) - (a.average_3_darts ?? 0));
  const rank = ranked.findIndex((player) => player.player_id === player_id) + 1;
  const championshipAverage = average(ranked.map((player) => player.average_3_darts as number));
  const trendAverages = data.trends.map((item) => item.average_3_darts).filter((value): value is number => value != null);
  const mean = average(trendAverages);
  const deviation = mean == null || trendAverages.length < 2 ? null : Math.sqrt(trendAverages.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / trendAverages.length);
  const consistency = deviation == null ? null : Math.max(0, Math.min(100, 100 - deviation * 8));
  const firstThree = average(trendAverages.slice(0, 3));
  const lastThree = average(trendAverages.slice(-3));
  const progression = firstThree == null || lastThree == null ? null : lastThree - firstThree;
  const recent = data.recent_matches.slice(0, 5);
  const recentWins = recent.filter((match) => match.win_rate >= 50).length;

  const scoringVolume = data.scoring.scores_100_plus + data.scoring.scores_140_plus * 2 + data.scoring.scores_180 * 4;
  const scoringIndex = Math.round(clamp(((data.kpis.average_3_darts ?? 0) / 70) * 60 + clamp(scoringVolume / Math.max(1, data.kpis.legs_played) * 18) * 0.40));
  const resultIndex = Math.round(clamp(data.kpis.win_rate * 0.72 + clamp(data.kpis.legs_won / Math.max(1, data.kpis.legs_played) * 100) * 0.28));
  const finishIndex = Math.round(clamp(((data.kpis.best_finish ?? 0) / 170) * 55 + (data.kpis.average_finish != null ? clamp((100 - Math.abs(data.kpis.average_finish - 60)) / 100 * 45) : 0)));
  const consistencyIndex = Math.round(consistency ?? 0);
  const progressionIndex = Math.round(clamp(50 + (progression ?? 0) * 6));
  const playerIndex = Math.round(scoringIndex * 0.30 + resultIndex * 0.30 + consistencyIndex * 0.20 + finishIndex * 0.10 + progressionIndex * 0.10);
  const tier = playerTier(playerIndex, rank, data.kpis.legs_played);
  const formLabel = recent.length === 0 ? "Données limitées" : recentWins >= 4 ? "Excellente forme" : recentWins >= 3 ? "Bonne dynamique" : recentWins >= 2 ? "Forme stable" : "Forme à relancer";
  const affiliationView = data.affiliations ?? affiliations ?? { current: { team: data.player.team, club: data.player.club, start_date: null }, upcoming: [], history: [], has_history: false };
  const previousAffiliation = affiliationView.history.length > 1 ? affiliationView.history[affiliationView.history.length - 2] : null;
  const nextAffiliation = affiliationView.upcoming[0] ?? null;

  const kpis = [
    { label: "Moyenne 3 fléchettes", value: number(data.kpis.average_3_darts), icon: Gauge, tone: "orange", detail: championshipAverage == null ? "Référence indisponible" : `${(data.kpis.average_3_darts ?? 0) >= championshipAverage ? "+" : ""}${number((data.kpis.average_3_darts ?? 0) - championshipAverage)} vs championnat` },
    { label: "Taux de victoire", value: `${number(data.kpis.win_rate, 1)} %`, icon: Trophy, tone: "green", detail: `${recentWins} victoire${recentWins > 1 ? "s" : ""} sur les 5 derniers matchs` },
    { label: "Legs gagnés", value: `${data.kpis.legs_won} / ${data.kpis.legs_played}`, icon: Target, tone: "blue", detail: `${data.kpis.legs_played} legs analysés` },
    { label: "Meilleur finish", value: data.kpis.best_finish ?? "—", icon: Crosshair, tone: "gold", detail: `Finish moyen ${number(data.kpis.average_finish, 1)}` },
    { label: "Classement moyenne", value: rank ? `#${rank}` : "—", icon: Medal, tone: "purple", detail: rank ? `sur ${ranked.length} joueurs classés` : "Classement indisponible" },
  ];

  return <div className="dashboard"><Sidebar/><main className="main player-dashboard-page">
    <Link href="/players" className="back-link"><ArrowLeft size={17}/> Retour aux joueurs</Link>
    <Link href={`/players/${player_id}/career`} className="career-link">Identité & carrière · équipes, saisons et alias</Link>
    <PlayerDashboardControls players={players.map((player) => ({ player_id: player.player_id, name: player.name, team: player.team }))} currentPlayerId={player_id}/>

    <header className="player-hero card player-premium-hero">
      <div className="player-premium-avatar-wrap">
        <div className="player-premium-avatar-shell">
          <div className="player-avatar player-premium-avatar">{data.player.name.slice(0,2).toUpperCase()}</div>
          <span className={`player-status-dot ${recentWins >= 3 ? "is-hot" : recentWins >= 2 ? "is-steady" : "is-cold"}`} title={formLabel}/>
        </div>
        {(tournamentSummary?.participation_count ?? 0) > 0 && <Link href={`/players/${player_id}/tournaments`} className="player-tournament-link"><Trophy size={14}/> Performances en tournois</Link>}
      </div>
      <div className="player-identity player-premium-identity">
        <div className="player-premium-badges">
          <span className="badge">Profil joueur · Saison {data.season?.name ?? "—"}</span>
          <span className={`player-tier-badge player-tier-${tier.tone}`}>{tier.icon} {tier.label}</span>
        </div>
        <h2>{data.player.name}</h2>
        <p>{data.player.team ?? "Équipe non renseignée"}{data.player.club ? ` · ${data.player.club}` : ""}</p>
        <div className="player-badges">
          {rank > 0 && <span className="performance-badge top">Classement moyenne #{rank}</span>}
          {progression != null && <span className={`performance-badge ${progression >= 0 ? "positive" : "negative"}`}><TrendingUp size={13}/> {progression >= 0 ? "+" : ""}{number(progression)} pts</span>}
          <span className="performance-badge">{formLabel}</span>
        </div>
      </div>
      <div className="player-affiliation-card"><header><span>Parcours</span><Link href={`/players/${player_id}/career`}>Historique complet →</Link></header><div className="player-affiliation-timeline"><section><span>Précédent</span><strong>{previousAffiliation?.team||"—"}</strong><small>{previousAffiliation?.club||"Aucune équipe précédente"}</small></section><i>→</i><section className="is-current"><span>Actuel</span><strong>{affiliationView.current.team||data.player.team||"À confirmer"}</strong><small>{affiliationView.current.club||data.player.club||"Club à confirmer"}</small></section><i>→</i><section className={nextAffiliation?"is-next":""}><span>Prochain</span><strong>{nextAffiliation?.team||"—"}</strong><small>{nextAffiliation?`${nextAffiliation.club||"Club à confirmer"} · ${new Date(`${nextAffiliation.effective_date}T12:00:00`).toLocaleDateString("fr-FR")}`:"Aucun transfert prévu"}</small></section></div></div>
      <div className="player-premium-score">
        <span>Indice joueur</span><strong>{playerIndex}</strong><small>/ 100</small>
        <div className="player-premium-score-track"><i style={{ width: `${playerIndex}%` }}/></div>
        <em>{tier.label}</em>
      </div>
    </header>

    <section className="player-premium-index-grid" aria-label="Indices du joueur">
      {[
        ["Performance globale", playerIndex, tier.label],
        ["Scoring", scoringIndex, "Moyenne et gros scores"],
        ["Résultats", resultIndex, `${number(data.kpis.win_rate,1)} % de réussite`],
        ["Régularité", consistency == null ? "—" : consistencyIndex, "Dispersion par journée"],
        ["Finishes", finishIndex, `Best ${data.kpis.best_finish ?? "—"}`],
        ["Dynamique", progressionIndex, formLabel],
      ].map(([label, value, detail], index) => (
        <article className={`card player-premium-index ${index === 0 ? "player-premium-index-main" : ""}`} key={String(label)}>
          <span>{label}</span><strong>{value}</strong>
          {typeof value === "number" && <div className="player-premium-mini-track"><i style={{ width: `${value}%` }}/></div>}
          <small>{detail}</small>
        </article>
      ))}
    </section>

    <PlayerCompareLauncher currentPlayerId={player_id} currentPlayerName={data.player.name} players={players.map((player) => ({ player_id: player.player_id, name: player.name, team: player.team, average_3_darts: player.average_3_darts, win_rate: player.win_rate }))}/>

    <section className="player-kpi-grid">{kpis.map(({ label, value, icon: Icon, tone, detail }) => <article className={`card player-kpi player-kpi-${tone}`} key={label}><div className="player-kpi-icon"><Icon size={21}/></div><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</section>

    <section className="player-insight-grid">
      <article className="card insight-card"><span>Régularité</span><strong>{consistency == null ? "—" : `${number(consistency,0)} / 100`}</strong><div className="insight-progress"><i style={{ width: `${consistency ?? 0}%` }}/></div><small>Basée sur la dispersion des moyennes par journée.</small></article>
      <article className="card insight-card"><span>Forme récente</span><strong>{recentWins} / {recent.length || 0}</strong><div className="form-dots">{recent.map((match) => <i key={match.match_id} className={match.win_rate >= 50 ? "win" : "loss"}/>)}</div><small>Victoires sur les cinq derniers matchs.</small></article>
      <article className="card insight-card"><span>Progression récente</span><strong className={progression != null && progression >= 0 ? "positive-text" : "negative-text"}>{progression == null ? "—" : `${progression >= 0 ? "+" : ""}${number(progression)} pts`}</strong><small>Écart entre les trois premières et trois dernières journées disponibles.</small></article>
      <article className="card insight-card"><span>First 9</span><strong>{number(data.kpis.first_9)}</strong><small>{data.kpis.first_9 == null ? "Non disponible dans la source actuelle." : "Performance sur les neuf premières fléchettes."}</small></article>
    </section>

    <section className="card player-premium-summary">
      <div>
        <span className="badge">Identité sportive</span>
        <h3>Lecture du profil</h3>
        <p>{data.player.name} affiche une moyenne de <strong>{number(data.kpis.average_3_darts)}</strong>, un taux de victoire de <strong>{number(data.kpis.win_rate,1)} %</strong> et {data.kpis.best_finish != null ? <>un meilleur finish de <strong>{data.kpis.best_finish}</strong>.</> : <>aucun finish exploitable dans la source actuelle.</>}</p>
      </div>
      <div className="player-premium-summary-tags">
        <span>{scoringIndex >= 70 ? "🔥 Scoring fort" : scoringIndex >= 50 ? "🎯 Scoring solide" : "📈 Scoring à développer"}</span>
        <span>{consistencyIndex >= 70 ? "🧱 Profil régulier" : consistencyIndex >= 50 ? "⚖️ Régularité moyenne" : "🌊 Profil irrégulier"}</span>
        <span>{recentWins >= 3 ? "🚀 Bonne dynamique" : "🛠️ Dynamique à travailler"}</span>
      </div>
    </section>

    {data.meta.has_data ? <PlayerCharts data={data} championshipAverage={championshipAverage}/> : <div className="notice">Aucune donnée statistique disponible pour cette saison.</div>}
    {coach?.meta.frontend_ready ? (<PlayerCoach data={coach}/>) : (<section className="card player-network-unavailable"><strong>IA Coach indisponible</strong><span>Les données nécessaires au Coach ne sont pas encore disponibles.</span></section>)}

    {dna?.meta.frontend_ready ? (<PlayerDNA data={dna}/>) : (<section className="card player-network-unavailable"><strong>ADN joueur indisponible</strong><span>Les données nécessaires au profil ADN ne sont pas encore disponibles.</span></section>)}

    {network?.meta.frontend_ready ? (
      <PlayerNetwork data={network}/>
    ) : (
      <section className="card player-network-unavailable">
        <strong>Réseau joueur indisponible</strong>
        <span>Les données de réseau du joueur ne sont pas encore disponibles.</span>
      </section>
    )}
    <PlayerMatchHistory matches={data.recent_matches}/>
    <div className="nakka-rule">{data.meta.nakka_note}</div>
  </main></div>;
}
