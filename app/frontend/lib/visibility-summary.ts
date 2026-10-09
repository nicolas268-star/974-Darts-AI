export type VisibilitySummary = {
  whatsapp: string;
  facebook: string;
  mode: "ai" | "statistics";
  note: string;
  ai_available: boolean;
  evening: { url: string; matches: number; legs: number; players: number; legsLabel?: string };
  fingerprint: string;
};

export type BdcVisibilityOption = {
  id: string;
  label: string;
  summary: VisibilitySummary;
};

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
