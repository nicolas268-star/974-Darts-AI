import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Clock3, MapPin, PartyPopper } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { BDC_URL, bdcCalendarRound } from "@/lib/bdc";
import { committeeCalendarEvents } from "@/lib/committee-ranking";
import {
  calendarTypeLabels,
  rankingCategoryLabels,
  type CalendarEvent,
  type CalendarPayload,
} from "@/lib/calendar/types";
import "./calendar.css";

const backend = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";

export const metadata: Metadata = {
  title: "Calendrier",
  description: "Calendrier des matchs, tournois et événements de fléchettes à La Réunion.",
};

function eventKey(event: Pick<CalendarEvent, "start_date" | "title">) {
  return `${event.start_date}|${event.title.toLocaleLowerCase("fr").replace(/[^a-z0-9]/g, "")}`;
}

async function getEvents(): Promise<CalendarEvent[]> {
  let dynamicEvents: CalendarEvent[] = [];
  try {
    const response = await fetch(`${backend}/api/v1/calendar/events`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      dynamicEvents = ((await response.json()) as CalendarPayload).events;
    }
  } catch {
    dynamicEvents = [];
  }

  const existing = new Set(dynamicEvents.map(eventKey));
  const officialFallbacks = committeeCalendarEvents
    .filter((event) => !existing.has(eventKey(event)))
    .map((event) => ({ ...event } satisfies CalendarEvent));

  return [...dynamicEvents, ...officialFallbacks].sort((a, b) =>
    a.start_date.localeCompare(b.start_date)
    || (a.start_time ?? "").localeCompare(b.start_time ?? "")
    || a.title.localeCompare(b.title, "fr")
  );
}

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Indian/Reunion",
});

function EventCard({ event }: { event: CalendarEvent }) {
  const date = new Date(`${event.start_date}T12:00:00+04:00`);
  const bdcRound = bdcCalendarRound(event.title, event.start_date);
  const rankingLabel = event.ranking_category
    ? rankingCategoryLabels[event.ranking_category]
    : calendarTypeLabels[event.event_type];

  return <article className={`calendar-event type-${event.event_type.toLowerCase()} ${event.ranking_category ? `ranking-category-${event.ranking_category.toLowerCase()}` : ""} ${event.status === "CANCELLED" ? "cancelled" : ""}`}>
    <div className="calendar-date"><strong>{String(date.getDate()).padStart(2, "0")}</strong><span>{date.toLocaleDateString("fr-FR", { month: "short", timeZone: "Indian/Reunion" })}</span></div>
    <div className="calendar-event-main"><div className="calendar-event-meta"><span>{rankingLabel}</span>{event.status === "CANCELLED" && <b>Annulé</b>}</div><h2>{event.title}</h2><p><CalendarDays size={16} /> {dateFormatter.format(date)}{event.end_date && event.end_date !== event.start_date ? ` au ${dateFormatter.format(new Date(`${event.end_date}T12:00:00+04:00`))}` : ""}</p><p><Clock3 size={16} /> {event.start_time || "Horaire à confirmer"}</p><p><MapPin size={16} /> {event.location}{event.address ? ` · ${event.address}` : ""}</p>{event.description && <small>{event.description}</small>}</div>
    {bdcRound ? <div className="calendar-event-actions"><Link href={`${BDC_URL}#manche-${bdcRound.number}`}>Manche {bdcRound.number} et classement BDC →</Link>{event.source_url && <Link href={event.source_url} target="_blank" rel="noreferrer">Voir les détails →</Link>}</div> : event.source_url && <Link href={event.source_url} target="_blank" rel="noreferrer">Voir les détails →</Link>}
  </article>;
}

export default async function CalendarPage() {
  const events = await getEvents();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Reunion" }).format(new Date());
  const upcoming = events.filter((event) => event.start_date >= today && event.status !== "COMPLETED");
  const past = events.filter((event) => event.start_date < today || event.status === "COMPLETED").reverse();

  return <div className="dashboard"><Sidebar /><main className="main calendar-page">
    <section className="calendar-hero"><div><span>Agenda 974 Darts</span><h1>Calendrier</h1><p>Championnat, compétitions individuelles officielles, tournois reconnus et rendez-vous amicaux réunis au même endroit.</p></div><CalendarDays size={72} /><div className="calendar-count"><strong>{upcoming.length}</strong><span>événement{upcoming.length !== 1 ? "s" : ""} à venir</span></div></section>
    <section className="calendar-legend"><span className="legend-championship">Championnat interclubs</span><span className="legend-category-c">Coupe Comité</span><span className="legend-category-d">Open Comité</span><span className="legend-category-e">Open de club reconnu</span><span className="legend-friendly">Tournoi amical</span></section>
    <section className="calendar-list"><header><div><span>À vos agendas</span><h2>Prochains rendez-vous</h2></div><PartyPopper /></header>{upcoming.length ? upcoming.map((event) => <EventCard event={event} key={event.id} />) : <div className="calendar-empty"><CalendarDays size={34} /><strong>Le prochain rendez-vous arrive bientôt</strong><p>Le calendrier est prêt. Les événements ajoutés par l’administrateur apparaîtront ici immédiatement.</p></div>}</section>
    {past.length > 0 && <section className="calendar-list calendar-past"><header><div><span>Archives</span><h2>Événements passés</h2></div></header>{past.slice(0, 20).map((event) => <EventCard event={event} key={event.id} />)}</section>}
  </main></div>;
}
