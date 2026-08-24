import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Clock3, MapPin, PartyPopper } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { calendarTypeLabels, type CalendarEvent, type CalendarPayload } from "@/lib/calendar/types";
import "./calendar.css";

const backend = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";

export const metadata: Metadata = {
  title: "Calendrier",
  description: "Calendrier des matchs, tournois et événements de fléchettes à La Réunion.",
};

async function getEvents(): Promise<CalendarEvent[]> {
  try {
    const response = await fetch(`${backend}/api/v1/calendar/events`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    return response.ok ? ((await response.json()) as CalendarPayload).events : [];
  } catch { return []; }
}

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Indian/Reunion" });

function EventCard({ event }: { event: CalendarEvent }) {
  const date = new Date(`${event.start_date}T12:00:00+04:00`);
  return <article className={`calendar-event type-${event.event_type.toLowerCase()} ${event.status === "CANCELLED" ? "cancelled" : ""}`}>
    <div className="calendar-date"><strong>{String(date.getDate()).padStart(2, "0")}</strong><span>{date.toLocaleDateString("fr-FR", { month: "short", timeZone: "Indian/Reunion" })}</span></div>
    <div className="calendar-event-main"><div className="calendar-event-meta"><span>{calendarTypeLabels[event.event_type]}</span>{event.status === "CANCELLED" && <b>Annulé</b>}</div><h2>{event.title}</h2><p><CalendarDays size={16} /> {dateFormatter.format(date)}{event.end_date && event.end_date !== event.start_date ? ` au ${dateFormatter.format(new Date(`${event.end_date}T12:00:00+04:00`))}` : ""}</p><p><Clock3 size={16} /> {event.start_time || "Horaire à confirmer"}</p><p><MapPin size={16} /> {event.location}{event.address ? ` · ${event.address}` : ""}</p>{event.description && <small>{event.description}</small>}</div>
    {event.source_url && <Link href={event.source_url} target="_blank" rel="noreferrer">Voir les détails →</Link>}
  </article>;
}

export default async function CalendarPage() {
  const events = await getEvents();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Reunion" }).format(new Date());
  const upcoming = events.filter((event) => event.start_date >= today && event.status !== "COMPLETED");
  const past = events.filter((event) => event.start_date < today || event.status === "COMPLETED").reverse();
  return <div className="dashboard"><Sidebar /><main className="main calendar-page">
    <section className="calendar-hero"><div><span>Agenda 974 Darts</span><h1>Calendrier</h1><p>Matchs de championnat, tournois amicaux et rendez-vous de la communauté réunis au même endroit.</p></div><CalendarDays size={72} /><div className="calendar-count"><strong>{upcoming.length}</strong><span>événement{upcoming.length !== 1 ? "s" : ""} à venir</span></div></section>
    <section className="calendar-list"><header><div><span>À vos agendas</span><h2>Prochains rendez-vous</h2></div><PartyPopper /></header>{upcoming.length ? upcoming.map((event) => <EventCard event={event} key={event.id} />) : <div className="calendar-empty"><CalendarDays size={34} /><strong>Le prochain rendez-vous arrive bientôt</strong><p>Le calendrier est prêt. Les événements ajoutés par l’administrateur apparaîtront ici immédiatement.</p></div>}</section>
    {past.length > 0 && <section className="calendar-list calendar-past"><header><div><span>Archives</span><h2>Événements passés</h2></div></header>{past.slice(0, 20).map((event) => <EventCard event={event} key={event.id} />)}</section>}
  </main></div>;
}
