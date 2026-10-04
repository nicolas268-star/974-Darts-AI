import { calibrate, project, type Calibration, type Frame, type Point } from "./engine";

/** Local colour/geometry proposal, NOT an AI model and NOT automatic score validation. */
export const AUTO_VERSION = "colour-rings-v1";
export type AutoProposal = { calibration: Calibration; ringSupport: number; orientation: "ASSUMED_20_UP" };
export type Adjustment = "LEFT" | "RIGHT" | "UP" | "DOWN" | "GROW" | "SHRINK" | "WIDER" | "NARROWER" | "TALLER" | "SHORTER" | "ROTATE_LEFT" | "ROTATE_RIGHT" | "SECTOR_LEFT" | "SECTOR_RIGHT" | "TILT_LEFT" | "TILT_RIGHT" | "TILT_UP" | "TILT_DOWN";
const TAU = Math.PI * 2;
const unit = (a: number, r = 1): Point => ({ x: Math.sin(a) * r, y: -Math.cos(a) * r });
const cardinals = [unit(0), unit(Math.PI / 2), unit(Math.PI), unit(3 * Math.PI / 2), { x: 0, y: 0 }];
type Raster = { w: number; h: number; colours: Int8Array };
type Ellipse = { center: Point; xx: number; xy: number; yx: number; yy: number };
function validate(frame: Frame) {
  if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height) || Math.min(frame.width, frame.height) < 32 || frame.width * frame.height > 1_000_000 || frame.data.length !== frame.width * frame.height * 4) throw new Error("Image de calibration invalide ou trop grande.");
}
function rasterize(frame: Frame): Raster {
  validate(frame);
  const scale = Math.min(1, 400 / Math.max(frame.width, frame.height));
  const w = Math.round(frame.width * scale), h = Math.round(frame.height * scale), colours = new Int8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (Math.min(frame.height - 1, Math.floor((y + .5) / scale)) * frame.width + Math.min(frame.width - 1, Math.floor((x + .5) / scale))) * 4;
    const [r, g, b] = [frame.data[i], frame.data[i + 1], frame.data[i + 2]];
    if (g > 35 && g > r * 1.12 && g > b * 1.08 && g - Math.min(r, b) > 22) colours[y * w + x] = 1;
    else if (r > 40 && r > g * 1.40 && r > b * 1.20 && r - Math.min(g, b) > 28) colours[y * w + x] = -1;
  }
  return { w, h, colours };
}
const pixel = (r: Raster, p: Point) => {
  const x = Math.round(p.x), y = Math.round(p.y);
  return x < 0 || y < 0 || x >= r.w || y >= r.h ? 0 : r.colours[y * r.w + x];
};
/** A compact green outer Bull is only a candidate. Annular evidence must corroborate it. */
function bullCandidates(r: Raster): Point[] {
  const seen = new Uint8Array(r.colours.length), candidates: { p: Point; size: number }[] = [];
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] || r.colours[i] !== 1) continue;
    const queue = [i]; seen[i] = 1;
    let sx = 0, sy = 0, minX = r.w, minY = r.h, maxX = 0, maxY = 0;
    for (let k = 0; k < queue.length; k++) {
      const q = queue[k], x = q % r.w, y = Math.floor(q / r.w);
      sx += x; sy += y; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, n = ny * r.w + nx;
        if (nx < 0 || ny < 0 || nx >= r.w || ny >= r.h || seen[n] || r.colours[n] !== 1) continue;
        seen[n] = 1; queue.push(n);
      }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (queue.length < 7 || Math.max(bw, bh) > Math.min(r.w, r.h) * .16 || Math.max(bw / bh, bh / bw) > 2.4 || queue.length / (bw * bh) < .24) continue;
    candidates.push({ p: { x: sx / queue.length, y: sy / queue.length }, size: queue.length });
  }
  // Bound work even on colourful backgrounds. Ring arcs are usually rejected by compactness.
  return candidates.sort((a, b) => b.size - a.size).slice(0, 32).map(c => c.p);
}
/** Find an outer double band supported by a triple band on the same ray. A ring light alone fails. */
function ringEdges(r: Raster, bull: Point): Point[] {
  const edges: Point[] = [], maxRadius = Math.hypot(r.w, r.h);
  for (let k = 0; k < 96; k++) {
    const v = unit(k * TAU / 96), runs: { start: number; end: number }[] = [];
    let start = -1;
    for (let d = 2; d < maxRadius; d++) {
      const p = { x: bull.x + v.x * d, y: bull.y + v.y * d };
      if (p.x < 1 || p.y < 1 || p.x >= r.w - 1 || p.y >= r.h - 1) break;
      if (pixel(r, p)) { if (start < 0) start = d; }
      else if (start >= 0) { runs.push({ start, end: d - .5 }); start = -1; }
    }
    for (const outer of runs) {
      const d = outer.end;
      if (d < 32 || outer.end - outer.start < 1 || outer.end - outer.start > .12 * d) continue;
      if (!runs.some(inner => inner.start / d > .51 && inner.end / d < .70 && inner.end / d > .56 && inner.end - inner.start >= 1)) continue;
      if ([.38, .79].some(t => pixel(r, { x: bull.x + v.x * d * t, y: bull.y + v.y * d * t }))) continue;
      edges.push({ x: bull.x + v.x * d, y: bull.y + v.y * d }); break;
    }
  }
  return edges;
}
function linearSolve(a: number[][]): number[] {
  const n = a.length;
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(a[i][c]) > Math.abs(a[pivot][c])) pivot = i;
    if (Math.abs(a[pivot][c]) < 1e-10) throw new Error("Contours insuffisants.");
    [a[c], a[pivot]] = [a[pivot], a[c]];
    const t = a[c][c]; for (let j = c; j <= n; j++) a[c][j] /= t;
    for (let i = 0; i < n; i++) if (i !== c) { const f = a[i][c]; for (let j = c; j <= n; j++) a[i][j] -= f * a[c][j]; }
  }
  return a.map(row => row[n]);
}
function fitEllipse(points: Point[], origin: Point, scale: number): Ellipse {
  const rows = points.map(p => { const x = (p.x - origin.x) / scale, y = (p.y - origin.y) / scale; return [x * x, x * y, y * y, x, y]; });
  const matrix = Array.from({ length: 5 }, (_, i) => [...Array.from({ length: 5 }, (_, j) => rows.reduce((s, row) => s + row[i] * row[j], 0)), rows.reduce((s, row) => s + row[i], 0)]);
  const [a, b, c, d, e] = linearSolve(matrix), det = 4 * a * c - b * b;
  if (a <= 0 || c <= 0 || det <= 0) throw new Error("Le contour trouvé n’est pas une ellipse.");
  const mx = (b * e - 2 * c * d) / det, my = (b * d - 2 * a * e) / det;
  const norm = 1 + a * mx * mx + b * mx * my + c * my * my;
  const delta = Math.hypot(a - c, b), l1 = (a + c + delta) / 2, l2 = (a + c - delta) / 2;
  const r1 = Math.sqrt(norm / l1) * scale, r2 = Math.sqrt(norm / l2) * scale, angle = .5 * Math.atan2(b, a - c);
  if (![r1, r2].every(Number.isFinite) || r1 < 25 || r2 / r1 > 2.7) throw new Error("Cible trop petite ou trop inclinée.");
  return { center: { x: origin.x + mx * scale, y: origin.y + my * scale }, xx: Math.cos(angle) * r1, xy: -Math.sin(angle) * r2, yx: Math.sin(angle) * r1, yy: Math.cos(angle) * r2 };
}
function inEllipse(e: Ellipse, p: Point): Point {
  const x = p.x - e.center.x, y = p.y - e.center.y, det = e.xx * e.yy - e.xy * e.yx;
  return { x: (e.yy * x - e.xy * y) / det, y: (-e.yx * x + e.xx * y) / det };
}
function multiply(a: number[], b: number[]): number[] {
  return Array.from({ length: 9 }, (_, i) => { const row = Math.floor(i / 3), col = i % 3; return a[row * 3] * b[col] + a[row * 3 + 1] * b[col + 3] + a[row * 3 + 2] * b[col + 6]; });
}
function rotation(angle: number) { return [Math.cos(angle), -Math.sin(angle), 0, Math.sin(angle), Math.cos(angle), 0, 0, 0, 1]; }
/** Projective disk map: ellipse boundary plus independently located Bull, up to in-plane rotation. */
function boardMap(e: Ellipse, bull: Point, r: Raster): number[] {
  const q = inEllipse(e, bull), rho = Math.hypot(q.x, q.y);
  if (rho > .35) throw new Error("Centre et contours incohérents.");
  const s = Math.sqrt(1 - rho * rho), f = rho > 1e-8 ? (1 - s) / (rho * rho) : 0;
  const boost = [s + f * q.x * q.x, f * q.x * q.y, q.x, f * q.x * q.y, s + f * q.y * q.y, q.y, q.x, q.y, 1];
  const h = multiply([e.xx, e.xy, e.center.x, e.yx, e.yy, e.center.y, 0, 0, 1], boost);
  let best = Infinity, angle = 0;
  for (let i = 0; i < 720; i++) {
    const p = project(h, unit(i * TAU / 720)), dx = p.x - bull.x, dy = p.y - bull.y;
    const cost = dy < 0 ? Math.abs(Math.atan2(dx, -dy)) : Infinity;
    if (cost < best) { best = cost; angle = i * TAU / 720; }
  }
  const up = multiply(h, rotation(angle));
  // Align the alternating double colours. Which red sector is actually 20 must still be confirmed.
  let phase = 0, fit = -Infinity;
  for (let degree = -18; degree <= 18; degree += .5) {
    const a = degree * Math.PI / 180; let value = -Math.abs(degree) * .002;
    for (let i = 0; i < 20; i++) for (const off of [-3, 0, 3]) {
      const colour = pixel(r, project(up, unit(a + i * Math.PI / 10 + off * Math.PI / 180, .976)));
      value += colour * (i % 2 ? 1 : -1);
    }
    if (value > fit) { fit = value; phase = a; }
  }
  const final = multiply(up, rotation(phase));
  return [final[0] / r.w, final[1] / r.w, final[2] / r.w, final[3] / r.h, final[4] / r.h, final[5] / r.h, ...final.slice(6)];
}
function support(r: Raster, h: number[]): number {
  let ring = 0, blank = 0, changes = 0, previous = 0, red = 0, green = 0;
  const quadrants = [0, 0, 0, 0];
  for (let i = 0; i < 120; i++) {
    const sample = (radius: number) => { const p = project(h, unit(i * TAU / 120, radius)); return pixel(r, { x: p.x * r.w, y: p.y * r.h }); };
    const outer = sample(.977) || sample(.965), inner = sample(.605) || sample(.615);
    if (outer && inner) { ring++; quadrants[Math.floor(i / 30)]++; }
    if (!sample(.4) && !sample(.8)) blank++;
    if (outer < 0) red++; if (outer > 0) green++;
    if (outer && previous && previous !== outer) changes++;
    if (outer) previous = outer;
  }
  return quadrants.some(n => n < 12) || blank < 70 || changes < 12 || changes > 30 || red < 25 || green < 25 ? 0 : ring / 120;
}
export function detectBoard(frame: Frame): AutoProposal {
  const raster = rasterize(frame), proposals: AutoProposal[] = [];
  for (const bull of bullCandidates(raster)) {
    const edges = ringEdges(raster, bull);
    if (edges.length < 52) continue;
    try {
      let ellipse = fitEllipse(edges, bull, Math.min(raster.w, raster.h));
      const filtered = edges.filter(p => { const q = inEllipse(ellipse, p); return Math.abs(Math.hypot(q.x, q.y) - 1) < .04; });
      if (filtered.length < 48) continue;
      ellipse = fitEllipse(filtered, bull, Math.min(raster.w, raster.h));
      const h = boardMap(ellipse, bull, raster), ringSupport = support(raster, h);
      if (ringSupport < .62) continue;
      const calibration = calibrate(cardinals.map(p => project(h, p)));
      proposals.push({ calibration, ringSupport, orientation: "ASSUMED_20_UP" });
    } catch { /* An incoherent candidate is never substituted with invented default points. */ }
  }
  proposals.sort((a, b) => b.ringSupport - a.ringSupport);
  if (!proposals.length) throw new Error("Cible non reconnue : cadrez toute la zone de jeu vide, rapprochez-la dans l’image et vérifiez les couleurs rouge/vert. La calibration manuelle reste disponible.");
  const best = proposals[0];
  if (proposals.slice(1).some(p => p.ringSupport > best.ringSupport - .08 && Math.hypot(p.calibration.anchors[4].x - best.calibration.anchors[4].x, p.calibration.anchors[4].y - best.calibration.anchors[4].y) > .06)) throw new Error("Plusieurs cibles possibles. Cadrez une seule cible avant de relancer.");
  return best;
}
/** Immutable adjustments in original image coordinates; all calls rerun geometric validity checks. */
export function adjustCalibration(current: Calibration, command: Adjustment, width: number, height: number, fine = true): Calibration {
  if (![width, height].every(Number.isFinite) || Math.min(width, height) < 32) throw new Error("Dimensions invalides.");
  const px = fine ? 1 : 5, size = fine ? .01 : .03, rad = (fine ? .5 : 2) * Math.PI / 180;
  let h = [...current.boardToImage]; const c = current.anchors[4];
  const imageTransform = (sx: number, sy: number, dx = 0, dy = 0) => { h = multiply([sx, 0, c.x * (1 - sx) + dx, 0, sy, c.y * (1 - sy) + dy, 0, 0, 1], h); };
  switch (command) {
    case "LEFT": imageTransform(1, 1, -px / width); break;
    case "RIGHT": imageTransform(1, 1, px / width); break;
    case "UP": imageTransform(1, 1, 0, -px / height); break;
    case "DOWN": imageTransform(1, 1, 0, px / height); break;
    case "GROW": imageTransform(1 + size, 1 + size); break;
    case "SHRINK": imageTransform(1 / (1 + size), 1 / (1 + size)); break;
    case "WIDER": imageTransform(1 + size, 1); break;
    case "NARROWER": imageTransform(1 / (1 + size), 1); break;
    case "TALLER": imageTransform(1, 1 + size); break;
    case "SHORTER": imageTransform(1, 1 / (1 + size)); break;
    case "ROTATE_LEFT": h = multiply(h, rotation(-rad)); break;
    case "ROTATE_RIGHT": h = multiply(h, rotation(rad)); break;
    case "SECTOR_LEFT": h = multiply(h, rotation(-Math.PI / 10)); break;
    case "SECTOR_RIGHT": h = multiply(h, rotation(Math.PI / 10)); break;
    case "TILT_LEFT": case "TILT_RIGHT": case "TILT_UP": case "TILT_DOWN": {
      const step = fine ? .005 : .015;
      h = multiply(h, [1, 0, 0, 0, 1, 0, command === "TILT_LEFT" ? -step : command === "TILT_RIGHT" ? step : 0, command === "TILT_UP" ? -step : command === "TILT_DOWN" ? step : 0, 1]); break;
    }
    default: throw new Error("Commande d’ajustement inconnue.");
  }
  return calibrate(cardinals.map(p => project(h, p)));
}
