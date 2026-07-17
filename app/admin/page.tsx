
"use client";

import { Sidebar } from "@/components/Sidebar";
import { useState } from "react";
import type { ImportAnalysis } from "@/lib/import/types";

type PublishResult = {
  status: string;
  importId?: string;
  message?: string;
  seasons?: number;
  rounds?: number;
  teams?: number;
  players?: number;
  encounters?: number;
  matches?: number;
  legs?: number;
  playerLegRows?: number;
  excludedTournamentRows?: number;
};

export default function AdminPage() {
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [publication, setPublication] = useState<PublishResult | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState<"analyze" | "publish" | null>(null);

  async function send(endpoint: "analyze" | "publish") {
    if (!file) return;
    setLoading(endpoint);
    setMessage("");
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`/api/import/${endpoint}`, {
      method: "POST",
      body: form,
    });
    const payload = await response.json();
    setLoading(null);
    if (!response.ok) {
      setMessage(payload.error ?? "Opération impossible.");
      return;
    }
    if (endpoint === "analyze") {
      setAnalysis(payload);
      setPublication(null);
    } else {
      setPublication(payload);
    }
  }

  const canPublish = analysis && analysis.status !== "BLOCKED";

  return (
    <div className="dashboard">
      <Sidebar />
      <main className="main">
        <span className="badge">Sprint 3.1 • Publication Supabase</span>
        <h2 style={{ marginTop: 14 }}>Analyser puis publier le championnat</h2>

        <div className="grid">
          <section className="card">
            <input
              className="input"
              type="file"
              accept=".xlsx"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setAnalysis(null);
                setPublication(null);
              }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button
                className="btn btn-primary"
                disabled={!file || Boolean(loading)}
                onClick={() => send("analyze")}
              >
                {loading === "analyze" ? "Analyse..." : "1. Analyser"}
              </button>
              <button
                className="btn btn-secondary"
                disabled={!canPublish || Boolean(loading)}
                onClick={() => send("publish")}
              >
                {loading === "publish" ? "Publication..." : "2. Publier"}
              </button>
            </div>
          </section>
          <section className="card">
            <div className="muted">Statut analyse</div>
            <div className="metric">{analysis?.status ?? "—"}</div>
            <p>T1/T2 exclus sans bloquer la publication.</p>
          </section>
          <section className="card">
            <div className="muted">Publication</div>
            <div className="metric">{publication?.status ?? "—"}</div>
            <p>{publication?.message ?? file?.name ?? "Aucun fichier"}</p>
          </section>
        </div>

        {message && <div className="notice" style={{ marginTop: 18 }}>{message}</div>}

        {analysis && (
          <>
            <div className="kpi-grid" style={{ margin: "18px 0" }}>
              <div className="card"><div className="muted">Joueurs</div><div className="metric">{analysis.players.length}</div></div>
              <div className="card"><div className="muted">Équipes</div><div className="metric">{analysis.teams.length}</div></div>
              <div className="card"><div className="muted">Matchs</div><div className="metric">{analysis.matchCount}</div></div>
              <div className="card"><div className="muted">Legs valides</div><div className="metric">{analysis.validLegs}/{analysis.legCount}</div></div>
            </div>
            <section className="card">
              <h3>Détection</h3>
              <p><b>Saisons :</b> {analysis.seasons.join(", ")}</p>
              <p><b>Journées championnat :</b> {analysis.rounds.join(", ")}</p>
              <p><b>Lignes tournoi ignorées :</b> {analysis.excludedRows}</p>
            </section>
          </>
        )}

        {publication && publication.status !== "ALREADY_PUBLISHED" && (
          <section className="card" style={{ marginTop: 18 }}>
            <h3>Rapport de publication</h3>
            <table className="table"><tbody>
              <tr><td>Saisons</td><td>{publication.seasons}</td></tr>
              <tr><td>Journées</td><td>{publication.rounds}</td></tr>
              <tr><td>Équipes</td><td>{publication.teams}</td></tr>
              <tr><td>Joueurs</td><td>{publication.players}</td></tr>
              <tr><td>Rencontres</td><td>{publication.encounters}</td></tr>
              <tr><td>Matchs</td><td>{publication.matches}</td></tr>
              <tr><td>Legs</td><td>{publication.legs}</td></tr>
              <tr><td>Performances joueur-leg</td><td>{publication.playerLegRows}</td></tr>
              <tr><td>Lignes T1/T2 exclues</td><td>{publication.excludedTournamentRows}</td></tr>
            </tbody></table>
          </section>
        )}

        {analysis && (
          <section className="card" style={{ marginTop: 18 }}>
            <h3>Anomalies ({analysis.anomalies.length})</h3>
            <div style={{ maxHeight: 420, overflow: "auto" }}>
              <table className="table">
                <thead><tr><th>Gravité</th><th>Code</th><th>Ligne</th><th>Champ</th><th>Message</th></tr></thead>
                <tbody>{analysis.anomalies.slice(0, 300).map((item, index) => (
                  <tr key={index}>
                    <td>{item.severity}</td><td>{item.code}</td>
                    <td>{item.row ?? "—"}</td><td>{item.field}</td><td>{item.message}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
