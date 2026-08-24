"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import styles from "./audience.module.css";

type Summary = {
  days: number; views: number; visitors: number; errors: number;
  trend: { date: string; views: number }[];
  top_pages: { path: string; views: number }[];
  devices: { device: string; views: number }[];
  privacy: string;
};

export default function AudiencePage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setError("");
    fetch(`/api/audience?days=${days}`, { cache: "no-store" })
      .then(async (response) => { if (!response.ok) throw new Error("Audience indisponible"); return response.json(); })
      .then(setData).catch((reason) => setError(reason.message));
  }, [days]);
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div><span className={styles.eyebrow}>OBSERVATOIRE DU SITE</span><h1>Audience 974 Darts</h1><p>Comprendre les consultations du site sans identifier personnellement les visiteurs.</p></div>
        <div className={styles.periods}>{[7, 30, 90].map((value) => <button key={value} className={days === value ? styles.active : ""} onClick={() => setDays(value)}>{value} jours</button>)}</div>
      </section>
      {error ? <p className={styles.error}>{error}</p> : !data ? <p className={styles.loading}>Chargement…</p> : <>
        <section className={styles.cards}>
          <article><small>Pages vues</small><strong>{data.views}</strong><span>sur {data.days} jours</span></article>
          <article><small>Visiteurs estimés</small><strong>{data.visitors}</strong><span>sessions anonymes</span></article>
          <article><small>Moyenne quotidienne</small><strong>{(data.views / data.days).toFixed(1).replace(".", ",")}</strong><span>pages vues / jour</span></article>
          <article><small>Erreurs observées</small><strong>{data.errors}</strong><span>aucun détail personnel</span></article>
        </section>
        <section className={styles.grid}>
          <article className={styles.panel}><h2>Évolution des visites</h2><div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><LineChart data={data.trend}><CartesianGrid stroke="#263b55" vertical={false}/><XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} stroke="#91acd0"/><YAxis allowDecimals={false} stroke="#91acd0"/><Tooltip/><Line dataKey="views" stroke="#ff9e2b" strokeWidth={3} dot={false}/></LineChart></ResponsiveContainer></div></article>
          <article className={styles.panel}><h2>Appareils</h2><div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><BarChart data={data.devices}><CartesianGrid stroke="#263b55" vertical={false}/><XAxis dataKey="device" stroke="#91acd0"/><YAxis allowDecimals={false} stroke="#91acd0"/><Tooltip/><Bar dataKey="views" fill="#43d7b2" radius={[8,8,0,0]}/></BarChart></ResponsiveContainer></div></article>
        </section>
        <section className={styles.panel}><h2>Pages les plus consultées</h2><div className={styles.table}>{data.top_pages.length ? data.top_pages.map((item, index) => <div key={item.path}><b>#{index + 1}</b><code>{item.path}</code><strong>{item.views}</strong><span>vue(s)</span></div>) : <p>Les premières visites apparaîtront ici.</p>}</div></section>
        <aside className={styles.privacy}>🛡️ {data.privacy} Les visites des pages Administration, connexion et réinitialisation sont exclues.</aside>
      </>}
    </main>
  );
}
