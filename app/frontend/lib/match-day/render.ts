import { CARD_SIZE, DEFAULT_CROP } from "../player-card/types";
import { THEMES } from "../player-card/themes";
import { CARD_METRICS, metricValue } from "../player-card/metrics";
import { decodeImage, drawPortrait } from "../player-card/photo";
import { fitText } from "../player-card/render";
import { pngBlob } from "../player-card/export";
import { frenchDate, historicalUnavailable, papangueChannel, playerCardData } from "./model";
import type { MatchSnapshot } from "./types";
import { TEAM_METRICS, teamMetricSelection, teamMetricValue } from "./team-metrics";

// Procedural themes deliberately omit the legacy banners: those carry other teams' text/logos.
export async function renderMatchDay(s: MatchSnapshot): Promise<{ blob: Blob; url: string; warnings: string[] }> {
  await document.fonts.ready;
  const { width: W, height: H } = CARD_SIZE[s.format];
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const c = canvas.getContext("2d"); if (!c) throw new Error("Canvas indisponible.");
  const teamOnly = s.content_mode === "teams";
  if (!teamOnly && (s.teamA.players.length > 8 || s.teamB.players.length > 8)) throw new Error("Maximum huit joueurs par côté. Réduisez la sélection.");
  const teamMetrics = teamMetricSelection(s);
  if (teamOnly && (teamMetrics.length < 1 || teamMetrics.length > 6)) throw new Error("Choisissez entre un et six KPI d’équipe.");
  const photos = teamOnly ? [] : await Promise.all([s.teamA, s.teamB].flatMap(t => t.players).map(async p => p.photo ? decodeImage(p.photo) : null));
  const warnings: string[] = [];
  if (historicalUnavailable(s)) warnings.push("Historique exact indisponible à cette date : les chiffres postérieurs sont masqués.");
  if (!teamOnly && [s.teamA, s.teamB].some(t => !t.roster_complete)) warnings.push("Effectif historique partiel : seuls les rattachements vérifiés sont proposés.");
  if (teamOnly && [s.teamA, s.teamB].some(t => !t.team_stats)) warnings.push("Actualisez les statistiques pour charger les KPI d’équipe de cet ancien brouillon.");
  if (teamOnly && [s.teamA, s.teamB].some(t => t.team_stats?.ranking_source === "PVP_FALLBACK")) warnings.push("Classement reconstruit depuis les résultats disponibles, comme sur la page du championnat.");
  if (teamOnly && teamMetrics.some(id => id === "legsWon" || id === "legsLost") && [s.teamA, s.teamB].some(t => t.team_stats?.detail_complete === false)) warnings.push("Détail des legs incomplet : ces KPI restent indisponibles pour les équipes concernées.");
  const text = (value: string, x: number, y: number, width: number, size: number, color = "#f4f4f1", align: CanvasTextAlign = "left", weight = "600") => {
    c.save(); c.fillStyle = color; c.textBaseline = "top"; c.textAlign = align;
    const fitted = fitText(c, value, width, size, size, "Arial, sans-serif", weight);
    // Never silently truncate names or reduce to unreadable text.
    if (fitted.lines.some(l => l.endsWith("…"))) { c.restore(); throw new Error(`Texte trop long pour ce format : ${value}. Réduisez le titre ou choisissez un autre format.`); }
    fitted.lines.forEach((l, i) => c.fillText(l, x, y + i * size * 1.15)); c.restore();
    return fitted.lines.length * size * 1.15;
  };
  c.fillStyle = "#080d15"; c.fillRect(0, 0, W, H);
  for (const [i, side] of [s.teamA, s.teamB].entries()) {
    const t = s.mode === "premium" ? THEMES.neutral : THEMES[side.theme || "neutral"];
    const x = i * 540;
    c.save(); c.beginPath(); c.rect(x, 0, 540, H); c.clip();
    const g = c.createLinearGradient(x, 0, x + 540, H); g.addColorStop(0, t.background); g.addColorStop(.65, t.background); g.addColorStop(1, "#070b12"); c.fillStyle = g; c.fillRect(x, 0, 540, H);
    const glow = c.createRadialGradient(x + (i ? 520 : 20), 500, 0, x + 270, 700, 850); glow.addColorStop(0, t.accent + "55"); glow.addColorStop(1, t.accent + "00"); c.fillStyle = glow; c.fillRect(x, 0, 540, H);
    c.strokeStyle = t.accent; c.lineWidth = 2; c.globalAlpha = .18;
    if (t.pattern === "rings" || t.id === "neige") {
      for (let r = 180; r <= 700; r += t.id === "neige" ? 70 : 120) { c.beginPath(); c.arc(x + (i ? 530 : 10), 650, r, 0, 2 * Math.PI); c.stroke(); }
    } else {
      for (let j = 0; j < 10; j++) { c.beginPath(); c.moveTo(x - 100 + j * 120, 0); c.lineTo(x - 550 + j * 120, H); c.stroke(); }
    }
    if (t.id === "fournaise" || t.id === "neige") {
      c.globalAlpha = .25; c.fillStyle = t.accent; c.beginPath(); c.moveTo(x, H); c.lineTo(x, H - 210); c.lineTo(x + 100, H - 260); c.lineTo(x + 180, H - 190); c.lineTo(x + 340, H - (t.id === "fournaise" ? 340 : 410)); c.lineTo(x + 470, H - 220); c.lineTo(x + 540, H - 300); c.lineTo(x + 540, H); c.closePath(); c.fill();
    }
    c.restore();
  }
  const top = s.format === "story" ? 180 : 48;
  text("974Darts", 540, top, 950, 58, "#faf8f2", "center", "900");
  text("LA RÉUNION JOUE FLÉCHETTES", 540, top + 72, 950, 18, "#a9b1bd", "center");
  const titleHeight = text(s.match.title.toLocaleUpperCase("fr-FR"), 540, top + 105, 950, 56, "#e6b867", "center", "900");
  const infoY = top + 105 + titleHeight + 18;
  text([s.match.competition, s.match.round].filter(Boolean).join(" · ") || "RENCONTRE INTERCLUBS", 540, infoY, 950, 24, "#d1d9e4", "center");
  const date = s.match.date ? frenchDate(s.match.date + "T12:00:00+04:00", false) : "Date à confirmer";
  text(`${date}  /  ${s.match.time ? s.match.time.replace(":", "h") : "Horaire à confirmer"}`, 540, infoY + 50, 950, 30, "#faf8f2", "center", "700");
  text(s.match.location || "Lieu à confirmer", 540, infoY + 96, 950, 24, "#aeb8c8", "center");
  const sideY = infoY + 156;
  c.save(); c.strokeStyle = "#dfb36a88"; c.lineWidth = 1; c.beginPath(); c.moveTo(540, sideY + 100); c.lineTo(540, H - 215); c.stroke(); c.restore();
  c.fillStyle = "#0b111d"; c.beginPath(); c.arc(540, sideY + 46, 40, 0, Math.PI * 2); c.fill();
  text("VS", 540, sideY + 24, 90, 32, "#e6b867", "center", "900");
  const playersY = sideY + 155, footerY = s.format === "story" ? 1675 : 1190;
  const maximum = Math.max(s.teamA.players.length, s.teamB.players.length, 1);
  const rowHeight = Math.min(s.format === "story" ? 160 : 138, (footerY - 25 - playersY) / maximum);
  if (!teamOnly && rowHeight < 120) throw new Error("L’affiche est trop dense. Passez au format Story ou réduisez la sélection avant de valider.");
  let photoIndex = 0;
  for (const [i, side] of [s.teamA, s.teamB].entries()) {
    const x = 44 + i * 540, cx = x + 226, t = THEMES[side.theme || "neutral"];
    text(side.name, cx, sideY, 434, 32, "#f9f8f5", "center", "900");
    text(side.club || "", cx, sideY + 82, 434, 19, t.light, "center");
    text(teamOnly ? "STATISTIQUES D’ÉQUIPE" : side.composition_confirmed ? "COMPOSITION CONFIRMÉE" : "EFFECTIF · PRÉSENCE NON CONFIRMÉE", cx, sideY + 130, 434, 17, "#aab6c8", "center");
    if (teamOnly) {
      const columns = teamMetrics.length <= 3 ? 1 : 2, rows = Math.ceil(teamMetrics.length / columns), gap = 14;
      const cellWidth = (452 - (columns - 1) * gap) / columns, startY = playersY + 22;
      const cellHeight = Math.min(s.format === "story" ? 240 : 210, (footerY - 80 - startY - (rows - 1) * gap) / rows);
      if (cellHeight < 120) throw new Error("Les KPI d’équipe sont trop denses. Réduisez leur nombre ou choisissez Story.");
      for (const [index, id] of teamMetrics.entries()) {
        const left = x + (index % columns) * (cellWidth + gap), y = startY + Math.floor(index / columns) * (cellHeight + gap);
        c.save(); c.fillStyle = "#09111ce8"; c.strokeStyle = t.accent + "88"; c.lineWidth = 1.5;
        c.beginPath(); c.roundRect(left, y, cellWidth, cellHeight, 16); c.fill(); c.stroke(); c.restore();
        const definition = TEAM_METRICS.find(metric => metric.id === id)!;
        const labelHeight = text(definition.cardLabel, left + 18, y + 18, cellWidth - 36, 16, "#b8c8dd", "left", "700");
        const valueSize = columns === 1 ? 62 : 40, valueY = y + 18 + labelHeight + 16;
        const valueHeight = text(teamMetricValue(side, id, historicalUnavailable(s)), left + 18, valueY, cellWidth - 36, valueSize, t.accent, "left", "900");
        if (valueY + valueHeight > y + cellHeight - 12) throw new Error("Valeur KPI trop longue pour cette composition. Réduisez le nombre de KPI ou choisissez Story.");
      }
      if (!historicalUnavailable(s) && teamMetrics.includes("average") && side.team_stats?.average_players) text(`Moyenne : ${side.team_stats.average_players} joueurs avec données`, cx, footerY - 54, 434, 17, "#aab6c8", "center");
      continue;
    }
    for (const [j, p] of side.players.entries()) {
      const y = playersY + j * rowHeight, data = playerCardData(s, p), photo = photos[photoIndex++];
      c.save(); c.fillStyle = p.featured ? "#161f2dea" : "#09111cdd"; c.strokeStyle = t.accent + (p.featured ? "ff" : "55"); c.lineWidth = p.featured ? 2 : 1; c.beginPath(); c.roundRect(x, y, 452, rowHeight - 10, 14); c.fill(); c.stroke(); c.restore();
      const radius = rowHeight > 118 ? 27 : 21, px = x + 36, py = y + 38;
      c.save(); c.beginPath(); c.arc(px, py, radius, 0, Math.PI * 2); c.clip(); c.fillStyle = t.background; c.fillRect(px - radius, py - radius, radius * 2, radius * 2);
      if (photo) drawPortrait(c, photo, DEFAULT_CROP, px - radius, py - radius, radius * 2);
      else text(data.initials, px, py - 12, radius * 2 - 3, 20, t.light, "center", "700"); c.restore();
      const statY = y + rowHeight - 62;
      const nameHeight = text(p.name + (p.captain ? " · C" : ""), x + 73, y + 9, 366, 21, "#f9f8f5", "left", "700");
      if (p.nickname) {
        const nicknameY = y + 13 + nameHeight;
        const nicknameHeight = text(p.nickname, x + 73, nicknameY, 358, 16, t.light);
        if (nicknameY + nicknameHeight > statY - 4) throw new Error("Surnom trop dense pour ce format. Choisissez Story ou réduisez la sélection.");
      }
      for (const [k, metric] of s.metrics.entries()) {
        const mx = x + 14 + k * (424 / s.metrics.length), definition = CARD_METRICS.find(m => m.id === metric)!;
        const labels: Record<string, string> = { average: "MOY. 3 FL.", winRate: "LEGS GAGNÉS", finish: "BEST FINISH" };
        text(labels[metric] || definition.cardLabel, mx, statY, 424 / s.metrics.length - 8, 12, "#a7b6c9");
        const valueHeight = text(metricValue(metric, data.stats), mx, statY + 16, 424 / s.metrics.length - 8, 24, t.accent, "left", "900");
        if (valueHeight > 30) throw new Error("Valeur KPI trop longue pour cette composition. Réduisez le nombre de KPI.");
      }
    }
  }
  text(`Affiliations : Saison ${s.season}  ·  Stats : ${s.stats_label}`, 540, footerY, 950, 20, "#c0cbd9", "center");
  text(historicalUnavailable(s) ? "Historique exact indisponible à cette date · chiffres masqués" : `Référence : ${frenchDate(s.reference_at)} · périmètre des profils championnat`, 540, footerY + 32, 950, 17, "#9caac0", "center");
  const channel = papangueChannel(s);
  if (channel) {
    text("SUIVRE LE MATCH SUR YOUTUBE · PAPANGUE DARTS CLUB", 540, footerY + 60, 950, 18, "#e6b867", "center", "700");
    text(channel, 540, footerY + 85, 950, 22, "#f4f4f1", "center", "700");
    text("974darts.re", 255, footerY + 118, 370, 26, "#e6b867", "center", "700");
    text("Une création NDX Performance Lab", 770, footerY + 124, 490, 18, "#8e9caf", "center");
  } else {
    text("974darts.re", 540, footerY + 74, 950, 26, "#e6b867", "center", "700");
    text("Une création NDX Performance Lab", 540, footerY + 112, 950, 18, "#8e9caf", "center");
  }
  const blob = await pngBlob(canvas);
  return { blob, url: URL.createObjectURL(blob), warnings };
}
