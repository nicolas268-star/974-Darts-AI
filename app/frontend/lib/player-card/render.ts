import type { CardSnapshot } from "./types";
import { CARD_SIZE } from "./types";
import { THEMES } from "./themes";
import { formatNumber, winRate } from "./data";
import { decodeImage, drawPortrait } from "./photo";

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
  const d = snapshot.data, s = d.stats;
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
  // Deterministic sparks and target segments; all identity and numbers are drawn separately.
  c.save(); for (let i = 0; i < 100; i++) { const x = (i * 307 + 19) % W, y = (i * 173 + 71) % H; c.globalAlpha = 0.07 + (i % 4) * 0.035; c.fillStyle = theme.light; c.fillRect(x, y, 1.5, 1.5); } c.restore();
  c.save(); c.strokeStyle = theme.accent; c.globalAlpha = 0.065; c.lineWidth = 2;
  for (const r of [170, 185, 310, 330, 440]) { c.beginPath(); c.arc(1000, story ? 870 : 530, r, 0, Math.PI * 2); c.stroke(); }
  for (let i = 0; i < 20; i++) { const a = i * Math.PI / 10; c.beginPath(); c.moveTo(1000 + Math.cos(a) * 185, (story ? 870 : 530) + Math.sin(a) * 185); c.lineTo(1000 + Math.cos(a) * 440, (story ? 870 : 530) + Math.sin(a) * 440); c.stroke(); } c.restore();
  c.save(); c.strokeStyle = theme.accent + "88"; c.lineWidth = 1; c.beginPath(); c.roundRect(24, 24, W - 48, H - 48, 32); c.stroke(); c.restore();
  const top = story ? 194 : 66;
  text("974", 64, top, 240, 88, "#fafafa", "900");
  c.save(); c.font = `italic 800 80px ${theme.displayFont}`; c.fillStyle = theme.accent; c.fillText("Darts", 237, top + 72); c.restore();
  text("LA RÉUNION JOUE FLÉCHETTES", 68, top + 104, 730, 19, "#aab2b7");
  line(64, top + 148, 952, 0.35);
  const periodY = top + 170;
  text(d.period, 64, periodY, 952, 25, theme.light, "600", "left", 22);
  if (d.competition) text(d.competition, 64, periodY + 58, 952, 21, "#b7c0c8");

  const radius = story ? 170 : 154, cx = story ? 540 : 252, cy = story ? 618 : 487;
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
  const nx = story ? 540 : 466, nameY = story ? 815 : 363, nameWidth = story ? 920 : 550;
  const nameHeight = text(d.name.toLocaleUpperCase("fr-FR"), nx, nameY, nameWidth, story ? 88 : 94, "#f7f7f5", "900", story ? "center" : "left", 36);
  let affiliationY = nameY + nameHeight + 16;
  if (d.nickname) { text(d.nickname, nx, affiliationY, nameWidth, 43, theme.accent, "700", story ? "center" : "left", 30); affiliationY += 61; }
  const affiliationWidth = story ? 920 : 545;
  for (const affiliation of [d.club, d.team].filter((v): v is string => Boolean(v))) {
    affiliationY += text(affiliation, nx, affiliationY, affiliationWidth, 27, "#b9c3cb", "400", story ? "center" : "left", 22) + 8;
  }

  const primaryY = story ? 1120 : 777, primaryH = story ? 205 : 210;
  panel(64, primaryY, 952, primaryH);
  const primary = [
    { label: "MOYENNE 3 FLÉCHETTES", value: formatNumber(s.average), detail: "" },
    { label: "MEILLEUR FINISH", value: formatNumber(s.finish, 0), detail: "" },
    { label: "LEGS GAGNÉS", value: winRate(s.won, s.played) === null ? "—" : `${formatNumber(winRate(s.won, s.played), 1)} %`, detail: s.won !== null && s.played !== null ? `${s.won} / ${s.played} legs` : "" },
  ];
  primary.forEach((metric, i) => {
    const x = 64 + (952 / 3) * (i + 0.5);
    if (i) { c.save(); c.strokeStyle = "#ffffff22"; c.beginPath(); c.moveTo(64 + 952 / 3 * i, primaryY + 28); c.lineTo(64 + 952 / 3 * i, primaryY + primaryH - 28); c.stroke(); c.restore(); }
    text(metric.label, x, primaryY + 31, 285, 20, "#c2c9ce", "500", "center", 18);
    text(metric.value, x, primaryY + 79, 283, 72, theme.accent, "900", "center", 52);
    if (metric.detail) text(metric.detail, x, primaryY + 168, 280, 23, "#f0f3f4", "400", "center");
    else line(x - 24, primaryY + 177, 48);
  });
  const secondaryY = primaryY + primaryH + 24;
  panel(64, secondaryY, 952, 133);
  [["First 9", formatNumber(s.first9)], ["Meilleure moyenne", formatNumber(s.bestAverage)], ["100+", formatNumber(s.scores100, 0)], ["140+", formatNumber(s.scores140, 0)]].forEach(([label, value], i) => {
    const x = 64 + 238 * (i + 0.5); text(label, x, secondaryY + 23, 220, 21, "#b8c2ca", "400", "center", 18); text(value, x, secondaryY + 62, 218, 47, "#f7f8f8", "800", "center", 38);
  });
  const footerY = story ? 1532 : 1191;
  if (d.demonstration) text("Statistiques de démonstration — à actualiser", 540, footerY - 36, 952, 22, "#cbd1d5", "400", "center");
  else if (!d.hasData) text("Aucune statistique disponible pour cette période", 540, footerY - 36, 952, 22, "#cbd1d5", "400", "center");
  text("Mon jeu. Mes stats. Ma carte.", 540, footerY, 952, 32, theme.light, "600", "center");
  text("974darts.re", 540, footerY + 46, 400, 24, "#f6f7f8", "600", "center");
  const date = new Intl.DateTimeFormat("fr-FR", { timeZone: "Indian/Reunion", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(snapshot.generatedAt));
  text(`Une création NDX Performance Lab  ·  ${date}`, 540, footerY + 84, 952, 21, "#b4bdc4", "400", "center");
  return { canvas, warnings };
}
