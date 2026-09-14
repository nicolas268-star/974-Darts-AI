export type RankingCategory = "C" | "D" | "E";
export type RankingEventKind =
  | "COMMITTEE_OPEN"
  | "COMMITTEE_CUP"
  | "CLUB_SINGLE"
  | "CLUB_DOUBLE";

export type CommitteeCalendarEvent = {
  id: string;
  title: string;
  event_type: "TOURNAMENT";
  ranking_category: RankingCategory;
  ranking_kind: RankingEventKind;
  start_date: string;
  start_time: null;
  location: string;
  description: string;
  source_url: string | null;
  status: "SCHEDULED" | "COMPLETED";
};

export type PointScale = {
  key: RankingEventKind;
  label: string;
  category: RankingCategory;
  perPlayer?: boolean;
  points: {
    winner: number;
    runnerUp: number;
    semiFinalist: number;
    quarterFinalist: number;
    roundOf16: number;
  };
};

export const pointScales: PointScale[] = [
  {
    key: "COMMITTEE_OPEN",
    label: "Open du Comité",
    category: "D",
    points: { winner: 30, runnerUp: 24, semiFinalist: 18, quarterFinalist: 12, roundOf16: 6 },
  },
  {
    key: "COMMITTEE_CUP",
    label: "Coupe du Comité",
    category: "C",
    points: { winner: 50, runnerUp: 38, semiFinalist: 28, quarterFinalist: 18, roundOf16: 10 },
  },
  {
    key: "CLUB_SINGLE",
    label: "Open de club · simple",
    category: "E",
    points: { winner: 10, runnerUp: 8, semiFinalist: 6, quarterFinalist: 4, roundOf16: 2 },
  },
  {
    key: "CLUB_DOUBLE",
    label: "Open de club · double",
    category: "E",
    perPlayer: true,
    points: { winner: 10, runnerUp: 8, semiFinalist: 6, quarterFinalist: 4, roundOf16: 2 },
  },
];

export const committeeCalendarEvents: CommitteeCalendarEvent[] = [
  {
    id: "club-open-kaz-2026-09-13",
    title: "Open de club · Kaz A Darts 974",
    event_type: "TOURNAMENT",
    ranking_category: "E",
    ranking_kind: "CLUB_SINGLE",
    start_date: "2026-09-13",
    start_time: null,
    location: "Kaz A Darts · Saint-Pierre",
    description: "Premier tournoi de club reconnu comptant pour le classement individuel 974 2026–2027.",
    source_url: "https://n01darts.com/n01/tournament/comp.php?id=t_aKyY_3246",
    status: "COMPLETED",
  },
  {
    id: "committee-open-1-2026-10-18",
    title: "Open Comité 1",
    event_type: "TOURNAMENT",
    ranking_category: "D",
    ranking_kind: "COMMITTEE_OPEN",
    start_date: "2026-10-18",
    start_time: null,
    location: "PDC · Saint-Leu",
    description: "Open officiel du Comité Fléchettes de La Réunion. Horaire à confirmer.",
    source_url: null,
    status: "SCHEDULED",
  },
  {
    id: "committee-open-2-2026-12-13",
    title: "Open Comité 2",
    event_type: "TOURNAMENT",
    ranking_category: "D",
    ranking_kind: "COMMITTEE_OPEN",
    start_date: "2026-12-13",
    start_time: null,
    location: "3B · Saint-Paul",
    description: "Open officiel du Comité Fléchettes de La Réunion. Horaire à confirmer.",
    source_url: null,
    status: "SCHEDULED",
  },
  {
    id: "committee-cup-2027-01-17",
    title: "Coupe Comité 974",
    event_type: "TOURNAMENT",
    ranking_category: "C",
    ranking_kind: "COMMITTEE_CUP",
    start_date: "2027-01-17",
    start_time: null,
    location: "Lieu à confirmer · La Réunion",
    description: "Coupe officielle du Comité 974. Le lieu et l’horaire restent à confirmer.",
    source_url: null,
    status: "SCHEDULED",
  },
  {
    id: "committee-open-3-2027-03-21",
    title: "Open Comité 3",
    event_type: "TOURNAMENT",
    ranking_category: "D",
    ranking_kind: "COMMITTEE_OPEN",
    start_date: "2027-03-21",
    start_time: null,
    location: "TDC · Le Tampon",
    description: "Open officiel du Comité Fléchettes de La Réunion. Horaire à confirmer.",
    source_url: null,
    status: "SCHEDULED",
  },
  {
    id: "committee-open-4-2027-05-16",
    title: "Open Comité 4",
    event_type: "TOURNAMENT",
    ranking_category: "D",
    ranking_kind: "COMMITTEE_OPEN",
    start_date: "2027-05-16",
    start_time: null,
    location: "Kaz A Darts · Saint-Pierre",
    description: "Open officiel du Comité Fléchettes de La Réunion. Horaire à confirmer.",
    source_url: null,
    status: "SCHEDULED",
  },
];

export const rankingColumnLabels = [
  { key: "club-open-kaz-2026-09-13", short: "KAZ", label: "Open Kaz · 13 sept." },
  { key: "committee-open-1-2026-10-18", short: "OC1", label: "Open Comité 1" },
  { key: "committee-open-2-2026-12-13", short: "OC2", label: "Open Comité 2" },
  { key: "committee-cup-2027-01-17", short: "COUPE", label: "Coupe Comité" },
  { key: "committee-open-3-2027-03-21", short: "OC3", label: "Open Comité 3" },
  { key: "committee-open-4-2027-05-16", short: "OC4", label: "Open Comité 4" },
] as const;
