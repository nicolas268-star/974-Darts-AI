export type CalendarEventType = "CHAMPIONSHIP" | "TOURNAMENT" | "FRIENDLY" | "OTHER";
export type CalendarEventStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";
export type RankingCategory = "C" | "D" | "E";

export type CalendarEvent = {
  id: string;
  title: string;
  event_type: CalendarEventType;
  ranking_category?: RankingCategory | null;
  ranking_kind?: "COMMITTEE_OPEN" | "COMMITTEE_CUP" | "CLUB_SINGLE" | "CLUB_DOUBLE" | null;
  start_date: string;
  start_time?: string | null;
  end_date?: string | null;
  location: string;
  address?: string | null;
  description?: string | null;
  source_url?: string | null;
  status: CalendarEventStatus;
  championship_teams?: string[];
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

export const rankingCategoryLabels: Record<RankingCategory, string> = {
  C: "Coupe Comité · Catégorie C",
  D: "Open Comité · Catégorie D",
  E: "Open de club reconnu · Catégorie E",
};
