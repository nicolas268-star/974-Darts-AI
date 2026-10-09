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
