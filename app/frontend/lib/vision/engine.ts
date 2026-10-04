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
export const ENGINE_VERSION = "classical-difference-v1.3";
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
export function validateFrame(frame: Frame) {
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

type FragmentGeometry = {
  cx: number; cy: number; ux: number; uy: number; ratio: number;
  minX: number; maxX: number; minY: number; maxY: number;
};
/** Geometry in capture pixels; callers never infer a tip from the axis direction. */
function fragmentGeometry(points: Point[]): FragmentGeometry {
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  let xx = 0, yy = 0, xy = 0;
  for (const p of points) { const x = p.x - cx, y = p.y - cy; xx += x * x; yy += y * y; xy += x * y; }
  const root = Math.hypot(xx - yy, 2 * xy), angle = .5 * Math.atan2(2 * xy, xx - yy);
  return {
    cx, cy, ux: Math.cos(angle), uy: Math.sin(angle), ratio: (xx + yy + root) / Math.max(1e-8, xx + yy - root),
    minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)),
    minY: Math.min(...points.map(p => p.y)), maxY: Math.max(...points.map(p => p.y)),
  };
}

/**
 * Bounded fallback for one already admitted silhouette with no usable endpoints.
 * Full resolution can recover a thin fragment lost at the coarse sampling step.
 * Both fragments must independently pass the original difference/novelty gates;
 * no closing, invented line pixels, lower global threshold or score preference.
 */
function refineFragments(
  before: Frame, after: Frame, calibration: Calibration, threshold: number,
  validMask: Uint8Array | undefined, brightnessShift: number, seed: Point[],
): Pick<Detection, "candidates" | "boxes"> | null {
  const width = before.width, height = before.height, unit = Math.max(width, height) / 960;
  const seedPixels = seed.map(p => ({ x: Math.round(p.x * width), y: Math.round(p.y * height) }));
  const seedSites = new Set(seedPixels.map(p => p.y * width + p.x));
  const seedGeometry = fragmentGeometry(seedPixels);
  const padding = Math.ceil(Math.min(24 * unit, Math.max(8 * unit,
    .75 * Math.hypot(seedGeometry.maxX - seedGeometry.minX, seedGeometry.maxY - seedGeometry.minY))));
  const left = Math.max(1, seedGeometry.minX - padding), top = Math.max(1, seedGeometry.minY - padding);
  const right = Math.min(width - 2, seedGeometry.maxX + padding), bottom = Math.min(height - 2, seedGeometry.maxY + padding);
  const w = right - left + 1, h = bottom - top + 1;
  if (w < 3 || h < 3 || w > 96 || h > 96) return null;
  const eligible = (x: number, y: number) => {
    if (x < left || x > right || y < top || y > bottom || (validMask && !validMask[y * width + x])) return false;
    const p = project(calibration.imageToBoard, { x: x / width, y: y / height });
    return Math.hypot(p.x, p.y) <= 1.12;
  };
  const isNovel = (x: number, y: number) => {
    let low = Infinity, high = -Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height || (validMask && !validMask[ny * width + nx])) return false;
      const value = luminance(before.data, (ny * width + nx) * 4);
      low = Math.min(low, value); high = Math.max(high, value);
    }
    const value = luminance(after.data, (y * width + x) * 4) - brightnessShift;
    return value < low - threshold || value > high + threshold;
  };
  const mask = new Uint8Array(w * h), clean = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = left + x, py = top + y, k = (py * width + px) * 4;
    if (eligible(px, py) && Math.abs(luminance(after.data, k) - luminance(before.data, k) - brightnessShift) > threshold) mask[y * w + x] = 1;
  }
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (!mask[i]) continue;
    let neighbours = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) neighbours += mask[i + dy * w + dx];
    if (neighbours >= 2) clean[i] = 1;
  }
  const fragments: { points: Point[]; geometry: FragmentGeometry; seedOverlap: number }[] = [];
  for (let i = 0; i < clean.length; i++) {
    if (!clean[i]) continue;
    const queue = [i], points: Point[] = []; clean[i] = 0;
    for (let q = 0; q < queue.length; q++) {
      const index = queue[q], x = index % w, y = Math.floor(index / w);
      points.push({ x: x + left, y: y + top });
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const ni = ny * w + nx;
        if (clean[ni]) { clean[ni] = 0; queue.push(ni); }
      }
    }
    if (points.length < 8) continue;
    let novelSites = 0;
    for (const p of points) {
      if (isNovel(p.x, p.y)) novelSites++;
      if (novelSites >= 3) break;
    }
    if (novelSites < 3) continue;
    const geometry = fragmentGeometry(points);
    // The clean mask excludes the outside row. Reject its adjacent row as well,
    // so clipping cannot manufacture a new fragment endpoint.
    if (geometry.minX <= left + 1 || geometry.maxX >= right - 1 || geometry.minY <= top + 1 || geometry.maxY >= bottom - 1) return null;
    fragments.push({ points, geometry, seedOverlap: points.filter(p => seedSites.has(p.y * width + p.x)).length });
    if (fragments.length > 2) return null;
  }
  // Refuse a choice between competing extensions, even if only one looks likely.
  if (fragments.length !== 2) return null;
  fragments.sort((a, b) => b.seedOverlap - a.seedOverlap);
  const [a, b] = fragments;
  if (a.seedOverlap < 8 || b.seedOverlap >= 8 || a.geometry.ratio < 2 || b.geometry.ratio < 4) return null;
  const angle = Math.acos(Math.min(1, Math.abs(a.geometry.ux * b.geometry.ux + a.geometry.uy * b.geometry.uy))) * 180 / Math.PI;
  const perpendicular = Math.abs((b.geometry.cx - a.geometry.cx) * a.geometry.uy - (b.geometry.cy - a.geometry.cy) * a.geometry.ux);
  const points = [...a.points, ...b.points], geometry = fragmentGeometry(points);
  const projection = (p: Point) => (p.x - geometry.cx) * geometry.ux + (p.y - geometry.cy) * geometry.uy;
  const ta = a.points.map(projection), tb = b.points.map(projection);
  const minA = Math.min(...ta), maxA = Math.max(...ta), minB = Math.min(...tb), maxB = Math.max(...tb);
  const span = Math.max(maxA, maxB) - Math.min(minA, minB), gap = Math.max(0, minB - maxA, minA - maxB);
  // All distances are capture pixels scaled to the 960px capture convention.
  if (gap <= 0 || angle > 10 || perpendicular > 2.5 * unit || gap > Math.min(16 * unit, .4 * span)
    || geometry.ratio < 4 || Math.hypot((geometry.maxX - geometry.minX) / width, (geometry.maxY - geometry.minY) / height) < .025) return null;
  const start = maxA < minB ? maxA : maxB, end = maxA < minB ? minB : minA;
  const fragmentSites = new Set(points.map(p => p.y * width + p.x));
  let novelBridge = false;
  let hits = 0, total = 0, emptyRun = 0;
  for (let t = start + 1; t < end; t++) {
    const cx = geometry.cx + t * geometry.ux, cy = geometry.cy + t * geometry.uy;
    if (!eligible(Math.round(cx), Math.round(cy))) return null;
    let hit = false;
    for (let cross = -3 * unit; cross <= 3 * unit; cross += 1) {
      const x = Math.round(cx - cross * geometry.uy), y = Math.round(cy + cross * geometry.ux);
      // Invalid/hidden pixels are an absolute barrier, never a tolerable gap.
      if (!eligible(x, y)) return null;
      if (mask[(y - top) * w + x - left]) {
        hit = true;
        const position = projection({ x, y });
        // A shifted old wire can fill this corridor with differences. Require
        // independent new evidence strictly between the observed fragments;
        // rounding an endpoint into the corridor must not count as a bridge.
        if (!novelBridge && !fragmentSites.has(y * width + x) && position > start + 1e-7 && position < end - 1e-7 && isNovel(x, y)) novelBridge = true;
      }
    }
    total++;
    if (hit) { hits++; emptyRun = 0; }
    else if (++emptyRun > 4 * unit) return null;
  }
  if (!total || hits < total * .5 || !novelBridge) return null;
  const ordered = points.map(point => ({ point, t: projection(point) })).sort((a, b) => a.t - b.t);
  const first = ordered[0].t, last = ordered[ordered.length - 1].t;
  const ends = [ordered.filter(item => item.t - first < 1 - 1e-7), ordered.filter(item => last - item.t < 1 - 1e-7)];
  const candidates = ends.map(end => {
    const point = { x: end.reduce((sum, item) => sum + item.point.x, 0) / end.length / width,
      y: end.reduce((sum, item) => sum + item.point.y, 0) / end.length / height };
    return { point, score: scorePoint(project(calibration.imageToBoard, point)), component: 0 };
  });
  return { candidates, boxes: [{ x: geometry.minX / width, y: geometry.minY / height,
    width: (geometry.maxX - geometry.minX) / width, height: (geometry.maxY - geometry.minY) / height }] };
}

export function detect(before: Frame, after: Frame, calibration: Calibration, threshold = 30, validMask?: Uint8Array, brightnessOverride?: number): Detection {
  sameFrames(before, after);
  if (!Number.isFinite(threshold) || threshold < 12 || threshold > 80) throw new Error("Seuil invalide.");
  if (validMask && validMask.length !== before.width * before.height) throw new Error("Masque invalide.");
  if (brightnessOverride !== undefined && !Number.isFinite(brightnessOverride)) throw new Error("Compensation invalide.");
  const shifts: number[] = [];
  for (let i = 0; i < before.data.length; i += 4 * 47) shifts.push(luminance(after.data, i) - luminance(before.data, i));
  shifts.sort((a, b) => a - b);
  const brightnessShift = brightnessOverride ?? shifts[Math.floor(shifts.length / 2)];
  const base = { candidates: [] as Candidate[], boxes: [] as Detection["boxes"], changedFraction: 0, brightnessShift };
  if (Math.abs(brightnessShift) > 24) return { ...base, status: "SCENE_CHANGED", reason: "Éclairage fortement modifié : reprenez une référence et vérifiez la calibration." };
  const step = Math.max(1, Math.ceil(Math.max(before.width, before.height) / 480));
  const w = Math.ceil(before.width / step), h = Math.ceil(before.height / step);
  const mask = new Uint8Array(w * h);
  let roi = 0, changed = 0, valid = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = Math.min(x * step, before.width - 1), py = Math.min(y * step, before.height - 1);
    const p = project(calibration.imageToBoard, { x: px / before.width, y: py / before.height });
    if (Math.hypot(p.x, p.y) > 1.12) continue;
    roi++;
    if (validMask && !validMask[py * before.width + px]) continue;
    valid++;
    const i = (py * before.width + px) * 4;
    if (Math.abs(luminance(after.data, i) - luminance(before.data, i) - brightnessShift) > threshold) { mask[y * w + x] = 1; changed++; }
  }
  const changedFraction = changed / Math.max(1, roi);
  const common = { ...base, changedFraction };
  if (valid / Math.max(1, roi) < .98) return { ...common, status: "SCENE_CHANGED", reason: "Couverture valide insuffisante." };
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
    if (points.length >= 8) {
      // A subpixel wire/texture displacement can leave a long, thin residual.
      // Admit a component only when at least three sampled sites contain new
      // luminance beyond the ORIGINAL reference's local range. One capture
      // pixel of tolerance is independent of the detector's subsampling step.
      // Keep all original points after admission so this check does not erode
      // a thin shaft or move its proposed endpoints. It does not identify a tip.
      let novelSites = 0;
      for (const point of points) {
        const px = Math.round(point.x * before.width), py = Math.round(point.y * before.height);
        let low = Infinity, high = -Infinity, complete = true;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx, ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= before.width || ny >= before.height || (validMask && !validMask[ny * before.width + nx])) { complete = false; continue; }
          const value = luminance(before.data, (ny * before.width + nx) * 4);
          low = Math.min(low, value); high = Math.max(high, value);
        }
        const value = luminance(after.data, (py * before.width + px) * 4) - brightnessShift;
        if (complete && (value < low - threshold || value > high + threshold)) novelSites++;
        if (novelSites >= 3) break;
      }
      if (novelSites >= 3) components.push(points);
    }
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
    // Image-normalized x/y have different units on non-square captures. Use
    // capture pixels for the axis and its projections, retaining normalized
    // points only for the overlay and calibration contract.
    for (const p of points) {
      const dx = (p.x - cx) * before.width, dy = (p.y - cy) * before.height;
      xx += dx ** 2; yy += dy ** 2; xy += dx * dy;
    }
    const root = Math.hypot(xx - yy, 2 * xy), major = (xx + yy + root) / 2, minor = (xx + yy - root) / 2;
    if (component > 1 || major < 4 * Math.max(minor, 1e-8) || Math.hypot(maxX - minX, maxY - minY) < 0.025) continue;
    const angle = 0.5 * Math.atan2(2 * xy, xx - yy), ux = Math.cos(angle), uy = Math.sin(angle);
    const ordered = points.map(point => ({ point, t: (point.x - cx) * before.width * ux + (point.y - cy) * before.height * uy })).sort((a, b) => a.t - b.t);
    // A percentage of the silhouette pulls an endpoint back as a flight gets
    // larger. Average only the terminal band, strictly less than one sampling
    // step deep. The tiny tolerance keeps an exactly adjacent sample out despite
    // floating-point roundoff. These remain silhouette ends, not verified tips.
    const terminalDepth = step * (1 - 1e-7), first = ordered[0].t, last = ordered[ordered.length - 1].t;
    const ends = [ordered.filter(item => item.t - first < terminalDepth), ordered.filter(item => last - item.t < terminalDepth)];
    for (const end of ends) {
      const point = { x: end.reduce((s, item) => s + item.point.x, 0) / end.length, y: end.reduce((s, item) => s + item.point.y, 0) / end.length };
      candidates.push({ point, score: scorePoint(project(calibration.imageToBoard, point)), component });
    }
  }
  if (!candidates.length && components.length === 1) {
    const refined = refineFragments(before, after, calibration, threshold, validMask, brightnessShift, components[0]);
    if (refined) { candidates.push(...refined.candidates); boxes.splice(0, boxes.length, ...refined.boxes); }
  }
  return { ...common, candidates, boxes, status: candidates.length ? "CANDIDATES" : "AMBIGUOUS", reason: candidates.length ? "Extrémités de silhouette proposées, sans certitude sur la pointe. Touchez le véritable point d’entrée et confirmez le secteur observé." : "Changement détecté mais pointe indéterminable. Annotez manuellement ; aucune décision automatique." };
}
