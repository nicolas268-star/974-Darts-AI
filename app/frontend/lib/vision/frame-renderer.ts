import { project, RINGS, type Calibration, type Frame, type Point } from "./engine";
import { FULL_VIEW, type View } from "./calibration-ui";

export type Marker = { point: Point; label: string; active?: boolean };
export type FrameBox = { x: number; y: number; width: number; height: number };
export type GridMode = "FULL" | "ALIGN";
export function imageToView(point: Point, view: View): Point {
  if (![point.x, point.y, view.x, view.y, view.width, view.height].every(Number.isFinite) || view.width <= 0 || view.height <= 0) throw new Error("Vue invalide.");
  return { x: (point.x - view.x) / view.width, y: (point.y - view.y) / view.height };
}
/** The photo AND its grid are rasterised into ONE bitmap: no independent SVG layout can drift. */
export function drawVisionFrame(canvas: HTMLCanvasElement, frame: Frame, calibration: Calibration | null, view: View = FULL_VIEW, markers: Marker[] = [], boxes: FrameBox[] = [], gridMode: GridMode = "FULL") {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Affichage Canvas indisponible.");
  const ctx: CanvasRenderingContext2D = context;
  canvas.width = frame.width; canvas.height = frame.height;
  const source = document.createElement("canvas"); source.width = frame.width; source.height = frame.height;
  const src = source.getContext("2d");
  if (!src) throw new Error("Affichage Canvas indisponible.");
  const image = src.createImageData(frame.width, frame.height); image.data.set(frame.data); src.putImageData(image, 0, 0);
  ctx.drawImage(source, view.x * frame.width, view.y * frame.height, view.width * frame.width, view.height * frame.height, 0, 0, frame.width, frame.height);
  const xy = (p: Point) => { const q = imageToView(p, view); return { x: q.x * frame.width, y: q.y * frame.height }; };
  const size = Math.max(1, frame.width / 500);
  function line(points: Point[]) {
    ctx.beginPath(); points.forEach((point, i) => { const p = xy(point); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.stroke();
  }
  function text(label: string, p: Point) {
    ctx.font = `bold ${Math.max(14, frame.width * .027)}px sans-serif`; ctx.lineWidth = size * 3;
    ctx.strokeStyle = "#05111d"; ctx.strokeText(label, p.x, p.y); ctx.fillStyle = "#ffffff"; ctx.fillText(label, p.x, p.y);
  }
  if (calibration) {
    const mapped = (a: number, r: number) => project(calibration.boardToImage, { x: Math.sin(a) * r, y: -Math.cos(a) * r });
    if (gridMode === "ALIGN") {
      // Reduced, high-contrast overlay: align centre + double/triple rings first, then the 20.
      ctx.lineWidth = size * 1.7;
      ctx.strokeStyle = "#ffffff";
      for (const r of [RINGS[0], RINGS[1]]) line(Array.from({ length: 121 }, (_, i) => mapped(i * Math.PI / 60, r)));
      ctx.strokeStyle = "#53e7ff";
      for (const r of [RINGS[2], RINGS[3]]) line(Array.from({ length: 121 }, (_, i) => mapped(i * Math.PI / 60, r)));
      ctx.strokeStyle = "#ffdf61";
      for (const r of [RINGS[4], RINGS[5]]) line(Array.from({ length: 121 }, (_, i) => mapped(i * Math.PI / 60, r)));
      ctx.strokeStyle = "#ff6f91";
      line([mapped(-Math.PI / 20, RINGS[1]), mapped(-Math.PI / 20, 1)]);
      line([mapped(Math.PI / 20, RINGS[1]), mapped(Math.PI / 20, 1)]);
      line([mapped(0, RINGS[1]), mapped(0, 1.06)]);
      text("20", xy(mapped(0, 1.09)));
    } else {
      ctx.strokeStyle = "#55f5d1"; ctx.lineWidth = size;
      for (const r of RINGS) line(Array.from({ length: 121 }, (_, i) => mapped(i * Math.PI / 60, r)));
      for (let i = 0; i < 20; i++) line([mapped((i + .5) * Math.PI / 10, RINGS[1]), mapped((i + .5) * Math.PI / 10, 1)]);
      text("20", xy(mapped(0, 1.09)));
    }
  }
  for (const box of boxes) {
    ctx.strokeStyle = "#ffc76e"; ctx.lineWidth = size;
    const p = xy(box); ctx.strokeRect(p.x, p.y, box.width / view.width * frame.width, box.height / view.height * frame.height);
  }
  for (const marker of markers) {
    const p = xy(marker.point); ctx.beginPath(); ctx.arc(p.x, p.y, size * 4, 0, Math.PI * 2);
    ctx.fillStyle = marker.active ? "#ffdf61" : "#75e9ff"; ctx.fill(); ctx.strokeStyle = "#05111d"; ctx.lineWidth = size; ctx.stroke();
    text(marker.label, { x: p.x + size * 6, y: p.y - size * 6 });
  }
}
