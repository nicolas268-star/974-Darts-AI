"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PlayerDashboard } from "@/lib/player/dashboard-types";

const tooltipStyle = { background: "#111c2e", border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, color: "#f6f8fb" };
const roundNumber = (label: string) => Number(label.replace(/\D/g, "")) || 0;

export function PlayerCharts({ data, championshipAverage }: { data: PlayerDashboard; championshipAverage?: number | null }) {
  const trend = [...data.trends].sort((a, b) => roundNumber(a.round) - roundNumber(b.round)).map((item) => ({
    round: item.round, moyenne: item.average_3_darts, victoire: item.win_rate, "100+": item.scores_100_plus, "140+": item.scores_140_plus, "180": item.scores_180,
  }));
  const validAverages = trend.filter((item) => item.moyenne != null);
  const best = validAverages.reduce<(typeof validAverages)[number] | null>((current, item) => !current || (item.moyenne ?? 0) > (current.moyenne ?? 0) ? item : current, null);
  const worst = validAverages.reduce<(typeof validAverages)[number] | null>((current, item) => !current || (item.moyenne ?? 0) < (current.moyenne ?? 0) ? item : current, null);
  const scoring = [
    { label: "80+", value: data.scoring.scores_80_plus }, { label: "100+", value: data.scoring.scores_100_plus }, { label: "140+", value: data.scoring.scores_140_plus }, { label: "170+", value: data.scoring.scores_170_plus }, { label: "180", value: data.scoring.scores_180 },
  ];

  return <div className="player-chart-grid">
    <section className="card player-chart-card">
      <div className="section-heading"><div><span className="eyebrow">Progression</span><h3>Moyenne par journée</h3></div><div className="chart-callouts"><span className="chart-chip good">Pic {best?.round ?? "—"}</span><span className="chart-chip">Creux {worst?.round ?? "—"}</span></div></div>
      <div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,.07)" vertical={false}/><XAxis dataKey="round" stroke="#9aa9bd" tickLine={false} axisLine={false}/><YAxis width={58} stroke="#9aa9bd" tickLine={false} axisLine={false} domain={["dataMin - 3", "dataMax + 3"]} tickFormatter={(value) => Number(value).toFixed(2)}/>
        <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value == null ? "—" : Number(value).toFixed(2), "Moyenne"]}/>
        {championshipAverage != null && <ReferenceLine y={championshipAverage} stroke="#8dc3ff" strokeDasharray="6 5" label={{ value: "Championnat", fill: "#8dc3ff", fontSize: 11 }}/>}<Line
  type="monotone"
  dataKey="moyenne"
  stroke="#ff8a3d"
  strokeWidth={3}
  dot={(props: any) => {
    const isBest = props.payload.round === best?.round;
    const isWorst = props.payload.round === worst?.round;

    return (
      <circle
        key={`moyenne-${props.payload.round}-${props.index ?? 0}`}
        cx={props.cx}
        cy={props.cy}
        r={isBest || isWorst ? 6 : 4}
        fill={isBest ? "#34d399" : isWorst ? "#fb7185" : "#ff8a3d"}
        stroke="#111c2e"
        strokeWidth={2}
      />
    );
  }}
  connectNulls
/>
      </LineChart></ResponsiveContainer></div>
    </section>
    <section className="card player-chart-card">
      <div className="section-heading"><div><span className="eyebrow">Résultats</span><h3>Taux de victoire</h3></div><span className="chart-chip">Par journée</span></div>
      <div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}><CartesianGrid stroke="rgba(255,255,255,.07)" vertical={false}/><XAxis dataKey="round" stroke="#9aa9bd" tickLine={false} axisLine={false}/><YAxis width={52} stroke="#9aa9bd" tickLine={false} axisLine={false} domain={[0,100]} tickFormatter={(value) => `${value}%`}/><Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${Number(value).toFixed(1)} %`, "Victoires"]}/><ReferenceLine y={50} stroke="rgba(255,255,255,.25)" strokeDasharray="5 5"/><Line type="monotone" dataKey="victoire" stroke="#34d399" strokeWidth={3} dot={{ r: 4 }}/></LineChart></ResponsiveContainer></div>
    </section>
    <section className="card player-chart-card player-chart-wide">
      <div className="section-heading"><div><span className="eyebrow">Scoring</span><h3>Volumes de scores</h3></div><span className="chart-chip">Saison {data.season?.name ?? "—"}</span></div>
      <div className="chart-frame chart-frame-short"><ResponsiveContainer width="100%" height="100%"><BarChart data={scoring} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}><CartesianGrid stroke="rgba(255,255,255,.07)" vertical={false}/><XAxis dataKey="label" stroke="#9aa9bd" tickLine={false} axisLine={false}/><YAxis stroke="#9aa9bd" tickLine={false} axisLine={false} allowDecimals={false}/>
<Tooltip
  contentStyle={{
    background: "#111c2e",
    border: "1px solid rgba(255,255,255,.12)",
    borderRadius: 12,
    color: "#f6f8fb",
  }}
  labelStyle={{
    color: "#f6f8fb",
    fontWeight: 600,
  }}
  itemStyle={{
    color: "#f6f8fb",
    fontWeight: 700,
  }}
  formatter={(value) => [
    `${value} occurrence${Number(value) > 1 ? "s" : ""}`,
    "Scoring",
  ]}
/>

<Bar dataKey="value" radius={[8, 8, 0, 0]}>
  {scoring.map((entry, index) => (
    <Cell
      key={entry.label}
      fill={["#8dc3ff", "#ff9a76", "#ffd073", "#c6a8ff", "#34d399"][index]}
    />
  ))}

  <LabelList
    dataKey="value"
    position="top"
    fill="#f6f8fb"
    fontSize={13}
    fontWeight={700}
    formatter={(value: number) => (value > 0 ? value : "")}
  />
</Bar>
</BarChart>
</ResponsiveContainer>
</div>
</section>
</div>;
}
