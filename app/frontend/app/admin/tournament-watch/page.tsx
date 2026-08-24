"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CalendarPlus, Eye, Mail, Plus, Radar, RefreshCw, ScanText, Trash2, X } from "lucide-react";
import styles from "./tournament-watch.module.css";
import "./tournament-watch-tools.css";
import "./tournament-watch-email.css";

type Source = { id: string; name: string; url: string; source_type: string; active: boolean; last_scan_at?: string; last_error?: string };
type Discovery = { id: string; source_name: string; source_url: string; title: string; start_date?: string; start_time?: string; location: string; description: string; status: "PENDING" | "PUBLISHED" | "IGNORED" | "ALREADY_CALENDAR" | "INSUFFICIENT"; detected_at: string; reason?: string; calendar_event_title?: string };
type State = { sources: Source[]; discoveries: Discovery[]; last_scan_at?: string; counts: { sources: number; active: number; pending: number; already_calendar?: number; insufficient?: number }; automation?: { automatic:boolean; notification_email:string; interval_minutes:number; email_transport_configured:boolean; last_email_at?:string; last_email_error?:string } };
const emptySource = { name: "", url: "", source_type: "WEBSITE", active: true };

export default function TournamentWatchPage() {
  const [data, setData] = useState<State>({ sources: [], discoveries: [], counts: { sources: 0, active: 0, pending: 0, already_calendar: 0, insufficient: 0 } });
  const [source, setSource] = useState(emptySource);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [manual, setManual] = useState({ source_name: "Facebook", source_url: "", text: "" });
  const [notificationEmail, setNotificationEmail] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/backend/api/v1/tournament-watch/status", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || payload.error || "Veille indisponible.");
    setData(payload);
    setNotificationEmail(payload.automation?.notification_email || "");
  }, []);

  useEffect(() => { load().catch((caught) => setError(caught.message)); }, [load]);

  async function call(path: string, body: unknown) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/admin/backend/api/v1/tournament-watch/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || payload.error || "Action impossible.");
      await load(); return payload;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Action impossible."); throw caught; }
    finally { setBusy(false); }
  }

  async function addSource(event: React.FormEvent) {
    event.preventDefault();
    try { await call("sources/upsert", source); setSource(emptySource); setMessage("Source ajoutée à la veille quotidienne."); } catch {}
  }

  async function scan() {
    try { const result = await call("scan", {}); setMessage(`${result.scanned} source(s) vérifiée(s), ${result.new_discoveries} nouvelle(s) annonce(s).`); } catch {}
  }

  async function analyzeManual(event: React.FormEvent) {
    event.preventDefault();
    try { const result = await call("manual/analyze", manual); setManual({ ...manual, text: "" }); setMessage(result.created ? "Annonce détectée et ajoutée à la liste de validation." : "Cette annonce avait déjà été analysée."); } catch {}
  }

  async function saveNotifications(event: React.FormEvent) {
    event.preventDefault();
    try { await call("settings", { notification_email: notificationEmail, automatic: true }); setMessage("Surveillance horaire activée et adresse de notification enregistrée."); } catch {}
  }

  async function testEmail() {
    try { await call("settings/test-email", {}); setMessage("E-mail de test envoyé. Vérifie ta boîte de réception."); } catch {}
  }

  async function publish(item: Discovery) {
    const title = window.prompt("Titre à publier", item.title)?.trim(); if (!title) return;
    const start_date = window.prompt("Date du tournoi (AAAA-MM-JJ)", item.start_date || "")?.trim(); if (!start_date) return;
    const location = window.prompt("Lieu", item.location || item.source_name)?.trim(); if (!location) return;
    try { await call("decision", { id: item.id, action: "PUBLISH", edits: { title, start_date, location } }); setMessage("Tournoi ajouté au calendrier public."); } catch {}
  }

  const pending = data.discoveries.filter((item) => item.status === "PENDING");
  const classified = data.discoveries.filter((item) => item.status === "ALREADY_CALENDAR" || item.status === "INSUFFICIENT");
  return <main className={styles.page}>
    <section className={styles.hero}><div><span>SPRINT 19 · RADAR COMMUNAUTAIRE</span><h1>Veille des prochains tournois</h1><p>Surveille les sources officielles, vérifie les annonces détectées et publie uniquement les événements confirmés.</p></div><Radar /></section>
    <section className={styles.metrics}><article><strong>{data.counts.active}</strong><span>sources actives</span></article><article><strong>{data.counts.pending}</strong><span>annonces à vérifier</span></article><article><strong>{data.last_scan_at ? new Date(data.last_scan_at).toLocaleString("fr-FR") : "—"}</strong><span>dernière analyse</span></article><button disabled={busy || !data.counts.active} onClick={() => void scan()}><RefreshCw /> Analyser maintenant</button></section>
    {message && <p className={styles.success}>{message}</p>}{error && <p className={styles.error}>{error}</p>}
    <div className="toolsGrid">
      <section className="toolPanel"><header><ScanText/><div><strong>Analyser une annonce manuellement</strong><span>Pour Facebook, Instagram ou un texte reçu par message.</span></div></header><form onSubmit={analyzeManual}><div className="toolRow"><label>Source<input value={manual.source_name} onChange={e=>setManual({...manual,source_name:e.target.value})} placeholder="Facebook · Nicolas Dupont"/></label><label>URL facultative<input type="url" value={manual.source_url} onChange={e=>setManual({...manual,source_url:e.target.value})} placeholder="Lien de la publication"/></label></div><label>Texte de l’annonce<textarea required minLength={8} value={manual.text} onChange={e=>setManual({...manual,text:e.target.value})} placeholder="Colle ici : Test - Tournoi fléchette St Leu 22 août…"/></label><button disabled={busy}><ScanText/>Analyser le texte</button></form></section>
      <section className="toolPanel"><header><Bell/><div><strong>Surveillance permanente</strong><span>Analyse automatique toutes les heures.</span></div></header><form onSubmit={saveNotifications}><label>Adresse e-mail d’alerte<input type="email" required value={notificationEmail} onChange={e=>setNotificationEmail(e.target.value)} placeholder="votre@email.fr"/></label><div className="automationState"><i data-active={data.automation?.automatic}>Radar {data.automation?.automatic ? "actif" : "arrêté"}</i><i data-active={data.automation?.email_transport_configured}>E-mail {data.automation?.email_transport_configured ? "configuré" : "SMTP à configurer"}</i></div>{data.automation?.last_email_error&&<small className="emailError">{data.automation.last_email_error}</small>}<button disabled={busy}><Mail/>Enregistrer les alertes</button><button type="button" className="secondaryToolButton" disabled={busy||!data.automation?.email_transport_configured||!notificationEmail} onClick={()=>void testEmail()}><Mail/>Envoyer un e-mail de test</button></form></section>
    </div>
    <div className={styles.columns}>
      <section className={styles.panel}><header><div><span>À valider</span><h2>Annonces détectées</h2></div><em>{pending.length}</em></header>
        {pending.length ? pending.map((item) => <article className={styles.discovery} key={item.id}><div><small>{item.source_name} · {new Date(item.detected_at).toLocaleDateString("fr-FR")}</small><h3>{item.title}</h3><p>{item.start_date || "Date à confirmer"} · {item.location}</p><a href={item.source_url} target="_blank" rel="noreferrer"><Eye /> Voir l’annonce originale</a></div><div className={styles.actions}><button disabled={busy} onClick={() => void publish(item)}><CalendarPlus /> Vérifier et publier</button><button className={styles.muted} disabled={busy} onClick={() => void call("decision", { id: item.id, action: "IGNORE", edits: {} })}><X /> Ignorer</button></div></article>) : <div className={styles.empty}><Radar /><strong>Aucune annonce en attente</strong><p>Ajoute les pages des clubs, puis lance une analyse.</p></div>}
      </section>
      <section className={styles.panel}><header><div><span>Registre</span><h2>Sources surveillées</h2></div><em>{data.sources.length}</em></header>
        <form className={styles.form} onSubmit={addSource}><label>Club ou organisateur<input required minLength={2} value={source.name} onChange={(e) => setSource({ ...source, name: e.target.value })} placeholder="Ex. Tampon Darts Club" /></label><label>Type<select value={source.source_type} onChange={(e) => setSource({ ...source, source_type: e.target.value })}><option value="WEBSITE">Site internet</option><option value="FACEBOOK">Page Facebook</option><option value="INSTAGRAM">Instagram</option><option value="NAKKA">Nakka</option><option value="OTHER">Autre page publique</option></select></label><label>Adresse publique<input required type="url" value={source.url} onChange={(e) => setSource({ ...source, url: e.target.value })} placeholder="https://…" /></label><button disabled={busy}><Plus /> Ajouter à la veille</button><p>Facebook et Instagram peuvent exiger une connexion Meta. Le radar indiquera alors l’erreur sans contourner leurs protections.</p></form>
        <div className={styles.sources}>{data.sources.map((item) => <article key={item.id}><div><strong>{item.name}</strong><span>{item.source_type} · {item.last_scan_at ? `vérifiée ${new Date(item.last_scan_at).toLocaleDateString("fr-FR")}` : "jamais analysée"}</span>{item.last_error && <small>{item.last_error}</small>}</div><a href={item.url} target="_blank" rel="noreferrer"><Eye /></a><button aria-label="Supprimer" disabled={busy} onClick={() => window.confirm(`Retirer ${item.name} de la veille ?`) && void call("sources/delete", { id: item.id, confirmed: true })}><Trash2 /></button></article>)}</div>
      </section>
    </div>
    {classified.length > 0 && <section className={styles.panel}><header><div><span>Contrôle automatique</span><h2>Annonces classées</h2></div><em>{classified.length}</em></header><div className={styles.classified}>{classified.map((item) => <article key={item.id}><span className={item.status === "ALREADY_CALENDAR" ? styles.calendarBadge : styles.infoBadge}>{item.status === "ALREADY_CALENDAR" ? "Déjà au calendrier" : "Informations insuffisantes"}</span><div><strong>{item.title}</strong><p>{item.reason}{item.calendar_event_title ? ` · ${item.calendar_event_title}` : ""}</p></div><a href={item.source_url} target="_blank" rel="noreferrer"><Eye /> Source</a></article>)}</div></section>}
  </main>;
}
