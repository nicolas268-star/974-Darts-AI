"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./TournamentRefreshPanel.module.css";

export type TournamentRefreshPreview = {
  preview_id: string;
  changes: { field: string; before: unknown; after: unknown }[];
  warnings: string[];
  can_apply: boolean;
  source_revision?: string;
  public_url?: string;
};
const value = (data: unknown) => data == null ? "Non disponible" : typeof data === "object" ? JSON.stringify(data, null, 2) : String(data);
const fieldLabels: Record<string, string> = { matches: "Rencontres", players: "Participants", participants: "Participants", duos: "Doublettes", bracket: "Tableaux éliminatoires", round_robin: "Poules", format: "Format sportif", format_label: "Format sportif", final_standings: "Classement final", official_results: "Résultats officiels", winner: "Vainqueur", runner_up: "Finaliste", source_revision: "Version de la source", summary: "Résumé du tournoi" };

export function TournamentRefreshPanel({ code, href, disabled = false }: { code: string; href?: string; disabled?: boolean }) {
  const [preview, setPreview] = useState<TournamentRefreshPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function request(action: "preview" | "apply") {
    if (busy || disabled || (action === "apply" && (!preview?.can_apply || !confirmed))) return;
    setBusy(true); setError(""); setNotice("");
    if (action === "preview") { setPreview(null); setConfirmed(false); }
    try {
      const response = await fetch(`/api/tournaments/${encodeURIComponent(code)}/refresh/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify(action === "preview" ? {} : { preview_id: preview?.preview_id, confirmed: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Actualisation impossible.");
      if (action === "preview") setPreview(data);
      else { setPreview(null); setConfirmed(false); setNotice("La fiche a été actualisée. Les points officiels publiés sont conservés."); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Actualisation impossible."); }
    finally { setBusy(false); }
  }
  return <section className={styles.panel} aria-label="Actualisation de la fiche tournoi">
    <div className={styles.heading}><div><h3>Fiche publique du tournoi</h3><p>Consultez les différences avant d’actualiser les résultats depuis Nakka.</p></div>{href && <Link href={href} target="_blank" rel="noopener noreferrer">Ouvrir la fiche ↗</Link>}</div>
    <button type="button" disabled={busy || disabled} onClick={() => void request("preview")}>{busy ? "Analyse en cours…" : "Actualiser depuis Nakka"}</button>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.success} role="status">{notice}</p>}
    {preview && <div className={styles.preview}>
      <h4>Aperçu des différences</h4>
      {preview.source_revision && <p className={styles.revision}>Version source : {preview.source_revision}</p>}
      {preview.changes.length ? <div className={styles.scroll}><table><thead><tr><th>Élément</th><th>Version publiée</th><th>Nouvelle source</th></tr></thead><tbody>{preview.changes.map((change, index) => <tr key={`${change.field}-${index}`}><th scope="row">{fieldLabels[change.field] ?? change.field}</th><td><pre>{value(change.before)}</pre></td><td><pre>{value(change.after)}</pre></td></tr>)}</tbody></table></div> : <p>Aucune différence détectée.</p>}
      {!!preview.warnings.length && <ul className={styles.warning}>{preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
      {preview.can_apply && <><label className={styles.confirm}><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />Je confirme les différences et l’actualisation de cette même fiche.</label><button type="button" disabled={busy || !confirmed} onClick={() => void request("apply")}>Confirmer l’actualisation</button></>}
      {!preview.can_apply && <p className={styles.warning}>Les anomalies signalées doivent être validées dans le circuit de cette compétition avant publication.</p>}
    </div>}
  </section>;
}
