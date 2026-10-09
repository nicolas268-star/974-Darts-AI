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

export function withVisibilitySignature(text: string): string {
  if (!text.trim() || /\bNDX\s+Performance\s+Lab\b/i.test(text)) return text;
  return `${text.trimEnd()}\n\n${VISIBILITY_SIGNATURE}`;
}

export function signVisibilitySummary(summary: VisibilitySummary): VisibilitySummary {
  return {
    ...summary,
    whatsapp: withVisibilitySignature(summary.whatsapp),
    facebook: withVisibilitySignature(summary.facebook),
  };
}
