"use client";
import Link from "next/link";
import { ArrowLeftRight, Scale, ShieldCheck, Target } from "lucide-react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { PlayerComparisonResponse } from "@/lib/player/compare-types";
const labels: Record<string, string> = {
  power: "Puissance",
  consistency: "Régularité",
  finishes: "Finishes",
  progression: "Progression",
  volume: "Volume",
  mastery: "Maîtrise",
};
const n = (v: number | null | undefined, d = 1) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("fr-FR", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      }).format(v);
export function PlayerComparison({ data }: { data: PlayerComparisonResponse }) {
  const radar = data.dna_dimensions.map((x) => ({
    subject: labels[x.key] ?? x.key,
    left: x.left,
    right: x.right,
  }));
  return (
    <section className="player-compare-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            <ArrowLeftRight size={14} /> Comparaison joueurs
          </span>
          <h3>Face-à-face analytique</h3>
        </div>
        <span className="chart-chip">Données vérifiées</span>
      </div>
      <article className="card compare-hero">
        <div>
          <h4>{data.left.player.name}</h4>
          <span>{data.left.dna.style.label}</span>
        </div>
        <strong>VS</strong>
        <div>
          <h4>{data.right.player.name}</h4>
          <span>{data.right.dna.style.label}</span>
        </div>
      </article>
      <article className="card compare-probability">
        <span className="eyebrow">
          <Scale size={14} /> Estimation analytique
        </span>
        <div className="probability-row">
          <strong>{n(data.summary.analytical_probability.left)}%</strong>
          <div>
            <i
              style={{ width: `${data.summary.analytical_probability.left}%` }}
            />
          </div>
          <strong>{n(data.summary.analytical_probability.right)}%</strong>
        </div>
        <small>Estimation interne non officielle.</small>
      </article>
      <div className="compare-main-grid">
        <article className="card">
          <h4>ADN superposé</h4>
          <div className="compare-radar-frame">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radar} outerRadius="72%">
                <PolarGrid stroke="rgba(255,255,255,.12)" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fill: "#a8b6c9", fontSize: 11 }}
                />
                <PolarRadiusAxis
                  domain={[0, 100]}
                  tick={false}
                  axisLine={false}
                />
                <Tooltip />
                <Radar
                  name={data.left.player.name}
                  dataKey="left"
                  stroke="#8dc3ff"
                  fill="#8dc3ff"
                  fillOpacity={0.18}
                />
                <Radar
                  name={data.right.player.name}
                  dataKey="right"
                  stroke="#ff8a3d"
                  fill="#ff8a3d"
                  fillOpacity={0.14}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </article>
        <article className="card compare-metrics-card">
          <h4>KPI comparés</h4>
          {data.metrics.map((m) => (
            <div
              className={`compare-metric advantage-${m.advantage}`}
              key={m.key}
            >
              <strong>
                {n(
                  m.left,
                  m.key === "legs_won" || m.key === "best_finish" ? 0 : 1,
                )}
              </strong>
              <span>{m.label}</span>
              <strong>
                {n(
                  m.right,
                  m.key === "legs_won" || m.key === "best_finish" ? 0 : 1,
                )}
              </strong>
            </div>
          ))}
        </article>
      </div>
      <div className="compare-player-links">
        <Link href={`/players/${data.left.player.id}`}>
          <Target size={16} /> {data.left.player.name}
        </Link>
        <Link href={`/players/${data.right.player.id}`}>
          <Target size={16} /> {data.right.player.name}
        </Link>
      </div>
      <article className="compare-transparency">
        <ShieldCheck size={17} /> Indicateurs internes dérivés des données
        observées, sans prédiction officielle.
      </article>
    </section>
  );
}
