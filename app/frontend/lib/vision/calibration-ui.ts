import type { Point } from "./engine";

export type View = { x: number; y: number; width: number; height: number };
export type Draft = { points: (Point | null)[]; confirmed: boolean[]; active: number };
export const FULL_VIEW: View = { x: 0, y: 0, width: 1, height: 1 };
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const validPoint = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

export function newDraft(anchors: readonly Point[] = []): Draft {
  const points = Array.from({ length: 5 }, (_, i) => anchors[i] && validPoint(anchors[i]) ? { ...anchors[i] } : null);
  const first = points.findIndex(p => p === null);
  return { points, confirmed: points.map(Boolean), active: first < 0 ? 0 : first };
}
export function setDraftPoint(draft: Draft, point: Point | null): Draft {
  if (point && !validPoint(point)) throw new Error("Point hors image.");
  return { ...draft, points: draft.points.map((p, i) => i === draft.active ? point && { ...point } : p), confirmed: draft.confirmed.map((ok, i) => i === draft.active ? false : ok) };
}
export function confirmDraftPoint(draft: Draft): Draft {
  if (!draft.points[draft.active]) return draft;
  const confirmed = draft.confirmed.map((ok, i) => i === draft.active ? true : ok);
  const next = confirmed.findIndex(ok => !ok);
  return { ...draft, confirmed, active: next < 0 ? draft.active : next };
}
export function zoomView(center: Point, zoom: number): View {
  if (!validPoint(center) || ![1, 2, 4].includes(zoom)) throw new Error("Zoom invalide.");
  const size = 1 / zoom;
  return { x: Math.max(0, Math.min(1 - size, center.x - size / 2)), y: Math.max(0, Math.min(1 - size, center.y - size / 2)), width: size, height: size };
}
/** Coordinates always refer to the ORIGINAL frozen image, never to the enlarged viewport. */
export function viewToImage(view: View, x: number, y: number): Point {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Coordonnées invalides.");
  return { x: clamp(view.x + clamp(x) * view.width), y: clamp(view.y + clamp(y) * view.height) };
}
export function nudgePoint(point: Point, dx: number, dy: number, width: number, height: number): Point {
  if (!validPoint(point) || ![dx, dy, width, height].every(Number.isFinite) || width < 1 || height < 1) throw new Error("Ajustement invalide.");
  return { x: clamp(point.x + dx / width), y: clamp(point.y + dy / height) };
}
