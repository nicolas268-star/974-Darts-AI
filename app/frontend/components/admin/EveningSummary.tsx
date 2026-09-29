"use client";

import { useEffect, useRef, useState } from "react";
import { Clipboard, ExternalLink, LoaderCircle, MessageCircle, RefreshCw, Sparkles } from "lucide-react";
import styles from "@/app/admin/visibility/visibility.module.css";

type Evening = { id: string; round: string; date: string | null; home: string; away: string; home_score: number; away_score: number };
type Summary = { whatsapp: string; facebook: string; mode: "ai" | "statistics"; note: string; ai_available: boolean;
  evening: { url: string; matches: number; legs: number; players: number }; fingerprint: string };

async function responseJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Le résumé est indisponible.");
  return data;
}

export default function EveningSummary({ onFacebookReady }: { onFacebookReady: (text: string) => void }) {
  const [evenings, setEvenings] = useState<Evening[]>([]);
  const [selected, setSelected] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [draft, setDraft] = useState("");
  const [edited, setEdited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [reload, setReload] = useState(0);
  const mounted = useRef(true);
  const generation = useRef(0);

  function resetPreview() {
    setSummary(null); setDraft(""); setEdited(false); setStatus(""); setError(""); setBusy(true);
  }

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/visibility/evenings", { signal: controller.signal, cache: "no-store" })
      .then(responseJson<{ evenings: Evening[] }>)
      .then((data) => { setEvenings(data.evenings); if (!data.evenings.length) setBusy(false); setSelected((current) => data.evenings.some((item) => item.id === current) ? current : data.evenings[0]?.id ?? ""); })
      .catch((reason) => { if (!controller.signal.aborted) { setBusy(false); setError(reason instanceof Error ? reason.message : "Impossible de charger les rencontres."); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    if (!selected) return () => controller.abort();
    fetch(`/api/admin/visibility/summary?result_id=${encodeURIComponent(selected)}`, { signal: controller.signal, cache: "no-store" })
      .then(responseJson<Summary>)
      .then((data) => { if (current === generation.current) { setSummary(data); setDraft(data.whatsapp); } })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Résumé indisponible."); })
      .finally(() => { if (!controller.signal.aborted && current === generation.current) setBusy(false); });
    return () => controller.abort();
  }, [selected, reload]);

  async function generate(preserveDraft = false) {
    const data = await responseJson<Summary>(await fetch("/api/admin/visibility/summary", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ result_id: selected }),
    }));
    if (!mounted.current) throw new Error("La page a été fermée.");
    setSummary(data);
    if (!preserveDraft) { setDraft(data.whatsapp); setEdited(false); }
    return data;
  }

  async function prepareFacebook() {
    if (!summary || busy) return;
    setBusy(true); setError(""); setStatus("");
    try {
      const data = summary.mode === "ai" || !summary.ai_available ? summary : await generate(true);
      onFacebookReady(data.facebook);
      setStatus("Version officielle chargée dans le bloc Facebook ci-dessous.");
      document.getElementById("facebook-publication")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Préparation impossible."); }
    finally { if (mounted.current) setBusy(false); }
  }

  async function shareWhatsApp() {
    if (!summary || busy || !draft.trim()) return;
    // Reserve the tab during the user gesture so asynchronous AI generation is not blocked.
    const popup = window.open("about:blank", "_blank");
    if (popup) { popup.opener = null; popup.document.title = "Préparation du résumé 974Darts…"; }
    setBusy(true); setError(""); setStatus("");
    try {
      let text = draft;
      if (!edited && summary.ai_available && summary.mode !== "ai") text = (await generate()).whatsapp;
      if (!mounted.current) { popup?.close(); return; }
      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      if (popup && !popup.closed) popup.location.replace(url);
      else window.location.assign(url);
      setStatus("WhatsApp ouvert : choisis le groupe Fléchettes Réunion, puis valide l’envoi.");
    } catch (reason) {
      popup?.close();
      setError(reason instanceof Error ? reason.message : "Partage impossible. Tu peux copier le texte.");
    } finally { if (mounted.current) setBusy(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(draft); setStatus("Résumé copié."); }
    catch { setError("La copie automatique est bloquée. Sélectionne le texte du résumé pour le copier."); }
  }

  return <section className={`${styles.composer} ${styles.whatsapp}`} aria-labelledby="evening-title">
    <header><div><span>Groupe interne · Fléchettes Réunion</span><h2 id="evening-title"><MessageCircle size={26}/> Résumé de soirée WhatsApp</h2></div><span className={styles.badge}>{summary?.mode === "ai" ? "Synthèse IA" : "Analyse statistique"}</span></header>
    <p className={styles.intro}>Choisis une rencontre publiée. Retrouve le résultat, les temps forts et les performances à partager au groupe.</p>
    <div className={styles.eventChoice}><label htmlFor="visibility-evening">Rencontre interclubs<select id="visibility-evening" value={selected} disabled={busy || loading} onChange={(event) => { resetPreview(); setSelected(event.target.value); }}>
      {!evenings.length && <option value="">{loading ? "Chargement…" : "Aucune rencontre publiée disponible"}</option>}
      {evenings.map((evening) => <option key={evening.id} value={evening.id}>{evening.round} · {evening.date ? new Date(`${evening.date}T12:00:00`).toLocaleDateString("fr-FR") : "Date à confirmer"} · {evening.home} {evening.home_score}–{evening.away_score} {evening.away}</option>)}
    </select></label><button className={styles.secondaryButton} onClick={() => { resetPreview(); setLoading(true); setReload((value) => value + 1); }} disabled={busy || loading} aria-label="Actualiser les rencontres"><RefreshCw size={18}/></button></div>
    {summary && <div className={styles.summaryNumbers}><span><b>{summary.evening.matches}</b> matchs</span><span><b>{summary.evening.legs}</b> legs</span><span><b>{summary.evening.players}</b> joueurs</span><a href={summary.evening.url} target="_blank" rel="noopener noreferrer">Voir les statistiques <ExternalLink size={14}/></a></div>}
    {busy && <p className={styles.progress} role="status"><LoaderCircle className={styles.spin} size={18}/> Préparation du résumé…</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!loading && !evenings.length && !error && <p className={styles.intro}>Les rencontres apparaissent ici après publication et validation de leurs statistiques.</p>}
    {summary && <>
      <label className={styles.draftLabel} htmlFor="whatsapp-draft">Texte pour le groupe <small>Tu peux le modifier avant de partager.</small></label>
      <textarea id="whatsapp-draft" className={styles.summaryDraft} value={draft} rows={15} maxLength={6000} disabled={busy} onChange={(event) => { setDraft(event.target.value); setEdited(true); setStatus(""); }}/>
      <div className={styles.summaryActions}><button className={styles.whatsappButton} onClick={shareWhatsApp} disabled={busy || !draft.trim()}><MessageCircle size={19}/> {summary.ai_available && summary.mode !== "ai" && !edited ? "Analyser et ouvrir WhatsApp" : "Ouvrir dans WhatsApp"}</button>
        <button className={styles.secondaryButton} onClick={copy} disabled={busy || !draft.trim()}><Clipboard size={17}/> Copier</button>
        <button className={styles.secondaryButton} onClick={prepareFacebook} disabled={busy}><Sparkles size={17}/> Préparer la version Facebook</button></div>
      <p className={styles.intro}>{summary.note}{edited ? " Tes modifications seront conservées pour WhatsApp." : ""}</p>
      <p className={styles.shareHelp}>Le bouton ouvre le résumé dans WhatsApp. Sélectionne ton groupe, puis confirme l’envoi dans WhatsApp.</p>
    </>}
    {status && <p className={styles.success} role="status">{status}</p>}
  </section>;
}
