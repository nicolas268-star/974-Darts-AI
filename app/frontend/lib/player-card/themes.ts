import type { ThemeId } from "./types";
export type CardTheme = { id: ThemeId; label: string; accent: string; light: string; background: string; texture: string | null; font: string; displayFont: string; secondary?: string; tertiary?: string; pattern?: "bands" | "rings" };
export const THEMES: Record<ThemeId, CardTheme> = {
  fournaise: { id: "fournaise", label: "Fournaise", accent: "#ff792d", light: "#ffbc70", background: "#0e1114", texture: "/team-themes/fournaise-banner.png", font: "Arial, sans-serif", displayFont: "Arial, sans-serif" },
  neige: { id: "neige", label: "Neige", accent: "#69c8ef", light: "#cef2ff", background: "#0b141c", texture: "/team-themes/neige-banner.png", font: "Arial, sans-serif", displayFont: "Arial, sans-serif" },
  // Palettes from the existing team pages; Kaz/TDC decoration is canvas geometry, never a recreated club logo.
  "3bdc": { id: "3bdc", label: "3 Brasseurs", accent: "#66f2d3", light: "#f7e1b5", secondary: "#d98a38", background: "#061b25", texture: "/team-themes/3bdc-banner.png", font: "Arial, sans-serif", displayFont: "Arial, sans-serif" },
  kazadarts: { id: "kazadarts", label: "Kaz A Darts", accent: "#4d8dff", light: "#ffd93d", secondary: "#ffd93d", tertiary: "#f04444", pattern: "bands", background: "#0d1d33", texture: null, font: "Arial, sans-serif", displayFont: "Arial, sans-serif" },
  tdc: { id: "tdc", label: "TDC Tampon", accent: "#3fd47f", light: "#f3f7f5", secondary: "#ef3f4f", tertiary: "#f3f7f5", pattern: "rings", background: "#0a1d1f", texture: null, font: "Arial, sans-serif", displayFont: "Arial, sans-serif" },
  ambre: { id: "ambre", label: "3 Brasseur Club Darts — Bière Ambrée", accent: "#e6a446", light: "#ffe4b0", secondary: "#66f2d3", tertiary: "#f7e1b5", pattern: "rings", background: "#18201d", texture: null, font: "Arial, sans-serif", displayFont: "Arial, sans-serif" },
  brune: { id: "brune", label: "3 Brasseur Darts Club — Bière Brune", accent: "#cf8757", light: "#f6d1b4", secondary: "#58cdb8", tertiary: "#f6d1b4", pattern: "bands", background: "#231613", texture: null, font: "Arial, sans-serif", displayFont: "Arial, sans-serif" },
  "kaz-a": { id: "kaz-a", label: "Kaz A Darts A", accent: "#4d8dff", light: "#ffdf55", secondary: "#ffd93d", tertiary: "#f04444", pattern: "bands", background: "#0d1d33", texture: null, font: "Arial, sans-serif", displayFont: "Arial, sans-serif" },
  "kaz-b": { id: "kaz-b", label: "Kaz A Darts B", accent: "#f04444", light: "#ffd93d", secondary: "#4d8dff", tertiary: "#ffd93d", pattern: "rings", background: "#27141f", texture: null, font: "Arial, sans-serif", displayFont: "Arial, sans-serif" },
  zarboutant: { id: "zarboutant", label: "TDC Zarboutant", accent: "#3fd47f", light: "#f3f7f5", secondary: "#ef3f4f", tertiary: "#f3f7f5", pattern: "rings", background: "#0a1d1f", texture: null, font: "Arial, sans-serif", displayFont: "Arial, sans-serif" },
  zarlord: { id: "zarlord", label: "TDC Zarlord", accent: "#ef3f4f", light: "#f3f7f5", secondary: "#3fd47f", tertiary: "#f3f7f5", pattern: "bands", background: "#241521", texture: null, font: "Arial, sans-serif", displayFont: "Arial, sans-serif" },

  neutral: { id: "neutral", label: "974Darts", accent: "#edaa45", light: "#ffe0a2", background: "#111417", texture: null, font: "Arial, sans-serif", displayFont: "Arial, sans-serif" },
};
export type ThemeBindings = { teams?: Record<string, ThemeId>; clubs?: Record<string, ThemeId> };
// Official roster IDs and database IDs verified on the live public /championships/2026 and /2027 pages on 2026-10-11.
// New season/team IDs can be configured explicitly; never resolve themes from display names.
export const DEFAULT_BINDINGS: ThemeBindings = { teams: {
  "pdc-fournaise": "fournaise", "pdc-neige": "neige",
  "3bdc-ambre": "3bdc", "3bdc-blonde": "3bdc",
  "kaz-a": "kazadarts", "kaz-b": "kazadarts",
  "tdc-zarboutan": "tdc", "tdc-zarlor": "tdc",
  "87719ebb-183e-43ac-a96a-5bf4c657939b": "fournaise",
  "4a3849c5-3096-4443-87e0-9ce5fd248a46": "neige",
  "c16214bf-1ae3-48e2-a1d9-0bfd451f60a3": "3bdc",
  "ea7206d1-bf26-48d1-ae8d-7213ef94884c": "3bdc",
  "9b85ca85-4c9a-4bb7-8d73-c92e19ae7de3": "3bdc",
  "7f265d6f-7f40-4b83-b046-ace3663b5de4": "kazadarts",
  "047a30ee-ad3d-472b-854e-2e5575c08bd1": "kazadarts",
  "7e2f62a9-e0cc-490e-b8eb-bc19c1f182e3": "kazadarts",
  "9e79f660-c8ca-411b-a5fd-5584e58f46b6": "kazadarts",
  "7f8f200c-709c-4734-ba51-ffdc0c15563d": "tdc",
  "a6810fe2-6469-463e-bea7-65061727e92d": "tdc",
  "311d3ddc-a7dc-4494-9252-03b736b501ce": "tdc",
} };
export function defaultTheme(teamId: string | null, clubId: string | null, bindings: ThemeBindings = DEFAULT_BINDINGS): ThemeId {
  const team = teamId && bindings.teams && Object.hasOwn(bindings.teams, teamId) ? bindings.teams[teamId] : null;
  const club = clubId && bindings.clubs && Object.hasOwn(bindings.clubs, clubId) ? bindings.clubs[clubId] : null;
  return team || club || "neutral";
}
export function parseBindings(json?: string): ThemeBindings {
  if (!json) return DEFAULT_BINDINGS;
  const parsed = JSON.parse(json) as ThemeBindings;
  for (const group of [parsed.teams, parsed.clubs]) {
    if (group && (typeof group !== "object" || Array.isArray(group) || Object.values(group).some(id => !Object.hasOwn(THEMES, id)))) throw new Error("Association des thèmes invalide.");
  }
  return { teams: { ...DEFAULT_BINDINGS.teams, ...parsed.teams }, clubs: parsed.clubs };
}

// Shared theme registry: Match Day only lists these eight variants. Existing card defaults stay stable.
export const MATCH_THEME_IDS = ["neige", "fournaise", "ambre", "brune", "kaz-b", "kaz-a", "zarboutant", "zarlord"] as const;
export type MatchThemeId = typeof MATCH_THEME_IDS[number];
export const MATCH_THEME_LABELS: Record<MatchThemeId, string> = { neige: "Piton des Neiges", fournaise: "Piton de la Fournaise", ambre: THEMES.ambre.label, brune: THEMES.brune.label, "kaz-b": THEMES["kaz-b"].label, "kaz-a": THEMES["kaz-a"].label, zarboutant: THEMES.zarboutant.label, zarlord: THEMES.zarlord.label };
export function matchThemeForTeam(id: string): MatchThemeId | null {
  const variants: Record<string, MatchThemeId> = {
    "ea7206d1-bf26-48d1-ae8d-7213ef94884c": "ambre", "9b85ca85-4c9a-4bb7-8d73-c92e19ae7de3": "brune",
    "7e2f62a9-e0cc-490e-b8eb-bc19c1f182e3": "kaz-a", "9e79f660-c8ca-411b-a5fd-5584e58f46b6": "kaz-b",
    "7f265d6f-7f40-4b83-b046-ace3663b5de4": "kaz-a", "047a30ee-ad3d-472b-854e-2e5575c08bd1": "kaz-b",
    "a6810fe2-6469-463e-bea7-65061727e92d": "zarboutant", "311d3ddc-a7dc-4494-9252-03b736b501ce": "zarlord",
  };
  if (Object.hasOwn(variants, id)) return variants[id];
  const base = defaultTheme(id, null);
  return base === "fournaise" || base === "neige" ? base : null;
}
