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
import { TEAM_ROSTERS_2027 } from "@/lib/team-rosters-2027";
import "./calendar.css";
import "./calendar-team-filter.css";

const backend = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";

export const metadata: Metadata = {
  title: "Calendrier",
  description: "Calendrier des matchs, tournois et événements de fléchettes à La Réunion.",
};

function eventKey(event: Pick<CalendarEvent, "start_date" | "title">) {
  return `${event.start_date}|${event.title.toLocaleLowerCase("fr").replace(/[^a-z0-9]/g, "")}`;
}

const friendlyEventOverrides = [
  { date: "2026-09-25", keywords: ["cricket", "five"] },
  { date: "2026-08-02", keywords: ["dimanche", "legende"] },
  { date: "2026-08-28", keywords: ["papangue", "dart"] },
  { date: "2026-08-07", keywords: ["cricket", "challenge"] },
];

function normalizedTitle(title: string) {
  return title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}

function isFriendlyOverride(event: CalendarEvent) {
  const title = normalizedTitle(event.title);
  return friendlyEventOverrides.some(({ date, keywords }) =>
    event.start_date === date && keywords.every((keyword) => title.includes(keyword))
  );
}

type CalendarFilter = "all" | "championship" | "bdc" | "category-c" | "category-d" | "category-e" | "friendly";

const calendarFilters: Array<{ id: CalendarFilter; label: string; className: string }> = [
  { id: "all", label: "Toutes les dates", className: "legend-all" },
  { id: "championship", label: "Championnat interclubs", className: "legend-championship" },
  { id: "bdc", label: "Blind Draw Championship", className: "legend-bdc" },
  { id: "category-c", label: "Coupe Comité", className: "legend-category-c" },
  { id: "category-d", label: "Open Comité", className: "legend-category-d" },
  { id: "category-e", label: "Open de club reconnu", className: "legend-category-e" },
  { id: "friendly", label: "Tournoi amical", className: "legend-friendly" },
];

function eventFilter(event: CalendarEvent): Exclude<CalendarFilter, "all"> | null {
  if (bdcCalendarRound(event.title, event.start_date)) return "bdc";
  if (event.ranking_category) return `category-${event.ranking_category.toLowerCase()}` as Exclude<CalendarFilter, "all">;
  if (event.event_type === "CHAMPIONSHIP") return "championship";
  if (event.event_type === "FRIENDLY") return "friendly";
  return null;
}

function officialCalendarTeam(value: string): string {
  const normalized = normalizedTitle(value).replace(/[^a-z0-9]/g, "");
  const aliases: Record<string, string[]> = {
    "pdc-neige": ["PDC A", "PDC Neige", "Papangue DC - Neige"],
    "pdc-fournaise": ["PDC B", "PDC Fournaise", "Papangue DC - Fournaise"],
    "tdc-zarboutan": ["TDC Zarboutan", "Tampon DC - Zarboutan"],
    "tdc-zarlor": ["TDC Zarlor", "Tampon DC - Zarlor"],
    "kaz-a": ["KAD A", "Kaz A Darts A"],
    "kaz-b": ["KAD B", "Kaz A Darts B"],
    "3bdc-ambre": ["3BDC A", "3B DC A", "3B Darts Club A", "3B Darts Club Ambré"],
    "3bdc-blonde": ["3BDC B", "3B DC B", "3B Darts Club B", "3B Darts Club Blonde"],
  };
  return TEAM_ROSTERS_2027.find((team) =>
    [team.name, ...(aliases[team.id] ?? [])].some((name) =>
      normalizedTitle(name).replace(/[^a-z0-9]/g, "") === normalized
    )
  )?.name ?? value.trim();
}

function championshipTeamsForEvent(event: CalendarEvent): string[] {
  if (event.event_type !== "CHAMPIONSHIP") return [];
  const title = event.title.replace(/^\s*J\s*\d+\s*[·:–—-]?\s*/iu, "");
  // Explicit opponent separators take priority: official names contain hyphens.
  const opponents = title.split(/\s+(?:vs\.?|contre)\s+/iu).map((team) => team.trim()).filter(Boolean);
  if (opponents.length === 2) return opponents.map(officialCalendarTeam);
  if (event.championship_teams?.length) return event.championship_teams.map(officialCalendarTeam);
  const fixture = title.split(/\s+(?:–|—|-|\/)\s+/u).map((team) => team.trim()).filter(Boolean);
  return fixture.length === 2 ? fixture.map(officialCalendarTeam) : [];
}

function isCalendarFilter(value: string | undefined): value is CalendarFilter {
  return calendarFilters.some((filter) => filter.id === value);
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

  dynamicEvents = dynamicEvents.map((event): CalendarEvent =>
    isFriendlyOverride(event)
      ? { ...event, event_type: "FRIENDLY", ranking_category: null, ranking_kind: null }
      : event
  );

  const existingIds = new Set(dynamicEvents.map((event) => event.id));
  const existingKeys = new Set(dynamicEvents.map(eventKey));
  const officialFallbacks = committeeCalendarEvents
    .filter((event) => !existingIds.has(event.id) && !existingKeys.has(eventKey(event)))
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
  const rankingLabel = bdcRound
    ? "Blind Draw Championship"
    : event.ranking_category
      ? rankingCategoryLabels[event.ranking_category]
      : calendarTypeLabels[event.event_type];

  return <article className={`calendar-event type-${event.event_type.toLowerCase()} ${bdcRound ? "event-bdc" : ""} ${event.ranking_category ? `ranking-category-${event.ranking_category.toLowerCase()}` : ""} ${event.status === "CANCELLED" ? "cancelled" : ""}`}>
    <div className="calendar-date"><strong>{String(date.getDate()).padStart(2, "0")}</strong><span>{date.toLocaleDateString("fr-FR", { month: "short", timeZone: "Indian/Reunion" })}</span></div>
    <div className="calendar-event-main"><div className="calendar-event-meta"><span>{rankingLabel}</span>{event.status === "CANCELLED" && <b>Annulé</b>}</div><h2>{event.title}</h2><p><CalendarDays size={16} /> {dateFormatter.format(date)}{event.end_date && event.end_date !== event.start_date ? ` au ${dateFormatter.format(new Date(`${event.end_date}T12:00:00+04:00`))}` : ""}</p><p><Clock3 size={16} /> {event.start_time || "Horaire à confirmer"}</p><p><MapPin size={16} /> {event.location}{event.address ? ` · ${event.address}` : ""}</p>{event.description && <small>{event.description}</small>}</div>
    {bdcRound ? <div className="calendar-event-actions"><Link href={`${BDC_URL}#manche-${bdcRound.number}`}>Manche {bdcRound.number} et classement BDC →</Link>{event.source_url && <Link href={event.source_url} target="_blank" rel="noreferrer">Voir les détails →</Link>}</div> : event.source_url && <Link href={event.source_url} target="_blank" rel="noreferrer">Voir les détails →</Link>}
  </article>;
}

type CalendarPageProps = {
  searchParams?: Promise<{ filter?: string | string[]; team?: string | string[] }>;
};

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const query = await searchParams;
  const requestedFilter = Array.isArray(query?.filter) ? query.filter[0] : query?.filter;
  const rawTeam = Array.isArray(query?.team) ? query.team[0] : query?.team;
  const requestedTeam = rawTeam ? officialCalendarTeam(rawTeam) : undefined;
  const activeFilter: CalendarFilter = isCalendarFilter(requestedFilter) ? requestedFilter : "all";
  const events = await getEvents();
  const championshipTeams = [...new Set(events.flatMap(championshipTeamsForEvent))].sort((a, b) => a.localeCompare(b, "fr"));
  const calendarHref = (filter: CalendarFilter, team?: string) => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("filter", filter);
    if (team) params.set("team", team);
    const search = params.toString();
    return search ? `/calendar?${search}` : "/calendar";
  };
  const visibleEvents = activeFilter === "all"
    ? events
    : events.filter((event) => eventFilter(event) === activeFilter && (!requestedTeam || championshipTeamsForEvent(event).includes(requestedTeam)));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Reunion" }).format(new Date());
  const upcoming = visibleEvents.filter((event) => event.start_date >= today && event.status !== "COMPLETED");
  const past = visibleEvents.filter((event) => event.start_date < today || event.status === "COMPLETED").reverse();

  return <div className="dashboard"><Sidebar /><main className="main calendar-page">
    <section className="calendar-hero"><div><span>Agenda 974 Darts</span><h1>Calendrier</h1><p>Championnat, compétitions individuelles officielles, tournois reconnus et rendez-vous amicaux réunis au même endroit.</p></div><CalendarDays size={72} /><div className="calendar-count"><strong>{upcoming.length}</strong><span>événement{upcoming.length !== 1 ? "s" : ""} à venir</span></div></section>
    <nav className="calendar-legend" aria-label="Filtrer le calendrier">{calendarFilters.map((filter) => <Link key={filter.id} href={calendarHref(filter.id)} className={`${filter.className} ${activeFilter === filter.id ? "active" : ""}`} aria-current={activeFilter === filter.id ? "page" : undefined}>{filter.label}</Link>)}</nav>
    {activeFilter === "championship" && <section className="calendar-team-filter" aria-label="Filtrer le championnat par équipe"><strong>Équipe</strong><div><Link href={calendarHref("championship")} className={!requestedTeam ? "active" : ""}>Toutes les équipes</Link>{championshipTeams.map((team) => <Link key={team} href={calendarHref("championship", team)} className={requestedTeam === team ? "active" : ""}>{team}</Link>)}</div>{!championshipTeams.length && <p>Aucune équipe n’a pu être reconnue dans les rencontres publiées.</p>}</section>}
    <section className="calendar-list"><header><div><span>À vos agendas</span><h2>Prochains rendez-vous</h2></div><PartyPopper /></header>{upcoming.length ? upcoming.map((event) => <EventCard event={event} key={event.id} />) : <div className="calendar-empty"><CalendarDays size={34} /><strong>Aucun rendez-vous à venir dans cette catégorie</strong><p>Choisissez un autre filtre ou affichez toutes les dates.</p></div>}</section>
    {past.length > 0 && <section className="calendar-list calendar-past"><header><div><span>Archives</span><h2>Événements passés</h2></div></header>{past.slice(0, 20).map((event) => <EventCard event={event} key={event.id} />)}</section>}
  </main></div>;
}
