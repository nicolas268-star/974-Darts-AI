/** Experimental, dependency-free vision lab. Never imports or writes game state. */
export type Point = { x: number; y: number };
export type Frame = { width: number; height: number; data: Uint8ClampedArray };
export type Calibration = { anchors: Point[]; imageToBoard: number[]; boardToImage: number[]; bullError: number };
export type Score = { label: string; value: number; nearWire: boolean };
export type Candidate = { point: Point; score: Score; component: number };
export type Detection = {
  status: "NO_CHANGE" | "CANDIDATES" | "AMBIGUOUS" | "SCENE_CHANGED";
  reason: string; candidates: Candidate[]; boxes: { x: number; y: number; width: number; height: number }[];
  changedFraction: number; brightnessShift: number;
};
export const ENGINE_VERSION = "classical-difference-v1";
export const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5] as const;
// Nominal steel-tip board radii, normalized to the OUTER double wire (170 mm).
export const RINGS = [6.35 / 170, 15.9 / 170, 99 / 170, 107 / 170, 162 / 170, 1] as const;
export const ANCHOR_LABELS = ["20 : milieu du bord extérieur du double", "6 : milieu du bord extérieur du double", "3 : milieu du bord extérieur du double", "11 : milieu du bord extérieur du double", "Centre du Bull (contrôle)"] as const;
const CARDINALS: Point[] = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
const finitePoint = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y);

/** Solve an 8x8 system with partial pivoting. Degenerate calibration must fail closed. */
function solve(matrix: number[][]): number[] {
  const a = matrix.map(row => [...row]);
  for (let c = 0; c < 8; c++) {
    let pivot = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r;
    if (Math.abs(a[pivot][c]) < 1e-9) throw new Error("Repères trop proches ou alignés. Recommencez la calibration.");
    [a[c], a[pivot]] = [a[pivot], a[c]];
    const divisor = a[c][c];
    for (let j = c; j < 9; j++) a[c][j] /= divisor;
    for (let r = 0; r < 8; r++) if (r !== c) {
      const factor = a[r][c];
      for (let j = c; j < 9; j++) a[r][j] -= factor * a[c][j];
    }
  }
  return [...a.map(row => row[8]), 1];
}
function homography(from: Point[], to: Point[]): number[] {
  const rows: number[][] = [];
  from.forEach(({ x, y }, i) => {
    const { x: u, y: v } = to[i];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  });
  return solve(rows);
}
export function project(h: readonly number[], p: Point): Point {
  const z = h[6] * p.x + h[7] * p.y + h[8];
  if (h.length !== 9 || !finitePoint(p) || !Number.isFinite(z) || Math.abs(z) < 1e-9) throw new Error("Projection invalide.");
  const result = { x: (h[0] * p.x + h[1] * p.y + h[2]) / z, y: (h[3] * p.x + h[4] * p.y + h[5]) / z };
  if (!finitePoint(result)) throw new Error("Projection invalide.");
  return result;
}
export function calibrate(anchors: Point[]): Calibration {
  if (anchors.length !== 5 || anchors.some(p => !finitePoint(p) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) throw new Error("Placez les cinq repères dans l’image.");
  const four = anchors.slice(0, 4);
  for (let i = 0; i < 4; i++) {
    const a = four[i], b = four[(i + 1) % 4], c = four[(i + 2) % 4];
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) < 0.01) throw new Error("Ordre incorrect ou cible trop petite : placez 20 → 6 → 3 → 11, sans miroir.");
  }
  const imageToBoard = homography(four, CARDINALS), boardToImage = homography(CARDINALS, four);
  const bull = project(imageToBoard, anchors[4]), bullError = Math.hypot(bull.x, bull.y);
  if (bullError > 0.045) throw new Error("Le Bull ne correspond pas aux quatre repères. Recommencez, caméra plus face à la cible.");
  for (let i = 0; i < 80; i++) {
    const angle = i * Math.PI / 40;
    const p = project(boardToImage, { x: Math.sin(angle), y: -Math.cos(angle) });
    if (p.x < 0.01 || p.x > 0.99 || p.y < 0.01 || p.y > 0.99) throw new Error("Une partie de la cible sort du cadre. Reculez ou recadrez la caméra.");
  }
  return { anchors: anchors.map(p => ({ ...p })), imageToBoard, boardToImage, bullError };
}
export function scorePoint(p: Point): Score {
  if (!finitePoint(p)) throw new Error("Impact invalide.");
  const r = Math.hypot(p.x, p.y);
  const radialMargin = Math.min(...RINGS.map(radius => Math.abs(r - radius)));
  const angle = (Math.atan2(p.x, -p.y) + 2 * Math.PI) % (2 * Math.PI);
  const step = Math.PI / 10;
  const sectorIndex = Math.floor((angle + step / 2) / step) % 20;
  const angularMargin = r * Math.sin(step / 2 - Math.abs(((angle + step / 2) % step) - step / 2));
  const nearWire = radialMargin < 0.018 || (r > RINGS[1] && r <= 1 && angularMargin < 0.018);
  if (r > 1) return { label: "MISS", value: 0, nearWire };
  if (r < RINGS[0]) return { label: "50", value: 50, nearWire };
  if (r < RINGS[1]) return { label: "25", value: 25, nearWire };
  const n = SECTORS[sectorIndex];
  const m = r >= RINGS[4] ? 2 : r >= RINGS[2] && r < RINGS[3] ? 3 : 1;
  return { label: `${m === 3 ? "T" : m === 2 ? "D" : "S"}${n}`, value: n * m, nearWire };
}
export function validLabel(raw: string): string | null {
  const text = raw.trim().toUpperCase();
  return /^(?:[SDT](?:[1-9]|1[0-9]|20)|25|50|MISS|UNKNOWN)$/.test(text) ? text : null;
}
function validateFrame(frame: Frame) {
  if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width < 16 || frame.height < 16 || frame.width * frame.height > 1_000_000 || frame.data.length !== frame.width * frame.height * 4) throw new Error("Image invalide ou trop grande pour le laboratoire.");
}
function sameFrames(a: Frame, b: Frame) {
  validateFrame(a); validateFrame(b);
  if (a.width !== b.width || a.height !== b.height) throw new Error("Les deux images doivent avoir exactement le même cadrage et les mêmes dimensions.");
}
const luminance = (data: Uint8ClampedArray, i: number) => (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) / 256;
/** Fraction of significantly changed samples; deliberately does not claim a dart count. */
export function motionFraction(a: Frame, b: Frame): number {
  sameFrames(a, b);
  let changed = 0, total = 0;
  for (let i = 0; i < a.data.length; i += 4 * 31) { if (Math.abs(luminance(a.data, i) - luminance(b.data, i)) > 22) changed++; total++; }
  return changed / total;
}
export function detect(before: Frame, after: Frame, calibration: Calibration, threshold = 30): Detection {
  sameFrames(before, after);
  if (!Number.isFinite(threshold) || threshold < 12 || threshold > 80) throw new Error("Seuil invalide.");
  const shifts: number[] = [];
  for (let i = 0; i < before.data.length; i += 4 * 47) shifts.push(luminance(after.data, i) - luminance(before.data, i));
  shifts.sort((a, b) => a - b);
  const brightnessShift = shifts[Math.floor(shifts.length / 2)];
  const base = { candidates: [] as Candidate[], boxes: [] as Detection["boxes"], changedFraction: 0, brightnessShift };
  if (Math.abs(brightnessShift) > 24) return { ...base, status: "SCENE_CHANGED", reason: "Éclairage fortement modifié : reprenez une référence et vérifiez la calibration." };
  const step = Math.max(1, Math.ceil(Math.max(before.width, before.height) / 480));
  const w = Math.ceil(before.width / step), h = Math.ceil(before.height / step);
  const mask = new Uint8Array(w * h);
  let roi = 0, changed = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = Math.min(x * step, before.width - 1), py = Math.min(y * step, before.height - 1);
    const p = project(calibration.imageToBoard, { x: px / before.width, y: py / before.height });
    if (Math.hypot(p.x, p.y) > 1.12) continue;
    roi++;
    const i = (py * before.width + px) * 4;
    if (Math.abs(luminance(after.data, i) - luminance(before.data, i) - brightnessShift) > threshold) { mask[y * w + x] = 1; changed++; }
  }
  const changedFraction = changed / Math.max(1, roi);
  const common = { ...base, changedFraction };
  if (changedFraction > 0.16) return { ...common, status: "SCENE_CHANGED", reason: "Changement trop important : main, déplacement de caméra ou éclairage. Aucune fléchette validée." };
  // Remove isolated noise, then find connected components (8-connectivity).
  const clean = new Uint8Array(mask.length);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (!mask[i]) continue;
    let neighbours = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) neighbours += mask[i + dy * w + dx];
    if (neighbours >= 2) clean[i] = 1;
  }
  const components: Point[][] = [];
  for (let i = 0; i < clean.length; i++) {
    if (!clean[i]) continue;
    const queue = [i], points: Point[] = []; clean[i] = 0;
    for (let q = 0; q < queue.length; q++) {
      const index = queue[q], x = index % w, y = Math.floor(index / w);
      points.push({ x: x * step / before.width, y: y * step / before.height });
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (clean[ni]) { clean[ni] = 0; queue.push(ni); }
      }
    }
    if (points.length >= 8) components.push(points);
  }
  if (!components.length) return { ...common, status: "NO_CHANGE", reason: "Aucun changement exploitable. Cela ne signifie pas qu’un lancer raté a eu lieu." };
  if (components.length > 5) return { ...common, status: "SCENE_CHANGED", reason: "Trop de changements dispersés : vérifiez le cadrage et l’éclairage." };
  const candidates: Candidate[] = [], boxes: Detection["boxes"] = [];
  components.sort((a, b) => b.length - a.length);
  for (const [component, points] of components.entries()) {
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
    boxes.push({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
    const cx = xs.reduce((a, b) => a + b, 0) / points.length, cy = ys.reduce((a, b) => a + b, 0) / points.length;
    let xx = 0, yy = 0, xy = 0;
    for (const p of points) { xx += (p.x - cx) ** 2; yy += (p.y - cy) ** 2; xy += (p.x - cx) * (p.y - cy); }
    const root = Math.hypot(xx - yy, 2 * xy), major = (xx + yy + root) / 2, minor = (xx + yy - root) / 2;
    if (component > 1 || major < 4 * Math.max(minor, 1e-8) || Math.hypot(maxX - minX, maxY - minY) < 0.025) continue;
    const angle = 0.5 * Math.atan2(2 * xy, xx - yy), ux = Math.cos(angle), uy = Math.sin(angle);
    const ordered = points.map(point => ({ point, t: (point.x - cx) * ux + (point.y - cy) * uy })).sort((a, b) => a.t - b.t);
    const endCount = Math.max(1, Math.floor(ordered.length * 0.04));
    for (const end of [ordered.slice(0, endCount), ordered.slice(-endCount)]) {
      const point = { x: end.reduce((s, item) => s + item.point.x, 0) / end.length, y: end.reduce((s, item) => s + item.point.y, 0) / end.length };
      candidates.push({ point, score: scorePoint(project(calibration.imageToBoard, point)), component });
    }
  }
  return { ...common, candidates, boxes, status: candidates.length ? "CANDIDATES" : "AMBIGUOUS", reason: candidates.length ? "Extrémités de silhouette proposées, sans certitude sur la pointe. Touchez le véritable point d’entrée et confirmez le secteur observé." : "Changement détecté mais pointe indéterminable. Annotez manuellement ; aucune décision automatique." };
}
