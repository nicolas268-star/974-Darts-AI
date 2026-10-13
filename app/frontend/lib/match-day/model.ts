import { matchThemeForTeam } from "../player-card/themes";
import { adaptDashboard, initials } from "../player-card/data";
import type { CardData } from "../player-card/types";
import type { MatchSnapshot, MatchSource, Side, SourceTeam, MatchEvent, MatchPlayer } from "./types";
export const MATCH_METRICS = ["average", "winRate", "finish"] as const;
export function sideFromTeam(team: SourceTeam): Side {
  return { ...team, theme: matchThemeForTeam(team.id), composition_confirmed: false, players: team.players.filter((p): p is MatchPlayer => Boolean(p.id)) };
}
export function createSnapshot(source: MatchSource, a: SourceTeam, b: SourceTeam, event: MatchEvent | null = null): MatchSnapshot {
  return { source_id: source.source_id, season: source.season, stats_season: source.stats_season, stats_label: source.stats_label, reference_at: source.reference_at, event,
    match: { title: "MATCH DAY", date: event?.start_date ?? null, time: event?.start_time ?? null, location: event?.location ?? "", competition: event?.competition ?? `Championnat · Saison ${source.season}`, round: event?.round ?? "" },
    teamA: sideFromTeam(a), teamB: sideFromTeam(b), metrics: [...MATCH_METRICS], format: "publication", mode: "duel", caption: "", render_version: "match-day-1", generated_at: new Date().toISOString() };
}
export function invert(snapshot: MatchSnapshot): MatchSnapshot { return { ...snapshot, teamA: snapshot.teamB, teamB: snapshot.teamA }; }
export function resetThemes(s: MatchSnapshot): MatchSnapshot { return { ...s, teamA: { ...s.teamA, theme: matchThemeForTeam(s.teamA.id) }, teamB: { ...s.teamB, theme: matchThemeForTeam(s.teamB.id) } }; }
export function localToUtc(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Date/heure de publication requise.");
  const d = new Date(value + ":00+04:00"); if (!Number.isFinite(d.getTime())) throw new Error("Date invalide."); return d.toISOString();
}
export function localInput(value: string): string { return new Date(new Date(value).getTime() + 4 * 3600_000).toISOString().slice(0, 16); }
export function schedulePreset(s: MatchSnapshot, rule: "previous" | "match" | "h2", time = "10:00"): string {
  if (!s.match.date) throw new Error("Date du match inconnue.");
  if (rule === "h2") {
    if (!s.match.time) throw new Error("H-2 nécessite une heure confirmée.");
    return localInput(new Date(new Date(localToUtc(s.match.date + "T" + s.match.time)).getTime() - 2 * 3600_000).toISOString());
  }
  const d = new Date(s.match.date + "T12:00:00Z"); if (rule === "previous") d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10) + "T" + time;
}
export function frenchDate(value: string, withTime = true) {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Indian/Reunion", dateStyle: "medium", ...(withTime ? { timeStyle: "short" as const } : {}) }).format(new Date(value));
}
export function historicalUnavailable(s: MatchSnapshot) {
  return Boolean(s.match.date && new Date(s.reference_at).getTime() > new Date(s.match.date + "T" + (s.match.time || "00:00") + ":00+04:00").getTime());
}
export function playerCardData(s: MatchSnapshot, p: MatchPlayer): CardData {
  const empty: CardData = { name: p.name, nickname: p.nickname ?? null, initials: initials(p.name), club: null, team: null, period: `Saison ${s.stats_season}`, competition: s.stats_label, hasData: false, demonstration: false, stats: { average: null, finish: null, won: null, played: null, first9: null, bestAverage: null, scores100: null, scores140: null, averageFinish: null, scores80: null, scores170: null, scores180: null, noScore: null } };
  if (!p.dashboard || historicalUnavailable(s)) return empty;
  return { ...adaptDashboard(p.dashboard, s.stats_label), name: p.name, nickname: p.nickname ?? null };
}
export function caption(s: MatchSnapshot, detailed = false) {
  const m = s.match;
  const date = m.date ? frenchDate(m.date + "T12:00:00+04:00", false) : "Date à confirmer";
  const lines = [`🎯 ${m.title}`, `${s.teamA.name} ⚔️ ${s.teamB.name}`, "", [m.competition, m.round].filter(Boolean).join(" · "), `📅 ${date} · ${m.time ? m.time.replace(":", "h") : "Horaire à confirmer"}`, m.location ? `📍 ${m.location}` : ""];
  if (detailed) {
    for (const side of [s.teamA, s.teamB]) {
      lines.push("", side.name, side.composition_confirmed ? "Composition confirmée" : "Effectif de l’équipe — présence non confirmée");
      for (const p of side.players.filter(p => p.featured)) {
        const d = playerCardData(s, p); const avg = d.stats.average;
        lines.push(`${p.name} · Moyenne 3 fléchettes : ${avg === null ? "—" : avg.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      }
    }
    lines.push(`Statistiques : ${s.stats_label} · référence ${frenchDate(s.reference_at)}.`);
  }
  return lines.filter((l, i) => l !== "" || i > 0).join("\n") + "\n\nRetrouvez les équipes sur https://974darts.re/teams\n\n#974Darts #Flechettes974 #DartsReunion #MatchDay #NDXPerformanceLab";
}
