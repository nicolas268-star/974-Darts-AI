export type VisibilitySummary = {
  kind?: "interclub" | "bdc" | "tournament";
  whatsapp: string;
  facebook: string;
  mode: "ai" | "statistics";
  note: string;
  ai_available: boolean;
  context?: string;
  evening: { url: string; matches: number | null; legs: number | null; players: number | null; legsLabel?: string; playersLabel?: string; title?: string; date?: string | null; location?: string | null; discipline?: string };
  fingerprint: string;
};

export type BdcVisibilityOption = {
  id: string;
  label: string;
  summary: VisibilitySummary;
};

export type TournamentVisibilityOption = {
  id: string;
  code: string;
  label: string;
  title: string;
  date: string | null;
  discipline: string;
};

export function visibilitySelection(id: string, bdcOptions: BdcVisibilityOption[]) {
  const bdc = bdcOptions.find(option => option.id === id);
  if (bdc) return { kind: "bdc" as const, summary: bdc.summary };
  const tournament = /^tournament:([a-zA-Z0-9_-]{1,120})$/.exec(id);
  if (tournament) return { kind: "tournament" as const, code: tournament[1] };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { kind: "interclub" as const, result_id: id };
  return null;
}

const VISIBILITY_SIGNATURE = "974Darts · NDX Performance Lab";
const VISIBILITY_HASHTAGS = [
  "#flechettes974", "#dartsreunion", "#comiteflechettes974", "#darts",
  "#lareunion", "#stleu", "#darts974", "#TamponDartsClub", "#KazADarts974",
  "#PapangueDartsClub", "#3BDartsClub",
];

export function withVisibilityFooter(text: string): string {
  if (!text.trim()) return text;
  const existingTags = new Set((text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map(tag => tag.toLowerCase()));
  const missingTags = VISIBILITY_HASHTAGS.filter(tag => !existingTags.has(tag.toLowerCase()));
  const parts = [text.trimEnd()];
  if (missingTags.length) parts.push(missingTags.join(" "));
  if (!/\bNDX\s+Performance\s+Lab\b/i.test(text)) parts.push(VISIBILITY_SIGNATURE);
  return parts.join("\n\n");
}

export function signVisibilitySummary(summary: VisibilitySummary): VisibilitySummary {
  return {
    ...summary,
    whatsapp: withVisibilityFooter(summary.whatsapp),
    facebook: withVisibilityFooter(summary.facebook),
  };
}
