"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Edit3, MapPin, Plus, Save, Trash2 } from "lucide-react";
import { calendarTypeLabels, type CalendarEvent, type CalendarEventType } from "@/lib/calendar/types";
import styles from "./CalendarManager.module.css";

const emptyForm = { id: "", title: "", event_type: "CHAMPIONSHIP" as CalendarEventType, start_date: "", start_time: "", end_date: "", location: "", address: "", description: "", source_url: "", status: "SCHEDULED" as const };
type FormState = typeof emptyForm | (Omit<typeof emptyForm, "status"> & { status: "SCHEDULED" | "COMPLETED" | "CANCELLED" });

export default function CalendarManager() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/admin/backend/api/v1/calendar/events", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || payload.detail || "Calendrier indisponible.");
      setEvents(payload.events || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Calendrier indisponible."); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function edit(event: CalendarEvent) {
    setForm({ id: event.id, title: event.title, event_type: event.event_type, start_date: event.start_date, start_time: event.start_time || "", end_date: event.end_date || "", location: event.location, address: event.address || "", description: event.description || "", source_url: event.source_url || "", status: event.status });
    setMessage(""); setError(""); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    try {
      const payload = { ...form, id: form.id || undefined, start_time: form.start_time || null, end_date: form.end_date || null, address: form.address || null, description: form.description || null, source_url: form.source_url || null };
      const response = await fetch("/api/admin/backend/api/v1/calendar/events/upsert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.detail || "Enregistrement impossible.");
      setForm(emptyForm); setMessage(result.created ? "Événement publié dans le calendrier." : "Événement mis à jour."); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Enregistrement impossible."); }
    finally { setBusy(false); }
  }

  async function remove(event: CalendarEvent) {
    if (!window.confirm(`Supprimer « ${event.title} » du calendrier ?`)) return;
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/admin/backend/api/v1/calendar/events/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: event.id, confirmed: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.detail || "Suppression impossible.");
      if (form.id === event.id) setForm(emptyForm); setMessage("Événement supprimé."); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Suppression impossible."); }
    finally { setBusy(false); }
  }

  return <div className={styles.page}>
    <section className={styles.hero}><div className={styles.heroIcon}><CalendarDays /></div><div><span>Agenda de la communauté</span><h1>Gérer le calendrier</h1><p>Ajoutez un match, un tournoi ou un événement. Après validation, il apparaît immédiatement sur la page publique.</p></div><a href="/calendar" target="_blank">Voir le calendrier public →</a></section>
    <div className={styles.columns}>
      <form className={styles.form} onSubmit={save}><header><Plus /><div><span>{form.id ? "Modification" : "Nouvel événement"}</span><h2>{form.id ? form.title : "Créer un rendez-vous"}</h2></div></header>
        <label>Titre<input required minLength={2} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex. J11 · Kazadarts A vs PDC Neige" /></label>
        <div className={styles.row}><label>Type<select value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value as CalendarEventType })}>{Object.entries(calendarTypeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Statut<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as FormState["status"] })}><option value="SCHEDULED">Programmé</option><option value="COMPLETED">Terminé</option><option value="CANCELLED">Annulé</option></select></label></div>
        <div className={styles.row}><label>Date<input required type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></label><label>Heure<input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></label><label>Date de fin<input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></label></div>
        <label>Lieu<input required minLength={2} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Ex. Tampon Darts Club" /></label>
        <label>Adresse (facultatif)<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Rue, commune" /></label>
        <label>Description (facultatif)<textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Informations pratiques, format, inscription…" /></label>
        <label>Lien d’information (facultatif)<input type="url" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} placeholder="https://…" /></label>
        {message && <p className={styles.success}><CheckCircle2 /> {message}</p>}{error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}><button disabled={busy} type="submit"><Save /> {busy ? "Enregistrement…" : form.id ? "Enregistrer les modifications" : "Publier l’événement"}</button>{form.id && <button className={styles.secondary} type="button" onClick={() => setForm(emptyForm)}>Annuler</button>}</div>
      </form>
      <section className={styles.list}><header><div><span>Événements enregistrés</span><h2>{events.length} rendez-vous</h2></div><button onClick={() => void load()}>Actualiser</button></header>{events.length ? events.map((event) => <article key={event.id}><div className={styles.eventDate}><strong>{event.start_date.slice(8, 10)}</strong><span>{new Date(`${event.start_date}T12:00:00`).toLocaleDateString("fr-FR", { month: "short" })}</span></div><div><span className={styles.type}>{calendarTypeLabels[event.event_type]}</span><h3>{event.title}</h3><p><MapPin /> {event.location} · {event.start_time || "horaire à confirmer"}</p></div><div className={styles.itemActions}><button aria-label="Modifier" onClick={() => edit(event)}><Edit3 /></button><button aria-label="Supprimer" onClick={() => void remove(event)}><Trash2 /></button></div></article>) : <div className={styles.empty}><CalendarDays /><strong>Aucun événement enregistré</strong><p>Utilisez le formulaire pour publier le premier rendez-vous.</p></div>}</section>
    </div>
  </div>;
}
