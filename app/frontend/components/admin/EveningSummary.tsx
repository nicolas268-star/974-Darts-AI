"use client";

import { useEffect, useRef, useState } from "react";
import { Clipboard, ExternalLink, LoaderCircle, MessageCircle, RefreshCw, Sparkles } from "lucide-react";
import type { BdcVisibilityOption, TournamentVisibilityOption, VisibilitySummary as Summary } from "@/lib/visibility-summary";
import { signVisibilitySummary, visibilitySelection } from "@/lib/visibility-summary";
import styles from "@/app/admin/visibility/visibility.module.css";

type Evening = { id: string; round: string; date: string | null; home: string; away: string; home_score: number; away_score: number };
type Automation = { running: boolean; publication_enabled?: boolean; next_at: string | null;
  recent: { title: string; status: string; message: string; retry_expired: boolean; published_result_id?: string | null }[] };

async function responseJson<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Le résumé est indisponible.");
  return data;
}

export default function EveningSummary({ bdcOptions, onFacebookReady }: { bdcOptions: BdcVisibilityOption[]; onFacebookReady: (text: string) => void }) {
  const [evenings, setEvenings] = useState<Evening[]>([]);
  const [tournaments, setTournaments] = useState<TournamentVisibilityOption[]>([]);
  const [automation, setAutomation] = useState<Automation | null>(null);
  const [selected, setSelected] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [draft, setDraft] = useState("");
  const [matchContext, setMatchContext] = useState("");
  const [edited, setEdited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [catalogErrors, setCatalogErrors] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [reload, setReload] = useState(0);
  const mounted = useRef(true);
  const generation = useRef(0);
  const selectedRef = useRef("");
  const catalogs = useRef<{ evenings: Evening[]; tournaments: TournamentVisibilityOption[] }>({ evenings: [], tournaments: [] });
  const selection = visibilitySelection(selected, bdcOptions);
  const isTournament = selection?.kind === "tournament";
  const isBdc = selection?.kind === "bdc";
  const contextChanged = matchContext !== (summary?.context ?? "");

  function resetPreview() {
    generation.current += 1;
    setSummary(null); setDraft(""); setMatchContext(""); setEdited(false); setStatus(""); setError(""); setBusy(true);
  }

  function selectEvent(id: string) {
    resetPreview(); selectedRef.current = id; setSelected(id);
    if (!id) setBusy(false);
  }

  function isCurrent(current: number) { return mounted.current && current === generation.current; }

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal, cache: "no-store" as const };
    Promise.allSettled([
      fetch("/api/admin/visibility/evenings", options).then(responseJson<{ evenings: Evening[]; automation?: Automation }>).then(data => {
        if (!Array.isArray(data.evenings)) throw new Error("Catalogue interclubs invalide.");
        return data;
      }),
      fetch("/api/admin/visibility/tournaments", options).then(responseJson<{ tournaments: TournamentVisibilityOption[] }>).then(data => {
        if (!Array.isArray(data.tournaments)) throw new Error("Catalogue tournois invalide.");
        return data;
      }),
    ]).then(([interclubs, committee]) => {
      if (controller.signal.aborted) return;
      const errors: string[] = [];
      if (interclubs.status === "fulfilled") {
        catalogs.current.evenings = interclubs.value.evenings;
        setEvenings(interclubs.value.evenings); setAutomation(interclubs.value.automation ?? null);
      } else errors.push("Les rencontres interclubs n’ont pas pu être chargées. Les manches BDC restent disponibles.");
      if (committee.status === "fulfilled") {
        catalogs.current.tournaments = committee.value.tournaments;
        setTournaments(committee.value.tournaments);
      } else errors.push("Les tournois n’ont pas pu être chargés. Les autres événements restent disponibles.");
      setCatalogErrors(errors);
      const current = selectedRef.current;
      const { evenings: nextEvenings, tournaments: nextTournaments } = catalogs.current;
      if (![...nextEvenings, ...nextTournaments, ...bdcOptions].some(item => item.id === current)) {
        selectEvent(nextEvenings[0]?.id ?? nextTournaments[0]?.id ?? bdcOptions[0]?.id ?? "");
      }
      setLoading(false);
    });
    return () => controller.abort();
  }, [reload, bdcOptions]);

  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    const target = visibilitySelection(selected, bdcOptions);
    if (!target) { setBusy(false); return () => controller.abort(); }
    setBusy(true); setError("");
    const endpoint = target.kind === "tournament" ? `tournament-summary?code=${encodeURIComponent(target.code)}` : target.kind === "interclub" ? `summary?result_id=${encodeURIComponent(target.result_id)}` : "";
    const request = target.kind === "bdc" ? Promise.resolve(target.summary) : fetch(`/api/admin/visibility/${endpoint}`, { signal: controller.signal, cache: "no-store" }).then(responseJson<Summary>);
    request.then(signVisibilitySummary)
      .then((data) => { if (!controller.signal.aborted && isCurrent(current)) { setSummary(data); setDraft(data.whatsapp); setMatchContext(data.context ?? ""); } })
      .catch((reason) => { if (!controller.signal.aborted && isCurrent(current)) setError(reason instanceof Error ? reason.message : "Résumé indisponible."); })
      .finally(() => { if (!controller.signal.aborted && isCurrent(current)) setBusy(false); });
    return () => controller.abort();
  }, [selected, reload, bdcOptions]);

  async function generate(preserveDraft = false, context?: string) {
    const current = generation.current;
    const target = visibilitySelection(selected, bdcOptions);
    if (!target || target.kind === "bdc") throw new Error("Sélection indisponible.");
    const endpoint = target.kind === "tournament" ? "tournament-summary" : "summary";
    const identity = target.kind === "tournament" ? { code: target.code } : { result_id: target.result_id };
    const data = signVisibilitySummary(await responseJson<Summary>(await fetch(`/api/admin/visibility/${endpoint}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...identity, ...(context !== undefined ? { context } : {}) }),
    })));
    if (!isCurrent(current)) throw new Error("La sélection a changé.");
    setSummary(data); setMatchContext(data.context ?? "");
    if (!preserveDraft) { setDraft(data.whatsapp); setEdited(false); }
    return data;
  }

  async function applyContext() {
    if (!summary || busy) return;
    const current = generation.current;
    setBusy(true); setError(""); setStatus("");
    try {
      await generate(false, matchContext);
      if (isCurrent(current)) setStatus(`Contexte enregistré pour ${isTournament ? "ce tournoi" : "cette rencontre"}. Les versions WhatsApp et Facebook ont été actualisées.`);
    } catch (reason) { if (isCurrent(current)) setError(reason instanceof Error ? reason.message : "Actualisation impossible."); }
    finally { if (isCurrent(current)) setBusy(false); }
  }

  async function prepareFacebook() {
    if (!summary || busy || contextChanged) return;
    const current = generation.current;
    setBusy(true); setError(""); setStatus("");
    try {
      const data = summary.mode === "ai" || !summary.ai_available ? summary : await generate(true);
      if (!isCurrent(current)) return;
      onFacebookReady(data.facebook);
      setStatus("Version Facebook chargée dans le bloc ci-dessous.");
      document.getElementById("facebook-publication")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (reason) { if (isCurrent(current)) setError(reason instanceof Error ? reason.message : "Préparation impossible."); }
    finally { if (isCurrent(current)) setBusy(false); }
  }

  async function shareWhatsApp() {
    if (!summary || busy || contextChanged || !draft.trim()) return;
    const current = generation.current;
    // Reserve the tab during the user gesture so asynchronous AI generation is not blocked.
    const popup = window.open("about:blank", "_blank");
    if (popup) { popup.opener = null; popup.document.title = "Préparation du résumé 974Darts…"; }
    setBusy(true); setError(""); setStatus("");
    try {
      let text = draft;
      if (!edited && summary.ai_available && summary.mode !== "ai") text = (await generate()).whatsapp;
      if (!isCurrent(current)) { popup?.close(); return; }
      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      if (popup && !popup.closed) popup.location.replace(url);
      else window.location.assign(url);
      setStatus("WhatsApp ouvert : choisis le groupe Fléchettes Réunion, puis valide l’envoi.");
    } catch (reason) {
      popup?.close();
      if (isCurrent(current)) setError(reason instanceof Error ? reason.message : "Partage impossible. Tu peux copier le texte.");
    } finally { if (isCurrent(current)) setBusy(false); }
  }

  async function copy() {
    const current = generation.current;
    try { await navigator.clipboard.writeText(draft); if (isCurrent(current)) setStatus("Résumé copié."); }
    catch { if (isCurrent(current)) setError("La copie automatique est bloquée. Sélectionne le texte du résumé pour le copier."); }
  }

  return <section className={`${styles.composer} ${styles.whatsapp}`} aria-labelledby="evening-title">
    <header><div><span>Groupe interne · Fléchettes Réunion</span><h2 id="evening-title"><MessageCircle size={26}/> {isTournament ? "Résumé de tournoi WhatsApp" : isBdc ? "Résumé de manche WhatsApp" : "Résumé de soirée WhatsApp"}</h2></div><span className={styles.badge}>{summary?.mode === "ai" ? "Synthèse IA" : "Analyse statistique"}</span></header>
    <p className={styles.intro}>Choisis une rencontre interclubs, une manche BDC terminée ou un tournoi publié, officiel ou amical. Les commentaires utilisent automatiquement les pseudos Nakka connus des joueurs.</p>
    {automation && selection?.kind === "interclub" && <div className={styles.automation}>
      <b>Championnat automatique · à partir de 22 h · suivi pendant 24 h · heure de La Réunion</b>
      <p>{automation.running && automation.publication_enabled ? "Actif : les soirs de match du calendrier, résultats, classement et statistiques des joueurs et des équipes sont mis à jour sans intervention. Le résumé est ensuite préparé." : "La publication automatique n’a pas confirmé son activité récemment."}
        {automation.next_at && <> Prochaine soirée : {new Date(automation.next_at).toLocaleDateString("fr-FR", { timeZone: "Indian/Reunion" })}.</>}</p>
      {automation.recent.filter((item) => item.status !== "READY").map((item) => <p key={item.title}><strong>{item.title}</strong> — {item.message} {item.published_result_id ? (item.retry_expired ? "Résumé à préparer manuellement." : "Résultat publié · nouvelle préparation du résumé toutes les 5 minutes.") : (item.retry_expired ? "Vérifications arrêtées après 24 h · contrôle nécessaire." : "Nouvelle vérification toutes les 10 minutes jusqu’à 22 h le lendemain.")}</p>)}
    </div>}
    <div className={styles.eventChoice}><label htmlFor="visibility-evening">Rencontre, manche BDC ou tournoi<select id="visibility-evening" value={selected} disabled={!evenings.length && !tournaments.length && !bdcOptions.length} onChange={(event) => selectEvent(event.target.value)}>
      {(!selected || (!evenings.length && !tournaments.length && !bdcOptions.length)) && <option value="">{loading ? "Chargement…" : "Aucun événement publié disponible"}</option>}
      {!!evenings.length && <optgroup label="Rencontres interclubs">{evenings.map((evening) => <option key={evening.id} value={evening.id}>{evening.round} · {evening.date ? new Date(`${evening.date}T12:00:00`).toLocaleDateString("fr-FR") : "Date à confirmer"} · {evening.home} {evening.home_score}–{evening.away_score} {evening.away}</option>)}</optgroup>}
      {!!bdcOptions.length && <optgroup label="Blind Draw Championship">{bdcOptions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>}
      {!!tournaments.length && <optgroup label="Tournois officiels et amicaux">{tournaments.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>}
    </select></label><button className={styles.secondaryButton} onClick={() => { resetPreview(); setLoading(true); setReload((value) => value + 1); }} disabled={busy || loading} aria-label="Actualiser les événements"><RefreshCw size={18}/></button></div>
    {summary && <div className={styles.summaryNumbers}><span><b>{summary.evening.matches ?? "Non disponible"}</b> matchs</span><span><b>{summary.evening.legs ?? "Non disponible"}</b> {summary.evening.legsLabel ?? "legs"}</span><span><b>{summary.evening.players ?? "Non disponible"}</b> {summary.evening.playersLabel ?? "joueurs"}</span><a href={summary.evening.url} target="_blank" rel="noopener noreferrer">Voir les statistiques <ExternalLink size={14}/></a></div>}
    {busy && <p className={styles.progress} role="status"><LoaderCircle className={styles.spin} size={18}/> Préparation du résumé…</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {catalogErrors.map(message => <p key={message} className={styles.error} role="alert">{message}</p>)}
    {!loading && !evenings.length && !tournaments.length && !bdcOptions.length && !error && <p className={styles.intro}>Les événements apparaissent ici dès que leurs données complètes ont été contrôlées.</p>}
    {summary && <>
      {!isBdc && <div className={styles.matchContext}>
        <label className={styles.draftLabel} htmlFor="match-context">Contexte {isTournament ? "du tournoi" : "de la rencontre"}</label>
        <p id="match-context-help" className={styles.intro}>Ajoute les faits que tu confirmes : {isTournament ? "organisation, belle prestation, ambiance ou incident technique" : "renfort exceptionnel, belle prestation, ambiance ou incident technique"}. Ce texte sera repris dans les deux versions et conservé pour {isTournament ? "ce tournoi" : "cette rencontre"}.</p>
        <textarea id="match-context" aria-describedby="match-context-help" className={styles.summaryDraft} value={matchContext} rows={4} maxLength={1600} disabled={busy} onChange={(event) => { setMatchContext(event.target.value); setStatus(""); }}/>
        <div className={styles.summaryActions}><button className={styles.secondaryButton} onClick={applyContext} disabled={busy}><RefreshCw size={17}/> Enregistrer le contexte et actualiser</button><small>{matchContext.length}/1 600 caractères</small></div>
        {contextChanged && <p className={styles.intro}>Enregistre le contexte pour l’inclure dans les textes avant de partager.</p>}
        {edited && <p className={styles.intro}>Actualiser remplacera tes modifications du résumé WhatsApp.</p>}
      </div>}
      <label className={styles.draftLabel} htmlFor="whatsapp-draft">Texte pour le groupe <small>Tu peux le modifier avant de partager.</small></label>
      <textarea id="whatsapp-draft" className={styles.summaryDraft} value={draft} rows={15} maxLength={6000} disabled={busy} onChange={(event) => { setDraft(event.target.value); setEdited(true); setStatus(""); }}/>
      <div className={styles.summaryActions}><button className={styles.whatsappButton} onClick={shareWhatsApp} disabled={busy || contextChanged || !draft.trim()}><MessageCircle size={19}/> {summary.ai_available && summary.mode !== "ai" && !edited ? "Analyser et ouvrir WhatsApp" : "Ouvrir dans WhatsApp"}</button>
        <button className={styles.secondaryButton} onClick={copy} disabled={busy || !draft.trim()}><Clipboard size={17}/> Copier</button>
        <button className={styles.secondaryButton} onClick={prepareFacebook} disabled={busy || contextChanged}><Sparkles size={17}/> Préparer la version Facebook</button></div>
      <p className={styles.intro}>{summary.note}{edited ? " Tes modifications seront conservées pour WhatsApp." : ""}</p>
      <p className={styles.shareHelp}>Le bouton ouvre le résumé dans WhatsApp. Sélectionne ton groupe, puis confirme l’envoi dans WhatsApp.</p>
    </>}
    {status && <p className={styles.success} role="status">{status}</p>}
  </section>;
}
