"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./CommitteeRankingPublication.module.css";

type EventStatus = "DRAFT" | "VALIDATED" | "PUBLISHED";
type ResultRow = {
  player_name: string;
  club: string;
  gender: "M" | "F" | "X";
  placement: string;
  placement_label: string;
  points: number;
  display_order: number;
};
type Preview = {
  event: {
    id: string;
    title: string;
    event_date: string;
    ranking_category: string;
    status: EventStatus;
    source_url: string;
    validated_at: string | null;
    published_at: string | null;
  };
  results: ResultRow[];
  summary: { players_awarded: number; points_awarded: number; source_matches: number };
};

const EVENT_ID = "club-open-kaz-2026-09-13";
const API = "/api/admin/backend/api/v1/committee-ranking";
const CLUB_OPTIONS = [
  "Kaz A Darts 974",
  "Papangue Darts Club",
  "3 B Darts Club",
  "Tampon Darts Club",
  "Non licencié",
] as const;
const PLACEMENT_POINTS: Record<string, number> = {
  WINNER: 10,
  RUNNER_UP: 8,
  SEMI_FINALIST: 6,
  QUARTER_FINALIST: 4,
  ROUND_OF_16: 2,
};

function messageOf(value: unknown) {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return String(record.detail ?? record.error ?? "Une erreur est survenue.");
  }
  return "Une erreur est survenue.";
}

export default function CommitteeRankingPublication() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [directorConfirmed, setDirectorConfirmed] = useState(false);
  const [publicationConfirmed, setPublicationConfirmed] = useState(false);
  const [busy, setBusy] = useState<"load" | "validate" | "publish" | null>("load");
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setBusy("load");
    setNotice(null);
    try {
      const response = await fetch(`${API}/events/${EVENT_ID}/preview`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(messageOf(body));
      setPreview(body);
      setResults(body.results ?? []);
      setDirectorConfirmed(body.event?.status === "VALIDATED" || body.event?.status === "PUBLISHED");
      setPublicationConfirmed(body.event?.status === "PUBLISHED");
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Prévisualisation indisponible." });
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const status = preview?.event.status ?? "DRAFT";
  const clubsConfirmed = results.length > 0 && results.every((row) => CLUB_OPTIONS.some((club) => club === row.club));
  const canValidate = directorConfirmed && clubsConfirmed && status === "DRAFT" && !busy;
  const canPublish = publicationConfirmed && status === "VALIDATED" && !busy;
  const statusLabel = status === "PUBLISHED" ? "Publié" : status === "VALIDATED" ? "Validé" : "À valider";
  const total = useMemo(() => results.reduce((sum, row) => sum + row.points, 0), [results]);

  function updateRow(index: number, patch: Partial<ResultRow>) {
    setResults((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  function updateClub(index: number, club: string) {
    setResults((current) => current.map((row, rowIndex) => rowIndex === index ? {
      ...row,
      club,
      points: club === "Non licencié" ? 0 : (PLACEMENT_POINTS[row.placement] ?? row.points),
    } : row));
  }

  async function validate() {
    setBusy("validate");
    setNotice(null);
    try {
      const response = await fetch(`${API}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: EVENT_ID, confirmed: true, results }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(messageOf(body));
      setPreview((current) => current ? { ...current, event: { ...current.event, status: "VALIDATED", validated_at: body.validated_at } } : current);
      setNotice({ kind: "ok", text: "Étape 4 enregistrée : résultats validés officiellement." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Validation impossible." });
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    setBusy("publish");
    setNotice(null);
    try {
      const response = await fetch(`${API}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: EVENT_ID, confirmed: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(messageOf(body));
      setPreview((current) => current ? { ...current, event: { ...current.event, status: "PUBLISHED", published_at: body.published_at } } : current);
      setNotice({ kind: "ok", text: "Étape 5 terminée : points publiés au classement individuel." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Publication impossible." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.topline}><Link href="/admin">← Administration</Link><span className={styles.status}>{statusLabel}</span></div>
      <header className={styles.hero}>
        <div><p>CLASSEMENT INDIVIDUEL 974</p><h1>Validation & publication</h1><span>Open Kaz A Darts · 13 septembre 2026 · Catégorie E</span></div>
        <div className={styles.heroScore}><strong>{preview?.summary.players_awarded ?? results.length}</strong><span>joueurs classés</span><b>{total} points attribués</b></div>
      </header>

      <ol className={styles.steps}>
        <li className={styles.done}><b>1</b><span>Source T5<strong>Importée</strong></span></li>
        <li className={styles.done}><b>2</b><span>Barème E<strong>10 · 8 · 6 · 4 · 2</strong></span></li>
        <li className={styles.done}><b>3</b><span>Contrôle<strong>{results.length} joueurs</strong></span></li>
        <li className={status !== "DRAFT" ? styles.done : styles.current}><b>4</b><span>Validation DS<strong>{status === "DRAFT" ? "À confirmer" : "Enregistrée"}</strong></span></li>
        <li className={status === "PUBLISHED" ? styles.done : ""}><b>5</b><span>Publication<strong>{status === "PUBLISHED" ? "En ligne" : "En attente"}</strong></span></li>
      </ol>

      {notice && <div className={`${styles.notice} ${styles[notice.kind]}`}>{notice.text}</div>}

      <section className={styles.panel}>
        <div className={styles.heading}><div><p>APERÇU DES POINTS</p><h2>Résultats calculés automatiquement</h2></div><a href="https://n01darts.com/n01/tournament/comp.php?id=t_aKyY_3246" target="_blank" rel="noreferrer">Ouvrir la source N01 ↗</a></div>
        {busy === "load" ? <div className={styles.loading}>Lecture des résultats T5…</div> : (
          <div className={styles.tableScroll}><table><thead><tr><th>Rang</th><th>Joueur</th><th>Résultat</th><th>Club</th><th>Catégorie</th><th>Points</th></tr></thead><tbody>
            {results.map((row, index) => <tr key={`${row.player_name}-${index}`}><td>{index + 1}</td><td><strong>{row.player_name}</strong></td><td>{row.placement_label}</td><td><select aria-label={`Club de ${row.player_name}`} value={row.club ?? ""} disabled={status !== "DRAFT"} onChange={(event) => updateClub(index, event.target.value)}><option value="">À confirmer</option>{CLUB_OPTIONS.map((club) => <option key={club} value={club}>{club}</option>)}</select></td><td><select aria-label={`Catégorie de ${row.player_name}`} value={row.gender} disabled={status !== "DRAFT"} onChange={(event) => updateRow(index, { gender: event.target.value as ResultRow["gender"] })}><option value="X">À confirmer</option><option value="M">Homme</option><option value="F">Femme</option></select></td><td><b className={row.points === 0 ? styles.noPoints : styles.points}>{row.points === 0 ? "0" : `+${row.points}`}</b></td></tr>)}
          </tbody></table></div>
        )}
      </section>

      <section className={styles.approvalGrid}>
        <article className={`${styles.approval} ${status !== "DRAFT" ? styles.approved : ""}`}>
          <div className={styles.stepNumber}>4</div><p>VALIDATION OFFICIELLE</p><h2>Validation du Directeur sportif</h2><span>Je confirme que le tableau T5 correspond aux résultats officiels et que le barème de catégorie E est correctement appliqué.</span>
          <label><input type="checkbox" checked={directorConfirmed} disabled={status !== "DRAFT"} onChange={(event) => setDirectorConfirmed(event.target.checked)} /><strong>Résultats validés par le Directeur sportif</strong></label>
          {!clubsConfirmed && status === "DRAFT" ? <small>Le club de chaque joueur doit être confirmé avant validation.</small> : null}
          <button type="button" disabled={!canValidate} onClick={() => void validate()}>{busy === "validate" ? "Enregistrement…" : status !== "DRAFT" ? "✓ Validation enregistrée" : "Enregistrer la validation officielle"}</button>
        </article>

        <article className={`${styles.approval} ${styles.publish} ${status === "PUBLISHED" ? styles.approved : ""}`}>
          <div className={styles.stepNumber}>5</div><p>MISE EN LIGNE</p><h2>Publication au classement</h2><span>Cette action rend immédiatement les points visibles dans les classements Mixte, Hommes et Femmes de la saison 2026–2027.</span>
          <label><input type="checkbox" checked={publicationConfirmed} disabled={status !== "VALIDATED"} onChange={(event) => setPublicationConfirmed(event.target.checked)} /><strong>Je confirme la publication des points</strong></label>
          <button type="button" disabled={!canPublish} onClick={() => void publish()}>{busy === "publish" ? "Publication…" : status === "PUBLISHED" ? "✓ Classement publié" : "Publier au classement individuel"}</button>
        </article>
      </section>

      <footer className={styles.footer}><span>Traçabilité : source N01 · validation humaine obligatoire · publication horodatée</span><Link href="/competitions/classement-individuel">Voir le classement public →</Link></footer>
    </main>
  );
}
