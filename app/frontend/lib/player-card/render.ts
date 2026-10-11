import type { CardSnapshot } from "./types";
import { CARD_SIZE } from "./types";
import { THEMES } from "./themes";
import { decodeImage, drawPhoto, drawPortrait } from "./photo";
import { CARD_METRICS, metricCells, metricValue, selectedMetrics } from "./metrics";

export function fitText(ctx: CanvasRenderingContext2D, text: string, width: number, size: number, min: number, family: string, weight = "400") {
  while (size > min) { ctx.font = `${weight} ${size}px ${family}`; if (ctx.measureText(text).width <= width) break; size--; }
  ctx.font = `${weight} ${size}px ${family}`;
  const lines: string[] = []; let line = "";
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= width) { line = candidate; continue; }
    if (line) { lines.push(line); line = ""; }
    if (ctx.measureText(word).width <= width) { line = word; continue; }
    // Only split inside a word if a single word itself cannot fit.
    for (const character of Array.from(word)) {
      if (ctx.measureText(line + character).width > width && line) { lines.push(line); line = character; } else line += character;
    }
  }
  if (line) lines.push(line.trim());
  // Extremely long display names remain readable on two lines; the full name is available in the accessible preview label.
  if (lines.length > 2) {
    lines.length = 2;
    while (ctx.measureText(lines[1] + "…").width > width) lines[1] = lines[1].slice(0, -1);
    lines[1] += "…";
  }
  return { size, lines };
}
export async function renderCard(snapshot: CardSnapshot): Promise<{ canvas: HTMLCanvasElement; warnings: string[] }> {
  await document.fonts.ready;
  const theme = THEMES[snapshot.theme]; const story = snapshot.format === "story";
  const { width: W, height: H } = CARD_SIZE[snapshot.format];
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const c = canvas.getContext("2d"); if (!c) throw new Error("Votre navigateur ne permet pas l’export de cette carte.");
  const warnings: string[] = [];
  const [texture, portrait] = await Promise.all([
    theme.texture ? decodeImage(theme.texture).catch(() => { warnings.push("Décor indisponible : fond graphique utilisé."); return null; }) : null,
    snapshot.photo ? decodeImage(snapshot.photo) : null,
  ]);
  const d = snapshot.data, poster = Boolean(portrait && snapshot.photoStyle === "poster");
  const metrics = selectedMetrics(snapshot.metrics);
  const text = (value: string, x: number, y: number, width: number, size = 24, color = "#f4f4f0", weight = "400", align: CanvasTextAlign = "left", min = size) => {
    c.save(); c.fillStyle = color; c.textAlign = align; c.textBaseline = "top";
    const fit = fitText(c, value, width, size, min, theme.font, weight);
    fit.lines.forEach((line, i) => c.fillText(line, x, y + i * fit.size * 1.15)); c.restore();
    return fit.lines.length * fit.size * 1.15;
  };
  const line = (x: number, y: number, w: number, alpha = 1) => { c.save(); c.globalAlpha = alpha; c.strokeStyle = theme.accent; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.stroke(); c.restore(); };
  const panel = (x: number, y: number, w: number, h: number) => {
    c.save(); c.fillStyle = "#0b1015e8"; c.strokeStyle = theme.accent + "70"; c.lineWidth = 1.5;
    c.beginPath(); c.roundRect(x, y, w, h, 20); c.fill(); c.stroke(); c.restore();
  };
  const gradient = c.createLinearGradient(0, 0, W, H); gradient.addColorStop(0, theme.background); gradient.addColorStop(1, "#040709");
  c.fillStyle = gradient; c.fillRect(0, 0, W, H);
  if (texture) {
    c.save(); c.globalAlpha = theme.id === "neige" ? 0.17 : 0.23;
    const scale = Math.max(W / texture.naturalWidth, H / texture.naturalHeight);
    c.drawImage(texture, (W - texture.naturalWidth * scale) / 2, 0, texture.naturalWidth * scale, texture.naturalHeight * scale); c.restore();
    c.save(); c.globalAlpha = 0.48; c.drawImage(texture, 0, H - 250, W, 250); c.restore();
    const fade = c.createLinearGradient(0, H - 270, 0, H); fade.addColorStop(0, "#06090cff"); fade.addColorStop(0.5, "#06090c55"); fade.addColorStop(1, "#06090cbb"); c.fillStyle = fade; c.fillRect(0, H - 270, W, 270);
  }
  if (theme.secondary) {
    c.save();
    const glow = c.createRadialGradient(W * .85, H * .4, 0, W * .85, H * .4, W * .8);
    glow.addColorStop(0, theme.secondary + "24"); glow.addColorStop(1, theme.secondary + "00"); c.fillStyle = glow; c.fillRect(0, 0, W, H);
    if (theme.pattern === "bands") {
      c.globalAlpha = .12;
      [theme.accent, theme.secondary, theme.tertiary!].forEach((color, i) => {
        c.fillStyle = color; c.beginPath(); c.moveTo(W - 290 + i * 95, 0); c.lineTo(W - 245 + i * 95, 0); c.lineTo(W, H * .62 + i * 95); c.lineTo(W, H * .68 + i * 95); c.closePath(); c.fill();
      });
    } c.restore();
  }
  // Deterministic sparks and target segments; all identity and numbers are drawn separately.
  c.save(); for (let i = 0; i < 100; i++) { const x = (i * 307 + 19) % W, y = (i * 173 + 71) % H; c.globalAlpha = 0.07 + (i % 4) * 0.035; c.fillStyle = theme.light; c.fillRect(x, y, 1.5, 1.5); } c.restore();
  c.save(); c.strokeStyle = theme.accent; c.globalAlpha = 0.065; c.lineWidth = 2;
  [170, 185, 310, 330, 440].forEach((r, i) => {
    if (theme.pattern === "rings") { c.strokeStyle = [theme.accent, theme.secondary!, theme.tertiary!][i % 3]; c.lineWidth = 10; c.globalAlpha = .14; }
    c.beginPath(); c.arc(1000, story ? 870 : 530, r, 0, Math.PI * 2); c.stroke();
  });
  c.strokeStyle = theme.accent; c.lineWidth = 2; c.globalAlpha = .065;
  for (let i = 0; i < 20; i++) { const a = i * Math.PI / 10; c.beginPath(); c.moveTo(1000 + Math.cos(a) * 185, (story ? 870 : 530) + Math.sin(a) * 185); c.lineTo(1000 + Math.cos(a) * 440, (story ? 870 : 530) + Math.sin(a) * 440); c.stroke(); } c.restore();
  c.save(); c.strokeStyle = theme.accent + "88"; c.lineWidth = 1; c.beginPath(); c.roundRect(24, 24, W - 48, H - 48, 32); c.stroke(); c.restore();
  if (poster && portrait) {
    // Identical 4:5 crop in the editor and both formats. Fade only the edges; never alter the player's face.
    const w = story ? 620 : 496, h = story ? 775 : 620;
    const layer = document.createElement("canvas"); layer.width = w; layer.height = h;
    const ctx = layer.getContext("2d")!; drawPhoto(ctx, portrait, snapshot.crop, 0, 0, w, h);
    ctx.globalCompositeOperation = "destination-in";
    const sides = ctx.createLinearGradient(0, 0, w, 0); sides.addColorStop(0, "#0000"); sides.addColorStop(.2, "#000f"); sides.addColorStop(.94, "#000f"); sides.addColorStop(1, "#0009"); ctx.fillStyle = sides; ctx.fillRect(0, 0, w, h);
    const edges = ctx.createLinearGradient(0, 0, 0, h); edges.addColorStop(0, "#0000"); edges.addColorStop(.06, "#000f"); edges.addColorStop(.86, "#000f"); edges.addColorStop(1, "#0000"); ctx.fillStyle = edges; ctx.fillRect(0, 0, w, h);
    c.drawImage(layer, story ? 396 : 520, story ? 315 : 130);
  }
  const top = story ? 194 : 66;
  text("974", 64, top, 240, poster ? 56 : 88, "#fafafa", "900");
  c.save(); c.font = `italic 800 ${poster ? 52 : 80}px ${theme.displayFont}`; c.fillStyle = theme.accent; c.fillText("Darts", poster ? 176 : 237, top + (poster ? 47 : 72)); c.restore();
  text("LA RÉUNION JOUE FLÉCHETTES", 68, top + (poster ? 72 : 104), 730, poster ? 14 : 19, "#aab2b7");
  line(64, top + (poster ? 108 : 148), 952, 0.35);
  const periodY = top + (poster ? 132 : 170), identityWidth = poster ? (story ? 330 : 410) : 952;
  text(d.period, 64, periodY, identityWidth, 25, theme.light, "600", "left", 22);
  if (d.competition) text(d.competition, 64, periodY + 58, identityWidth, 21, "#b7c0c8");

  const radius = story ? 170 : 154, cx = story ? 540 : 252, cy = story ? 618 : 487;
  if (!poster) {
  c.save(); c.shadowColor = theme.accent; c.shadowBlur = 26; c.strokeStyle = theme.accent; c.lineWidth = 3;
  c.beginPath(); c.arc(cx, cy, radius + 6, 0, Math.PI * 2); c.stroke(); c.restore();
  c.save(); c.beginPath(); c.arc(cx, cy, radius, 0, Math.PI * 2); c.clip();
  const glow = c.createRadialGradient(cx, cy - 70, 0, cx, cy, radius); glow.addColorStop(0, "#38444e"); glow.addColorStop(1, "#10161b"); c.fillStyle = glow; c.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  if (portrait) drawPortrait(c, portrait, snapshot.crop, cx - radius, cy - radius, radius * 2);
  else {
    text(d.initials, cx, cy - 66, radius * 1.6, 114, "#e4e8e9", "900", "center", 66);
    c.save(); c.globalAlpha = 0.35; c.strokeStyle = theme.accent; c.lineWidth = 3; c.beginPath(); c.moveTo(cx - radius, cy + 96); c.lineTo(cx - 60, cy + 73); c.lineTo(cx - 8, cy + 36); c.lineTo(cx + 30, cy + 61); c.lineTo(cx + radius, cy + 101); c.stroke(); c.restore();
  } c.restore();
  if (!story) text("974DARTS  /  PLAYER", cx, cy + radius + 37, 350, 19, theme.light, "600", "center");
  }
  const centered = story && !poster;
  const nx = poster ? 64 : story ? 540 : 466, nameY = poster ? (story ? 610 : 350) : story ? 815 : 363, nameWidth = poster ? (story ? 330 : 410) : story ? 920 : 550;
  const nameHeight = text(d.name.toLocaleUpperCase("fr-FR"), nx, nameY, nameWidth, poster ? 86 : story ? 88 : 94, "#f7f7f5", "900", centered ? "center" : "left", poster ? 26 : 36);
  let affiliationY = nameY + nameHeight + 16;
  if (d.nickname) { text(d.nickname, nx, affiliationY, nameWidth, 43, theme.accent, "700", centered ? "center" : "left", 30); affiliationY += 61; }
  const affiliationWidth = poster ? nameWidth : story ? 920 : 545;
  for (const affiliation of [d.club, d.team].filter((v): v is string => Boolean(v))) {
    affiliationY += text(affiliation, nx, affiliationY, affiliationWidth, 27, "#b9c3cb", "400", centered ? "center" : "left", 22) + 8;
  }

  for (const cell of metricCells(metrics, snapshot.format)) {
    const definition = CARD_METRICS.find(metric => metric.id === cell.id)!;
    panel(cell.x, cell.y, cell.width, cell.height);
    const center = cell.x + cell.width / 2, large = metrics.length <= 3;
    text(definition.cardLabel, center, cell.y + (large ? 38 : 15), cell.width - 28, cell.compact ? 17 : large ? 22 : 19, "#c2c9ce", "500", "center", cell.compact ? 15 : 17);
    text(metricValue(cell.id, d.stats), center, cell.y + (large ? 117 : cell.compact ? 52 : 67), cell.width - 30, large ? 108 : cell.compact ? 44 : cell.width > 300 ? 68 : 54, theme.accent, "900", "center", cell.compact ? 34 : 42);
    if (!cell.compact) line(center - 24, cell.y + cell.height - (large ? 55 : 16), 48);
  }
  const footerY = story ? 1532 : 1191;
  if (d.demonstration) text("Statistiques de démonstration — à actualiser", 540, footerY - 36, 952, 22, "#cbd1d5", "400", "center");
  else if (!d.hasData) text("Aucune statistique disponible pour cette période", 540, footerY - 36, 952, 22, "#cbd1d5", "400", "center");
  text("Mon jeu. Mes stats. Ma carte.", 540, footerY, 952, 32, theme.light, "600", "center");
  text("974darts.re", 540, footerY + 46, 400, 24, "#f6f7f8", "600", "center");
  const date = new Intl.DateTimeFormat("fr-FR", { timeZone: "Indian/Reunion", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(snapshot.generatedAt));
  text(`Une création NDX Performance Lab  ·  ${date}`, 540, footerY + 84, 952, 21, "#b4bdc4", "400", "center");
  return { canvas, warnings };
}
