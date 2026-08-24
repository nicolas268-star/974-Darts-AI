"use client";

import Link from "next/link";
import { Award, Crosshair, Gauge, Info, Medal, Sparkles, Target, TrendingUp, Trophy, Users } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, PolarAngleAxis,
  PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { DuoDashboardResponse, DuoMatch } from "@/lib/duo/types";
import "./duo-wow.css";

const fmt = (value: number | null | undefined, digits = 2) => value == null ? "—" : new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const date = (value: string | null) => value ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
const wonMatch = (match: DuoMatch) => match.win_rate > 50;
const matchResult = (match: DuoMatch) =>
  match.result === "win"
    ? { label: "Victoire", className: "is-win" }
    : match.result === "draw"
      ? { label: "Nul", className: "is-draw" }
      : { label: "Défaite", className: "is-loss" };

const difficultyStars = (count: number) =>
  `${"★".repeat(Math.max(1, Math.min(5, count)))}${"☆".repeat(Math.max(0, 5 - count))}`;
const radarColors = ["#38BDF8", "#FB923C"];
const normalizeRadarValue = (value: number | null | undefined, maximum: number) =>
  Math.round(((value ?? 0) / Math.max(1, maximum)) * 100);

const clamp = (value: number, minimum = 0, maximum = 100) =>
  Math.min(maximum, Math.max(minimum, value));

function wilsonLowerBound(wins: number, total: number): number {
  if (total <= 0) return 0;
  const z = 1.96;
  const p = wins / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return clamp(((centre - margin) / denominator) * 100);
}

const indexLabel = (value: number) =>
  value >= 85 ? "Exceptionnel" :
  value >= 72 ? "Très fort" :
  value >= 58 ? "Solide" :
  value >= 42 ? "En construction" : "À développer";

export function DuoDetailDashboard({ data }: { data: DuoDashboardResponse }) {
  const { duo } = data;
  const contributions = duo.contributions ?? [];
  const wins = data.recent_matches.filter(wonMatch).length;
  const draws = data.recent_matches.filter(match => match.win_rate === 50).length;
  const losses = Math.max(0, data.recent_matches.length - wins - draws);
  const conversion = duo.legs_played ? duo.legs_won / duo.legs_played * 100 : 0;

  const trendData = data.trends.map(item => ({
    label: item.round ?? date(item.played_on),
    moyenne: item.average_3_darts,
    first9: item.first_9,
    winRate: item.win_rate,
    score: item.score,
    legs: item.legs_won,
    finishes: item.finishes,
  }));

  const scoringData = [
    { label: "80+", value: duo.scores_80_plus },
    { label: "100+", value: duo.scores_100_plus },
    { label: "140+", value: duo.scores_140_plus },
    { label: "170+", value: duo.scores_170_plus },
    { label: "180", value: duo.scores_180 },
  ];

  const finishComparisonData = contributions.map((contribution, index) => ({
    player: contribution.player.name,
    finishes: contribution.finishes,
    color: radarColors[index % radarColors.length],
  }));

  const maxValues = {
    average: Math.max(1, ...contributions.map(c => c.average_3_darts ?? 0)),
    first9: Math.max(1, ...contributions.map(c => c.first_9 ?? 0)),
    best: Math.max(1, ...contributions.map(c => c.best_finish ?? 0)),
    s100: Math.max(1, ...contributions.map(c => c.scores_100_plus)),
    s140: Math.max(1, ...contributions.map(c => c.scores_140_plus)),
    s180: Math.max(1, ...contributions.map(c => c.scores_180)),
  };
  const radarData = [
    { metric: "Moyenne", ...Object.fromEntries(contributions.map((c, i) => [`p${i}`, normalizeRadarValue(c.average_3_darts, maxValues.average)])) },
    { metric: "First 9", ...Object.fromEntries(contributions.map((c, i) => [`p${i}`, normalizeRadarValue(c.first_9, maxValues.first9)])) },
    { metric: "Best finish", ...Object.fromEntries(contributions.map((c, i) => [`p${i}`, normalizeRadarValue(c.best_finish, maxValues.best)])) },
    { metric: "100+", ...Object.fromEntries(contributions.map((c, i) => [`p${i}`, normalizeRadarValue(c.scores_100_plus, maxValues.s100)])) },
    { metric: "140+", ...Object.fromEntries(contributions.map((c, i) => [`p${i}`, normalizeRadarValue(c.scores_140_plus, maxValues.s140)])) },
    { metric: "180", ...Object.fromEntries(contributions.map((c, i) => [`p${i}`, normalizeRadarValue(c.scores_180, maxValues.s180)])) },
  ];

  const scoringBalance = contributions.length >= 2
    ? clamp(100 - Math.abs(contributions[0].scoring_share - contributions[1].scoring_share))
    : 50;
  const averageBalance = contributions.length >= 2
    ? clamp(100 - Math.abs((contributions[0].average_3_darts ?? 0) - (contributions[1].average_3_darts ?? 0)) * 4)
    : 50;
  const finishTotal = contributions.reduce((sum, item) => sum + item.finishes, 0);
  const finishBalance = contributions.length >= 2 && finishTotal > 0
    ? clamp(100 - Math.abs(contributions[0].finishes - contributions[1].finishes) / finishTotal * 100)
    : 50;
  const complementarityIndex = Math.round(
    scoringBalance * 0.55 + averageBalance * 0.25 + finishBalance * 0.20
  );

  const scoringDensity = duo.legs_played
    ? (duo.scores_100_plus + duo.scores_140_plus * 1.8 + duo.scores_180 * 3) / duo.legs_played
    : 0;
  const offensiveIndex = Math.round(clamp(
    ((duo.average_3_darts ?? 0) / 70) * 62 +
    clamp(scoringDensity / 2.2 * 100) * 0.38
  ));
  const reliabilityIndex = Math.round(wilsonLowerBound(duo.legs_won, duo.legs_played));

  const recentForm = trendData.slice(-5);
  const previousForm = trendData.slice(-10, -5);
  const recentAverage = recentForm.length
    ? recentForm.reduce((sum, item) => sum + (item.moyenne ?? 0), 0) / recentForm.length
    : null;
  const previousAverage = previousForm.length
    ? previousForm.reduce((sum, item) => sum + (item.moyenne ?? 0), 0) / previousForm.length
    : null;
  const formDelta = recentAverage != null && previousAverage != null
    ? recentAverage - previousAverage
    : null;
  const formIndex = Math.round(clamp(
    50 +
    (formDelta ?? 0) * 4 +
    ((recentForm.reduce((sum, item) => sum + (item.winRate ?? 0), 0) / Math.max(1, recentForm.length)) - 50) * 0.55
  ));

  const resultScore = Math.round(clamp(
    duo.win_rate * 0.55 +
    reliabilityIndex * 0.30 +
    Math.min(100, duo.legs_won * 4) * 0.15
  ));

  const finishEfficiency = duo.legs_played
    ? clamp((duo.finishes / duo.legs_played) * 100)
    : 0;

  const performanceIndex = Math.round(clamp(
    resultScore * 0.40 +
    reliabilityIndex * 0.25 +
    finishEfficiency * 0.15 +
    offensiveIndex * 0.10 +
    formIndex * 0.10
  ));

  const duoTier =
    duo.matches_played >= 3 && duo.legs_won === 0
      ? { icon: "❌", label: "Duo à éviter", tone: "danger" }
      : duo.matches_played >= 4 && duo.win_rate < 30
        ? { icon: "⚠️", label: "Duo fragile", tone: "danger" }
        : duo.matches_played < 3
          ? { icon: "🌱", label: "Duo à confirmer", tone: "neutral" }
          : duo.win_rate >= 75 && reliabilityIndex >= 50 && duo.legs_played >= 16
            ? { icon: "🥇", label: "Duo Elite", tone: "elite" }
            : duo.win_rate >= 60 && reliabilityIndex >= 38
              ? { icon: "🥈", label: "Duo confirmé", tone: "good" }
              : duo.win_rate >= 50
                ? { icon: "🥉", label: "Duo performant", tone: "good" }
                : duo.win_rate >= 40 && complementarityIndex >= 72
                  ? { icon: "⚖️", label: "Duo équilibré", tone: "neutral" }
                  : duo.matches_played >= 5 && duo.win_rate < 40
                    ? { icon: "🚧", label: "Duo à reconstruire", tone: "danger" }
                    : { icon: "🎯", label: "Duo en progression", tone: "neutral" };

  const wowInsights = [
    duo.legs_won === 0
      ? "Le duo n’a encore gagné aucun leg : le résultat sportif est prioritaire sur la complémentarité."
      : duo.win_rate >= 60
        ? "Le duo transforme régulièrement ses matchs en legs gagnés."
        : "Le rendement sportif reste inférieur au potentiel observé.",
    duo.finishes === 0
      ? "Aucun finish observé : la conversion est le principal point faible."
      : finishEfficiency >= 55
        ? "La capacité à conclure les legs est un point fort."
        : "La finition reste perfectible au regard du volume joué.",
    complementarityIndex >= 72
      ? "Les profils sont complémentaires, mais cet équilibre ne suffit pas à compenser de mauvais résultats."
      : "La répartition des rôles reste encore déséquilibrée.",
    reliabilityIndex >= 45
      ? "La performance est confirmée par un volume significatif."
      : "L’indice Wilson reste prudent au regard du volume et des résultats observés.",
  ];

  const leader = [...contributions].sort((a,b) => b.scoring_share - a.scoring_share)[0];
  const summary = `${duo.player_1.name} et ${duo.player_2.name} ont disputé ${duo.matches_played} match${duo.matches_played > 1 ? "s" : ""} ensemble, pour ${duo.legs_won} legs gagnés sur ${duo.legs_played}. Leur moyenne collective est de ${fmt(duo.average_3_darts)} et leur taux de réussite de ${fmt(duo.win_rate, 1)} %.${leader ? ` ${leader.player.name} représente ${fmt(leader.scoring_share, 1)} % du scoring observé.` : ""}`;

  const kpis = [
    { label: "Matchs joués", value: duo.matches_played, detail: `${wins} victoire${wins > 1 ? "s" : ""} · ${draws} nul${draws > 1 ? "s" : ""} · ${losses} défaite${losses > 1 ? "s" : ""}`, icon: Users },
    { label: "Legs gagnés", value: `${duo.legs_won} / ${duo.legs_played}`, detail: `${fmt(conversion, 1)} % des legs`, icon: Target },
    { label: "Moyenne 3 fléchettes", value: fmt(duo.average_3_darts), detail: `First 9 : ${fmt(duo.first_9)}`, icon: Gauge },
    { label: "Taux de victoire", value: `${fmt(duo.win_rate, 1)} %`, detail: "Calcul API sur les legs observés", icon: Trophy },
    { label: "Meilleur finish", value: duo.best_finish ?? "—", detail: `${duo.finishes} finish${duo.finishes > 1 ? "es" : ""} enregistré${duo.finishes > 1 ? "s" : ""}`, icon: Crosshair },
    { label: "Scores de 180", value: duo.scores_180, detail: `${duo.scores_140_plus} scores de 140+`, icon: Award },
  ];

  return <>
    <header className="card duo-detail-hero">
      <div className="duo-avatar-stack"><span>{duo.player_1.name.slice(0,2).toUpperCase()}</span><span>{duo.player_2.name.slice(0,2).toUpperCase()}</span></div>
      <div className="duo-detail-identity"><div className="duo-wow-badges"><span className="badge">Fiche duo · Saison {data.season?.name ?? "—"}</span><span className={`duo-tier-badge duo-tier-${duoTier.tone}`}>{duoTier.icon} {duoTier.label}</span></div><h2>{duo.player_1.name} <i>+</i> {duo.player_2.name}</h2><p>{duo.team ?? "Équipe non renseignée"}</p></div>
      <div className="duo-hero-score"><span>Performance collective</span><strong>{fmt(duo.win_rate,1)}%</strong><small>{duo.legs_won} legs gagnés · fiabilité {reliabilityIndex}/100</small></div>
    </header>

    <section className="duo-wow-strip" aria-label="Indices analytiques du duo">
      <article className="card duo-wow-index duo-wow-index-primary">
        <span>Indice global</span>
        <strong>{performanceIndex}</strong>
        <small>{indexLabel(performanceIndex)}</small>
      </article>
      <article className="card duo-wow-index">
        <span>Résultat sportif</span>
        <strong>{resultScore}</strong>
        <div className="duo-wow-meter"><i style={{ width: `${resultScore}%` }}/></div>
        <small>{duo.legs_won}/{duo.legs_played} legs gagnés</small>
      </article>
      <article className="card duo-wow-index">
        <span>Capacité à finir</span>
        <strong>{Math.round(finishEfficiency)}</strong>
        <div className="duo-wow-meter"><i style={{ width: `${finishEfficiency}%` }}/></div>
        <small>{duo.finishes} finish{duo.finishes > 1 ? "es" : ""}</small>
      </article>
      <article className="card duo-wow-index">
        <span>Puissance offensive</span>
        <strong>{offensiveIndex}</strong>
        <div className="duo-wow-meter"><i style={{ width: `${offensiveIndex}%` }}/></div>
        <small>{indexLabel(offensiveIndex)}</small>
      </article>
      <article className="card duo-wow-index">
        <span>Complémentarité</span>
        <strong>{complementarityIndex}</strong>
        <div className="duo-wow-meter"><i style={{ width: `${complementarityIndex}%` }}/></div>
        <small>{indexLabel(complementarityIndex)}</small>
      </article>
      <article className="card duo-wow-index">
        <span>Fiabilité Wilson</span>
        <strong>{reliabilityIndex}</strong>
        <div className="duo-wow-meter"><i style={{ width: `${reliabilityIndex}%` }}/></div>
        <small>Borne basse à 95 %</small>
      </article>
      <article className="card duo-wow-index">
        <span>Forme actuelle</span>
        <strong>{formIndex}</strong>
        <div className="duo-wow-meter"><i style={{ width: `${formIndex}%` }}/></div>
        <small>{formDelta == null ? "Données limitées" : `${formDelta >= 0 ? "+" : ""}${fmt(formDelta)} sur la moyenne`}</small>
      </article>
    </section>

    <section className="duo-detail-kpis">{kpis.map(({ label, value, detail, icon: Icon }) => <article className="card duo-detail-kpi" key={label}><span className="duo-detail-kpi-icon"><Icon size={20}/></span><small>{label}</small><strong>{value}</strong><em>{detail}</em></article>)}</section>

    <section className="duo-detail-grid">
      <article className="card duo-panel duo-panel-wide duo-wow-analysis">
        <div className="section-heading"><div><span className="badge">Analyse 974 Darts AI</span><h3>Lecture stratégique du duo</h3></div><TrendingUp size={22}/></div>
        <div className="duo-wow-analysis-layout">
          <div>
            <p className="duo-summary">{summary}</p>
            <div className="duo-wow-insights">
              {wowInsights.map((insight, index) => <p key={insight}><span>{index + 1}</span>{insight}</p>)}
            </div>
          </div>
          <div className={`duo-wow-score-card duo-tier-card-${duoTier.tone}`}>
            <span>Signature du duo</span>
            <strong>{duoTier.icon}</strong>
            <h4>{duoTier.label}</h4>
            <small>Évaluation priorisant résultats, capacité à finir et fiabilité statistique.</small>
          </div>
        </div>
      </article>

      <article className="card duo-panel"><div className="section-heading"><div><span className="badge">Scoring</span><h3>Volumes collectifs</h3></div></div><div className="duo-chart-frame"><ResponsiveContainer width="100%" height="100%"><BarChart data={scoringData}><CartesianGrid strokeDasharray="3 3" opacity={0.15}/><XAxis dataKey="label"/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="value" name="Occurrences" radius={[8,8,0,0]}/></BarChart></ResponsiveContainer></div>
        <div className="duo-score-heatmap" aria-label="Intensité des volumes de scoring">
          {scoringData.map(item => {
            const maximum = Math.max(1, ...scoringData.map(score => score.value));
            const intensity = Math.max(0.16, item.value / maximum);
            return <div key={item.label} style={{ ["--heat" as string]: intensity }}>
              <span>{item.label}</span><strong>{item.value}</strong>
            </div>;
          })}
        </div>
      </article>

      <article className="card duo-panel"><div className="section-heading"><div><span className="badge">Contributions</span><h3>Part du scoring</h3></div></div><div className="duo-contributions">{contributions.map(c => <div className="duo-contribution" key={c.player.id}><div><strong>{c.player.name}</strong><span>{fmt(c.scoring_share,1)} % · score {c.score}</span></div><div className="duo-share-track"><i style={{ width: `${Math.min(100, Math.max(0, c.scoring_share))}%` }}/></div><small>Moy. {fmt(c.average_3_darts)} · First 9 {fmt(c.first_9)} · Best finish {c.best_finish ?? "—"}</small></div>)}</div></article>

      <article className="card duo-panel duo-panel-compact"><div className="section-heading"><div><span className="badge">Finishes joueurs</span><h3>Nombre de finishes</h3></div><Crosshair size={21}/></div><div className="duo-chart-frame"><ResponsiveContainer width="100%" height="100%"><BarChart data={finishComparisonData} layout="vertical" margin={{ top: 8, right: 28, left: 8, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" opacity={0.15}/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="player" width={80}/><Tooltip formatter={(value: number | string) => [Math.round(Number(value)), "Finishes"]}/><Bar dataKey="finishes" name="Finishes" radius={[0,8,8,0]} label={{ position: "right", formatter: (value: number) => Math.round(value) }}>{finishComparisonData.map(item => <Cell key={item.player} fill={item.color}/>)}</Bar></BarChart></ResponsiveContainer></div><p className="chart-note">Comparaison du nombre total de finishes enregistrés par chaque joueur dans les matchs du duo.</p></article>

      <article className="card duo-panel duo-panel-compact"><div className="section-heading"><div><span className="badge">Finishes</span><h3>Activité par journée</h3></div><Medal size={21}/></div><div className="finish-highlight"><span>Meilleur finish</span><strong>{duo.best_finish ?? "—"}</strong><small>{duo.finishes} finishes observés au total</small></div><div className="duo-chart-frame duo-finish-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={trendData}><CartesianGrid strokeDasharray="3 3" opacity={0.15}/><XAxis dataKey="label"/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="finishes" name="Finishes" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div></article>

      <article className="card duo-panel duo-panel-wide duo-premium-radar">
        <div className="duo-premium-radar-layout">
          <aside className="duo-radar-explanation">
            <div className="section-heading"><div><span className="badge">Comparaison</span><h3>Profil des joueurs</h3></div></div>
            <p>Comparaison des performances normalisées des deux joueurs.</p>
            <p>Chaque axe est calculé par rapport à la meilleure valeur observée dans le duo : <strong>100 = meilleure performance</strong>.</p>
            <div className="duo-radar-info-box">
              <div className="duo-radar-info-title"><Info size={19}/><strong>À propos du radar</strong></div>
              <p>Les indices sont compris entre 0 et 100. Les valeurs absentes restent à 0 et ne sont jamais inventées.</p>
              <div className="duo-radar-example">
                <span>Exemple — moyenne</span>
                <small>Meilleure valeur : {fmt(maxValues.average)}</small>
                {contributions[1] && <strong>({fmt(contributions[1].average_3_darts)} / {fmt(maxValues.average)}) × 100 = {normalizeRadarValue(contributions[1].average_3_darts, maxValues.average)}</strong>}
              </div>
            </div>
          </aside>

          <div className="duo-radar-main">
            <div className="duo-radar-player-chips">
              {contributions.map((c, index) => <div className="duo-radar-player-chip" key={c.player.id} style={{ borderColor: radarColors[index % radarColors.length] }}><i style={{ background: radarColors[index % radarColors.length] }}/><span><strong>{c.player.name}</strong><small>{duo.team ?? "Équipe non renseignée"}</small></span></div>)}
            </div>
            <div className="duo-chart-frame duo-radar-frame duo-radar-premium-chart">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="72%" margin={{ top: 28, right: 46, bottom: 24, left: 46 }}>
                  <PolarGrid gridType="polygon" stroke="rgba(148,163,184,.45)"/>
                  <PolarAngleAxis dataKey="metric" tick={{ fill: "#e2e8f0", fontSize: 12, fontWeight: 600 }}/>
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tickCount={5} tickFormatter={(value) => `${Math.round(Number(value))}`} tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false}/>
                  {contributions.map((c,i) => { const color = radarColors[i % radarColors.length]; return <Radar key={c.player.id} name={c.player.name} dataKey={`p${i}`} stroke={color} fill={color} fillOpacity={0.18} strokeWidth={2.5} dot={{ r: 4, fill: color, stroke: color, strokeWidth: 1 }}/>; })}
                  <Tooltip formatter={(value: number | string) => [`${Math.round(Number(value))} / 100`, "Indice normalisé"]} contentStyle={{ background: "#0b1728", border: "1px solid #24364d", borderRadius: 12 }} labelStyle={{ color: "#e2e8f0" }}/>
                  <Legend wrapperStyle={{ paddingTop: 10 }}/>
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <aside className="duo-radar-side-notes">
            <div className="duo-radar-mini-card"><div><Sparkles size={18}/><strong>Légende</strong></div>{contributions.map((c,index) => <p key={c.player.id}><i style={{ background: radarColors[index % radarColors.length] }}/>{c.player.name}<small>{duo.team ?? "—"}</small></p>)}</div>
            <div className="duo-radar-mini-card"><div><TrendingUp size={18}/><strong>Lecture</strong></div><p>Plus la surface est grande, plus le profil global du joueur est performant.</p><p>Toutes les valeurs affichées sont arrondies à l’entier.</p></div>
          </aside>
        </div>

        <div className="duo-radar-table-wrap">
          <table className="duo-radar-table">
            <thead><tr><th>Joueur</th><th>Moyenne<br/><small>(/100)</small></th><th>First 9<br/><small>(/100)</small></th><th>Best finish<br/><small>(/100)</small></th><th>100+<br/><small>(/100)</small></th><th>140+<br/><small>(/100)</small></th><th>180<br/><small>(/100)</small></th></tr></thead>
            <tbody>{contributions.map((c,index) => <tr key={c.player.id} style={{ ["--radar-player-color" as string]: radarColors[index % radarColors.length] }}><td><span className="duo-radar-name"><i/>{c.player.name}</span><small>{duo.team ?? "—"}</small></td><td><strong>{normalizeRadarValue(c.average_3_darts,maxValues.average)}</strong><small>({fmt(c.average_3_darts)})</small></td><td><strong>{normalizeRadarValue(c.first_9,maxValues.first9)}</strong><small>({fmt(c.first_9)})</small></td><td><strong>{normalizeRadarValue(c.best_finish,maxValues.best)}</strong><small>({c.best_finish ?? "—"})</small></td><td><strong>{normalizeRadarValue(c.scores_100_plus,maxValues.s100)}</strong><small>({c.scores_100_plus})</small></td><td><strong>{normalizeRadarValue(c.scores_140_plus,maxValues.s140)}</strong><small>({c.scores_140_plus})</small></td><td><strong>{normalizeRadarValue(c.scores_180,maxValues.s180)}</strong><small>({c.scores_180})</small></td></tr>)}</tbody>
          </table>
        </div>
        <p className="chart-note duo-radar-footnote">Les valeurs entre parenthèses sont les valeurs réelles. Les indices du radar sont normalisés à l’intérieur du duo uniquement.</p>
      </article>

      <article className="card duo-panel duo-panel-wide"><div className="section-heading"><div><span className="badge">Évolution</span><h3>Moyenne et First 9 par journée</h3></div></div><div className="duo-chart-frame duo-evolution-frame"><ResponsiveContainer width="100%" height="100%"><LineChart data={trendData}><CartesianGrid strokeDasharray="3 3" opacity={0.15}/><XAxis dataKey="label"/><YAxis/><Tooltip/><Legend/><Line type="monotone" dataKey="moyenne" name="Moyenne 3 fl." strokeWidth={3} connectNulls/><Line type="monotone" dataKey="first9" name="First 9" strokeWidth={2} connectNulls/></LineChart></ResponsiveContainer></div></article>
    </section>

    <section className="card duo-history">
      <div className="section-heading">
        <div><span className="badge">Historique prestige</span><h3>Derniers matchs du duo</h3></div>
        <div className="duo-prestige-summary">
          <span>Prestige cumulé</span>
          <strong>{data.recent_matches.reduce((sum, match) => sum + match.prestige_points, 0)}</strong>
          <small>{data.recent_matches.length} matchs analysés</small>
        </div>
      </div>
      <div className="table-scroll">
        <table className="table duo-history-table duo-smart-history">
          <thead>
            <tr>
              <th>Résultat</th>
              <th>Journée</th>
              <th>Duo adverse</th>
              <th>Difficulté</th>
              <th>Analyse</th>
              <th>Mode</th>
              <th>Legs</th>
              <th>Win %</th>
              <th>Moyenne</th>
              <th>First 9</th>
              <th>Best finish</th>
            </tr>
          </thead>
          <tbody>
            {data.recent_matches.map(match => {
              const result = matchResult(match);
              const hasOpponentDuo = Boolean(match.opponent_player_1?.id && match.opponent_player_2?.id);
              const opponentNames = match.opponent_player_1 && match.opponent_player_2
                ? `${match.opponent_player_1.name} + ${match.opponent_player_2.name}`
                : null;

              return (
                <tr key={match.match_id} className={`duo-match-row ${result.className}`}>
                  <td>
                    <span className={`duo-result-badge ${result.className}`}>
                      <i aria-hidden="true"/>
                      {result.label}
                    </span>
                  </td>
                  <td>
                    <strong>{match.round ?? "—"}</strong>
                    <small className="duo-history-date">{date(match.played_on)}</small>
                  </td>
                  <td>
                    {opponentNames ? (
                      hasOpponentDuo ? (
                        <Link
                          className="duo-opponent-link"
                          href={`/duos/${match.opponent_player_1!.id}/${match.opponent_player_2!.id}`}
                        >
                          <span className="duo-opponent-avatars" aria-hidden="true">
                            <i>{match.opponent_player_1!.name.slice(0, 2).toUpperCase()}</i>
                            <i>{match.opponent_player_2!.name.slice(0, 2).toUpperCase()}</i>
                          </span>
                          <span>
                            <strong>{opponentNames}</strong>
                            <small>{match.opponent_team ?? "Équipe non renseignée"} · Voir la fiche →</small>
                          </span>
                        </Link>
                      ) : (
                        <div className="duo-opponent-static">
                          <strong>{opponentNames}</strong>
                          <small>{match.opponent_team ?? "Équipe non renseignée"}</small>
                        </div>
                      )
                    ) : (
                      <div className="duo-opponent-static">
                        <strong>Adversaires non identifiés</strong>
                        <small>{match.opponent_team ?? match.encounter ?? "—"}</small>
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="duo-difficulty-cell" title={`Wilson adverse : ${fmt(match.opponent_wilson_score, 1)} · ${match.opponent_legs_played} legs`}>
                      <strong aria-label={`${match.opponent_difficulty_stars} étoiles sur 5`}>
                        {difficultyStars(match.opponent_difficulty_stars)}
                      </strong>
                      <small>{match.opponent_difficulty_label}</small>
                    </div>
                  </td>
                  <td>
                    <div className={`duo-performance-label ${result.className}`}>
                      <strong>{match.performance_label}</strong>
                      <small>+{match.prestige_points} prestige</small>
                    </div>
                  </td>
                  <td><span className="match-mode">{match.mode ?? "Duo"}</span></td>
                  <td><strong>{match.legs_won}/{match.legs_played}</strong></td>
                  <td><span className={wonMatch(match) ? "result-win" : match.win_rate === 50 ? "result-draw" : "result-loss"}>{fmt(match.win_rate,1)}%</span></td>
                  <td>{fmt(match.average_3_darts)}</td>
                  <td>{fmt(match.first_9)}</td>
                  <td>{match.best_finish ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>

    <div className="duo-wow-method-note">
      <strong>À propos des indices WOW</strong>
      <span>Le badge et l’indice global priorisent les résultats sportifs, la capacité à finir et la fiabilité Wilson. La puissance offensive, la complémentarité et la forme viennent ensuite. Ils ne remplacent pas les statistiques brutes et aucune donnée absente n’est inventée.</span>
    </div>

    <div className="nakka-rule">{data.meta.nakka_note}</div>
  </>;
}
