export type CalendarEventType = "CHAMPIONSHIP" | "TOURNAMENT" | "FRIENDLY" | "OTHER";
export type CalendarEventStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";

export type CalendarEvent = {
  id: string;
  title: string;
  event_type: CalendarEventType;
  start_date: string;
  start_time?: string | null;
  end_date?: string | null;
  location: string;
  address?: string | null;
  description?: string | null;
  source_url?: string | null;
  status: CalendarEventStatus;
  created_at?: string;
  updated_at?: string;
};

export type CalendarPayload = { events: CalendarEvent[]; count: number };

export const calendarTypeLabels: Record<CalendarEventType, string> = {
  CHAMPIONSHIP: "Championnat",
  TOURNAMENT: "Tournoi",
  FRIENDLY: "Amical",
  OTHER: "Événement",
};
