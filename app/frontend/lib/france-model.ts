export type FranceCommittee = {
  id: string; name: string; organism_type: string; verification_status: string;
  parent_organization: string | null; reference_url: string | null;
  department: string | null; region: string | null; checked_at: string | null;
};
export type FranceCompetition = {
  n01_id: string; committee_id: string | null; lgid: string | null; title: string;
  competition_date: string | null; season: string | null; status: string;
  participants: number | null; formats: string[] | null; source_url: string | null;
  verification_status: string; source_public: boolean; last_synced_at: string | null;
};
export type FranceCandidate = {
  id: string; n01_id: string; committee_id: string; status: string;
  reason: string | null; decided_at: string | null;
};
export type FranceRun = {
  id: string; status: string; started_at: string | null;
  stats: Record<string, number>; since: string | null; until: string | null;
};
export type FranceInventory = {
  committees: FranceCommittee[]; competitions: FranceCompetition[];
  candidates: FranceCandidate[]; runs: FranceRun[]; leagueCount: number;
};

export type JsonObject = Record<string, unknown>;
const text = (v: unknown) => typeof v === "string" && v.trim() ? v : null;
export function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}
export function officialN01Url(value: unknown): string | null {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && url.hostname === "n01darts.com" && !url.username && !url.password &&
      ["/n01/league/season.php", "/n01/tournament/comp.php"].includes(url.pathname) &&
      /^t_[A-Za-z0-9_]+$/.test(url.searchParams.get("id") ?? "") ? url.href : null;
  } catch { return null; }
}
export function httpsReference(value: unknown): string | null {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export function committeeFromRow(row: JsonObject): FranceCommittee {
  const p = object(row.payload);
  return { id: String(row.id), name: text(p.name) ?? String(row.id), organism_type: text(p.organism_type) ?? "UNKNOWN",
    verification_status: text(p.verification_status) ?? "UNASSIGNED", parent_organization: text(p.parent_organization),
    reference_url: httpsReference(p.reference_url), department: text(p.department), region: text(p.region),
    checked_at: text(object(p.evidence).checked_at) };
}
export function competitionFromRow(row: JsonObject): FranceCompetition {
  const p = object(row.payload);
  return { n01_id: String(row.id), title: text(p.title) ?? String(row.id), committee_id: text(p.committee_id),
    lgid: text(p.lgid), competition_date: text(p.competition_date), season: text(p.season), status: text(p.status) ?? "UNKNOWN",
    participants: typeof p.participants === "number" && Number.isInteger(p.participants) && p.participants >= 0 ? p.participants : null,
    formats: Array.isArray(p.formats) ? p.formats.filter((f): f is string => typeof f === "string") : null,
    source_url: officialN01Url(p.source_url), verification_status: text(p.verification_status) ?? "UNASSIGNED",
    source_public: p.source_public === true, last_synced_at: text(p.last_synced_at) };
}
export function candidateFromRow(row: JsonObject): FranceCandidate {
  const p = object(row.payload);
  return { id: String(row.id), n01_id: String(p.n01_id ?? ""), committee_id: String(p.committee_id ?? ""),
    status: text(p.status) ?? "REVIEW_REQUIRED", reason: text(p.reason), decided_at: text(p.decided_at) };
}
export function publicInventory(committees: FranceCommittee[], competitions: FranceCompetition[]) {
  const visible = committees.filter(c => c.verification_status === "VERIFIED" && ["COMMITTEE", "REGIONAL_LEAGUE", "FEDERATION"].includes(c.organism_type));
  const ids = new Set(visible.map(c => c.id));
  return { committees: visible, competitions: competitions.filter(c => c.verification_status === "VERIFIED" && c.source_public && c.committee_id && ids.has(c.committee_id)) };
}
export function franceDate(day: string | null, short = false): string {
  if (!day) return "Date non renseignée";
  const parsed = new Date(day.length === 10 ? day + "T12:00:00Z" : day);
  if (!Number.isFinite(parsed.getTime())) return "Date non renseignée";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: short ? "short" : "long", year: "numeric", timeZone: "UTC" }).format(parsed);
}
export const franceStatuses: Record<string, string> = {
  PREPARING: "Préparation", ENTRIES_OPEN: "Inscriptions", BUILDING_BRACKET: "Tableau en préparation",
  IN_PROGRESS: "En cours", FINISHED: "Terminé", UNKNOWN: "Non renseigné",
};
