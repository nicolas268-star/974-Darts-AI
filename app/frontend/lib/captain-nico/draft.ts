export type CaptainDraft = {
  version: 2; season: string; title: string; home: string[]; away: string[];
  homePairing: number; awayPairing: number; assumptions: Record<string, number>;
};
export const emptySelection = () => Array<string>(6).fill("");
export const emptyDraft = (season: string): CaptainDraft => ({ version: 2, season, title: "Analyse avant match", home: emptySelection(), away: emptySelection(), homePairing: 0, awayPairing: 0, assumptions: {} });

/** Restore known, unique player IDs only. Analyses must always be recalculated. */
export function restoreDraft(raw: string | null, legacy: string | null, ids: Set<string>, season: string): CaptainDraft {
  const empty = emptyDraft(season);
  try {
    const value = raw ? JSON.parse(raw) : legacy ? JSON.parse(legacy) : null;
    if (!value || typeof value !== "object") return empty;
    if (raw && (value.version !== 2 || value.season !== season)) return empty;
    const old = !raw && value.slots && typeof value.slots === "object";
    if (!raw && !old) return empty;
    const used = new Set<string>();
    const clean = (input: unknown): string[] => Array.from({ length: 6 }, (_, index) => {
      const id = Array.isArray(input) ? input[index] : "";
      if (typeof id !== "string" || !ids.has(id) || used.has(id)) return "";
      used.add(id); return id;
    });
    const home = clean(old ? [value.slots.A, value.slots.B, value.slots.C, value.slots.D, value.slots.Y] : value.home);
    const away = clean(old ? [value.slots.E, value.slots.F, value.slots.G, value.slots.H, value.slots.Z] : value.away);
    const pairing = (v: unknown) => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 2 ? Number(v) : 0;
    const oldHomePairing = () => {
      const [a, b, c, d] = home;
      if (![a, b, c, d].every(Boolean)) return 0;
      const first = [value.slots.A1P1, value.slots.A1P2], second = [value.slots.A2P1, value.slots.A2P2];
      const options = [[[a, b], [c, d]], [[a, c], [b, d]], [[a, d], [b, c]]];
      return Math.max(0, options.findIndex(([p1, p2]) => p1.every(id => first.includes(id)) && p2.every(id => second.includes(id))));
    };
    const assumptions: Record<string, number> = {};
    if (value.assumptions && typeof value.assumptions === "object") for (const [id, v] of Object.entries(value.assumptions)) {
      if (ids.has(id) && typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 180) assumptions[id] = v;
    }
    return { ...empty, home, away, assumptions, title: typeof value.title === "string" ? value.title.slice(0, 140) : empty.title, homePairing: old ? oldHomePairing() : pairing(value.homePairing), awayPairing: pairing(value.awayPairing) };
  } catch { return empty; }
}
