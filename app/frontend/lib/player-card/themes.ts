import type { ThemeId } from "./types";
export type CardTheme = { id: ThemeId; label: string; accent: string; light: string; background: string; texture: string | null; font: string; displayFont: string };
export const THEMES: Record<ThemeId, CardTheme> = {
  fournaise: { id: "fournaise", label: "Fournaise", accent: "#ff792d", light: "#ffbc70", background: "#0e1114", texture: "/team-themes/fournaise-banner.png", font: "Arial, sans-serif", displayFont: "Arial, sans-serif" },
  neige: { id: "neige", label: "Neige", accent: "#69c8ef", light: "#cef2ff", background: "#0b141c", texture: "/team-themes/neige-banner.png", font: "Arial, sans-serif", displayFont: "Arial, sans-serif" },
  neutral: { id: "neutral", label: "974Darts", accent: "#edaa45", light: "#ffe0a2", background: "#111417", texture: null, font: "Arial, sans-serif", displayFont: "Arial, sans-serif" },
};
export type ThemeBindings = { teams?: Record<string, ThemeId>; clubs?: Record<string, ThemeId> };
// Official roster IDs and database IDs verified on the public /championships/2026 page on 2026-10-11.
// New season/team IDs can be configured explicitly; never resolve themes from display names.
export const DEFAULT_BINDINGS: ThemeBindings = { teams: {
  "pdc-fournaise": "fournaise", "pdc-neige": "neige",
  "87719ebb-183e-43ac-a96a-5bf4c657939b": "fournaise",
  "4a3849c5-3096-4443-87e0-9ce5fd248a46": "neige",
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
