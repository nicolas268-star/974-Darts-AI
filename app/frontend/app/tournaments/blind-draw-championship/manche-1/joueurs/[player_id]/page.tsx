import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import detailsData from "@/lib/bdc-round-one-details.json";
import sourceData from "@/lib/bdc-round-one.json";
import { BDC_RESULTS, BDC_URL } from "@/lib/bdc";
import {
  BDC_UNAVAILABLE,
  buildBdcPlayerRoundProfile,
  type BdcPlayerMatchProfile,
  type BdcRoundDetails,
  type BdcRoundSource,
} from "@/lib/bdc-player-profile";
import "../../../../../competitions/competition-hub.css";
import "../../../bdc.css";

const roundResult = BDC_RESULTS.find((result) => result.round === 1)!;
const details = detailsData as BdcRoundDetails;
const source = sourceData as BdcRoundSource;
const backHref = `${BDC_URL}#m1-joueurs`;

const decimal = (value: number | null, suffix = "") =>
  value === null
    ? "—"
    : `${value.toLocaleString("fr-FR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}${suffix}`;

const scoreUnit = (value: string) => value === "sets" ? "set" : "leg";

export function generateStaticParams() {
  return roundResult.teams.flatMap((team) =>
    team.players.map((player) => ({ player_id: player.id })),
  );
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ player_id: string }>;
}): Promise<Metadata> {
  const { player_id } = await params;
  const player = roundResult.teams
    .flatMap((team) => team.players)
    .find((entry) => entry.id === player_id);
  return {
    title: player
      ? `${player.name} · Manche 01 BDC`
      : "Fiche joueur · Manche 01 BDC",
  };
}

function Sparkline({
  label,
  values,
  suffix = "",
}: {
  label: string;
  values: Array<{ match: number; value: number }>;
  suffix?: string;
}) {
  if (values.length < 2) {
    return <article className="bdc-player-chart"><span>{label}</span><strong>—</strong><small>Volume insuffisant pour afficher une évolution fiable.</small></article>;
  }

  const raw = values.map((entry) => entry.value);
  const min = Math.min(...raw);
  const max = Math.max(...raw);
  const range = Math.max(max - min, 1);
  const points = values.map((entry, index) => ({
    ...entry,
    x: values.length === 1 ? 50 : 7 + index * (86 / (values.length - 1)),
    y: 36 - ((entry.value - min) / range) * 28,
  }));

  return <article className="bdc-player-chart">
    <span>{label}</span>
    <strong>{decimal(values.at(-1)!.value, suffix)}</strong>
    <svg viewBox="0 0 100 44" role="img" aria-label={`${label}, évolution sur ${values.length} matchs couverts`}>
      <line x1="7" y1="36" x2="93" y2="36" />
      <polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} />
      {points.map((point) => <circle cx={point.x} cy={point.y} r="2.1" key={`${point.match}-${point.value}`}><title>Match {point.match} : {decimal(point.value, suffix)}</title></circle>)}
    </svg>
    <div className="bdc-spark-values">{values.map((entry) => <small key={entry.match}>M{entry.match}<b>{decimal(entry.value, suffix)}</b></small>)}</div>
  </article>;
}

function MatchCard({ match }: { match: BdcPlayerMatchProfile }) {
  const stats = match.stats;
  const scoreLabel = `${match.playerScore}–${match.opponentScore} ${scoreUnit(match.scoreUnit)}${Math.max(match.playerScore, match.opponentScore) > 1 ? "s" : ""}`;

  return <details className="bdc-player-fixture" open={match.number === 1}>
    <summary>
      <span><b>Match {match.number}</b><small>{match.phase}</small></span>
      <span><small>Adversaires</small><b>{match.opponents}</b></span>
      <span className={match.result === "Victoire" ? "is-win" : "is-loss"}>{match.result}<b>{scoreLabel}</b></span>
    </summary>
    <div className="bdc-player-fixture-body">
      <div className="bdc-player-fixture-context"><span>Partenaire · <strong>{match.partner}</strong></span><span>Moyenne du duo · <strong>{decimal(match.duoAverage3)}</strong></span></div>
      {!match.available || !stats ? <div className="bdc-unavailable-panel"><strong>{BDC_UNAVAILABLE}</strong><p>Le résultat collectif reste validé, mais cette rencontre ne permet pas une attribution individuelle fiable.</p></div> : <>
        <dl className="bdc-player-match-metrics">
          <div><dt>Contribution scoring</dt><dd>{decimal(match.contribution, "%")}</dd></div>
          <div><dt>Moyenne 3 darts</dt><dd>{decimal(stats.average3)}</dd></div>
          <div><dt>First 9</dt><dd>{stats.first9 === null ? BDC_UNAVAILABLE : decimal(stats.first9)}</dd></div>
          <div><dt>Score enregistré</dt><dd>{stats.score.toLocaleString("fr-FR")}</dd></div>
          <div><dt>Fléchettes enregistrées</dt><dd>{stats.darts}</dd></div>
          <div><dt>Finishes</dt><dd>{stats.finishes.length}</dd></div>
          <div><dt>Plus haut finish</dt><dd>{stats.bestFinish ?? "—"}</dd></div>
          <div><dt>Tours sans score</dt><dd className="is-unavailable">{BDC_UNAVAILABLE}</dd></div>
          <div><dt>100–139</dt><dd>{stats.visits100}</dd></div>
          <div><dt>140–169</dt><dd>{stats.visits140}</dd></div>
          <div><dt>170–179</dt><dd>{stats.visits170}</dd></div>
          <div><dt>180</dt><dd>{stats.visits180}</dd></div>
        </dl>
        <div className="bdc-player-finishes"><strong>Détail des finishes</strong>{stats.finishes.length ? <ul>{stats.finishes.map((finish) => <li key={`${finish.leg}-${finish.value}-${finish.darts}`}>Leg {finish.leg} · sortie {finish.value} · {finish.darts} fléchette{finish.darts > 1 ? "s" : ""}</li>)}</ul> : <span>Aucun finish enregistré sur les données disponibles.</span>}</div>
      </>}
    </div>
  </details>;
}

export default async function BdcPlayerRoundPage({
  params,
}: {
  params: Promise<{ player_id: string }>;
}) {
  const { player_id } = await params;
  const profile = buildBdcPlayerRoundProfile(player_id, roundResult, details, source);
  if (!profile) notFound();

  const summary = profile.summary;
  const covered = profile.matches.filter((match) => match.available && match.stats);
  const averageSeries = covered.flatMap((match) => match.stats?.average3 === null || match.stats?.average3 === undefined ? [] : [{ match: match.number, value: match.stats.average3 }]);
  const first9Series = covered.flatMap((match) => match.stats?.first9 === null || match.stats?.first9 === undefined ? [] : [{ match: match.number, value: match.stats.first9 }]);
  const contributionSeries = covered.flatMap((match) => match.contribution === null ? [] : [{ match: match.number, value: match.contribution }]);
  const winRate = profile.matchesPlayed ? profile.matchesWon * 100 / profile.matchesPlayed : null;

  return <div className="dashboard">
    <Sidebar />
    <main className="main competition-page tournament-theme bdc-page bdc-player-page">
      <Link href={backHref} className="hub-back bdc-player-back">← Retour aux performances individuelles de la Manche 01</Link>

      <header className="bdc-player-hero">
        <div><span className="bdc-eyebrow">FICHE JOUEUR · MANCHE 01</span><h1>{profile.player.name}</h1><p>{profile.teamName}</p><div className="bdc-tags"><span>{profile.points} points BDC</span><span>{profile.place === 1 ? "Champion" : `${profile.place}e place`}</span><span>Données individuelles partielles</span></div></div>
        <div className="bdc-player-rank"><span>CLASSEMENT</span><strong>{profile.place}</strong><small>Manche 01</small></div>
      </header>

      <section className="bdc-player-section" aria-labelledby="synthese-joueur">
        <div className="bdc-report-title"><div><span>01</span><h2 id="synthese-joueur">Synthèse de la Manche 01</h2></div><small>{profile.matchesCovered}/{profile.matchesPlayed} matchs avec attribution individuelle fiable</small></div>
        <div className="bdc-player-kpis">
          <article><span>Matchs disputés</span><strong>{profile.matchesPlayed}</strong><small>{profile.matchesWon} victoire{profile.matchesWon > 1 ? "s" : ""} · résultats collectifs validés</small></article>
          <article><span>Moyenne 3 darts</span><strong>{summary ? decimal(summary.average3) : "—"}</strong><small>sur {profile.matchesCovered} matchs couverts</small></article>
          <article><span>Moyenne First 9</span><strong>{summary?.first9 === null || !summary ? "—" : decimal(summary.first9)}</strong><small>{summary?.first9 === null || !summary ? BDC_UNAVAILABLE : "9 premières fléchettes disponibles"}</small></article>
          <article><span>Contribution scoring</span><strong>{summary ? decimal(summary.contribution, "%") : "—"}</strong><small>points joueur ÷ points du duo</small></article>
          <article><span>Finishes réalisés</span><strong>{summary?.finishes.length ?? "—"}</strong><small>données nominatives disponibles</small></article>
          <article><span>Plus haut finish</span><strong>{summary?.bestFinish ?? "—"}</strong><small>{summary?.bestFinish === null || !summary ? "Aucun finish attribuable" : "meilleure sortie enregistrée"}</small></article>
          <article><span>Tours sans score</span><strong className="is-unavailable">—</strong><small>{BDC_UNAVAILABLE}</small></article>
          <article className="bdc-big-visits"><span>Grosses volées</span><div><b>100–139 <strong>{summary?.visits100 ?? "—"}</strong></b><b>140–169 <strong>{summary?.visits140 ?? "—"}</strong></b><b>170–179 <strong>{summary?.visits170 ?? "—"}</strong></b><b>180 <strong>{summary?.visits180 ?? "—"}</strong></b></div><small>sur les matchs couverts</small></article>
        </div>
        <p className="bdc-note">Les statistiques individuelles résument uniquement les rencontres où l’ordre nominatif des joueurs a été enregistré. Les {profile.matchesPlayed - profile.matchesCovered} autres résultats restent comptabilisés dans le parcours collectif.</p>
      </section>

      <section className="bdc-player-section" aria-labelledby="evolution-joueur">
        <div className="bdc-report-title"><div><span>02</span><h2 id="evolution-joueur">Évolution match par match</h2></div><small>Rencontres couvertes uniquement</small></div>
        <div className="bdc-player-charts"><Sparkline label="Moyenne 3 darts" values={averageSeries} /><Sparkline label="Moyenne First 9" values={first9Series} /><Sparkline label="Contribution scoring" values={contributionSeries} suffix="%" /></div>
      </section>

      <section className="bdc-player-section" aria-labelledby="partenaire-joueur">
        <div className="bdc-report-title"><div><span>03</span><h2 id="partenaire-joueur">Partenaire de la manche</h2></div><small>Tirage au sort de la Manche 01</small></div>
        <article className="bdc-partner-card"><div><span>PARTENAIRE TIRÉ AU SORT</span><strong>{profile.partner.name}</strong><small>{profile.teamName}</small></div><dl><div><dt>Matchs ensemble</dt><dd>{profile.matchesPlayed}</dd></div><div><dt>Taux de victoire</dt><dd>{decimal(winRate, "%")}</dd></div><div><dt>Moyenne du duo</dt><dd>{decimal(profile.duoAverage3)}</dd></div><div><dt>Contribution du joueur</dt><dd>{summary ? decimal(summary.contribution, "%") : "—"}</dd></div></dl></article>
        <p className="bdc-note">Un seul partenaire est attribué à chaque joueur pour toute la manche. Les comparaisons « meilleur partenaire » et « association la plus difficile » seront réservées à la future fiche globale BDC, après plusieurs manches suffisamment documentées.</p>
      </section>

      <section className="bdc-player-section" aria-labelledby="matchs-joueur">
        <div className="bdc-report-title"><div><span>04</span><h2 id="matchs-joueur">Performances par rencontre</h2></div><small>Ouvrir une rencontre pour consulter le détail</small></div>
        <div className="bdc-player-fixtures">{profile.matches.map((match) => <MatchCard match={match} key={match.id} />)}</div>
      </section>

      <aside className="bdc-source-limits bdc-player-limits"><h3>Fiabilité des données</h3><p>Les résultats collectifs et le classement final validés manuellement sont conservés. Aucune statistique individuelle manquante n’est reconstituée.</p><p>Les tours sans score ne figurent pas dans les données exploitables de cette manche : <strong>{BDC_UNAVAILABLE}</strong>.</p></aside>

      <Link href={backHref} className="bdc-button bdc-player-return">Retour à la Manche 01</Link>
    </main>
  </div>;
}
