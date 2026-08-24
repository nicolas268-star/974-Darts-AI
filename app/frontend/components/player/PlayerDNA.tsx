"use client";

import { Activity, Brain, Crosshair, Dna, Flame, Gauge, Sparkles, Target, TrendingUp, Zap } from "lucide-react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import type { PlayerDNAResponse } from "@/lib/player/dna-types";

const labels: Record<string, string> = {
  power: "Puissance", consistency: "Régularité", finishes: "Finishes",
  progression: "Progression", volume: "Volume", mastery: "Maîtrise",
};
const icons: Record<string, typeof Zap> = {
  power: Zap, consistency: Activity, finishes: Crosshair,
  progression: TrendingUp, volume: Flame, mastery: Brain,
};
const tone = (value: number) => value >= 75 ? "elite" : value >= 60 ? "strong" : value >= 45 ? "balanced" : "develop";
const number = (value: number | null | undefined, digits = 1) => value == null ? "—" : new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);

export function PlayerDNA({ data }: { data: PlayerDNAResponse }) {
  const radar = Object.entries(data.indices).map(([key, value]) => ({ subject: labels[key] ?? key, value, fullMark: 100 }));
  const maximumHeat = Math.max(1, ...data.heatmap.map((item) => item.value));

  return <section className="player-dna-section">
    <div className="section-heading player-dna-heading">
      <div><span className="eyebrow"><Dna size={14}/> ADN joueur</span><h3>Profil analytique interne</h3><p>Lecture synthétique dérivée exclusivement des statistiques disponibles.</p></div>
      <span className="chart-chip">Données vérifiées</span>
    </div>

    <div className="player-dna-layout">
      <article className="card player-dna-radar-card">
        <div className="player-dna-card-title"><div><span className="eyebrow">Signature</span><h4>{data.style.label}</h4></div><span className={`player-style-pill dna-${tone(data.dominance.score)}`}><Sparkles size={14}/> {data.dominance.label}</span></div>
        <div className="player-dna-radar-frame"><ResponsiveContainer width="100%" height="100%"><RadarChart data={radar} outerRadius="72%"><PolarGrid stroke="rgba(255,255,255,.12)"/><PolarAngleAxis dataKey="subject" tick={{ fill: "#a8b6c9", fontSize: 11 }}/><PolarRadiusAxis angle={30} domain={[0,100]} tick={false} axisLine={false}/><Tooltip contentStyle={{ background:"#0d1828", border:"1px solid rgba(255,255,255,.12)", borderRadius:12, color:"#f8fafc" }} formatter={(value) => [`${value} / 100`, "Indice interne"]}/><Radar dataKey="value" stroke="#8dc3ff" fill="#8dc3ff" fillOpacity={0.22} strokeWidth={2.5}/></RadarChart></ResponsiveContainer></div>
        <p className="player-dna-style-description">{data.style.description}</p>
      </article>

      <article className="card player-domination-card">
        <span className="eyebrow"><Gauge size={14}/> Indice de domination</span>
        <div className="domination-score"><strong>{data.dominance.score}</strong><small>/ 100</small></div>
        <div className="domination-track"><i style={{ width: `${data.dominance.score}%` }}/></div>
        <h4>{data.dominance.label}</h4>
        <p>Synthèse pondérée de la production, des résultats, de la régularité, des finishes et de la dynamique observée.</p>
        <div className="domination-observed-grid">
          <span><small>Moyenne</small><strong>{number(data.observed.average_3_darts,2)}</strong></span>
          <span><small>Win rate</small><strong>{number(data.observed.win_rate)} %</strong></span>
          <span><small>Best finish</small><strong>{data.observed.best_finish ?? "—"}</strong></span>
          <span><small>Dynamique</small><strong>{data.observed.progression_delta >= 0 ? "+" : ""}{number(data.observed.progression_delta,2)}</strong></span>
        </div>
      </article>
    </div>

    <div className="player-dna-index-grid">
      {Object.entries(data.indices).map(([key, value]) => {
        const Icon = icons[key] ?? Target;
        return <article className={`card player-dna-index dna-${tone(value)}`} key={key}>
          <span className="player-dna-index-icon"><Icon size={18}/></span>
          <div><span>{labels[key] ?? key}</span><strong>{value}</strong></div>
          <div className="player-dna-index-track"><i style={{ width: `${value}%` }}/></div>
        </article>;
      })}
    </div>

    <div className="player-heatmap-layout">
      <article className="card player-scoring-heatmap">
        <div className="player-dna-card-title"><div><span className="eyebrow">Heatmap scoring</span><h4>Intensité des scores observés</h4></div><Flame size={21}/></div>
        <div className="heatmap-list">
          {data.heatmap.map((item) => {
            const intensity = item.value / maximumHeat;
            return <div className={`heatmap-row ${item.key === "no_score" ? "is-negative" : ""}`} key={item.key}>
              <span>{item.label}</span><div className="heatmap-track"><i style={{ width: `${Math.max(item.value ? 5 : 0, intensity * 100)}%`, opacity: 0.35 + intensity * 0.65 }}/></div><strong>{item.value}</strong>
            </div>;
          })}
        </div>
      </article>

      <article className="card player-dna-analysis">
        <span className="eyebrow">Lecture automatique</span>
        <h4>{data.player.name} · {data.style.label}</h4>
        <p>L’indice dominant est <strong>{labels[data.style.key] ?? data.style.key}</strong>. {data.strengths.length ? <>Les points forts actuels sont {data.strengths.map((key) => labels[key] ?? key).join(", ")}.</> : <>Aucun point fort ne se détache encore nettement.</>} {data.development_areas.length ? <>Les principaux axes de développement sont {data.development_areas.map((key) => labels[key] ?? key).join(", ")}.</> : <>Le profil ne présente pas de faiblesse majeure.</>}</p>
        <div className="player-dna-notice"><Target size={17}/><span>Ces valeurs sont des indices analytiques internes. Elles ne représentent ni une statistique officielle ni une précision aux doubles.</span></div>
      </article>
    </div>
  </section>;
}
