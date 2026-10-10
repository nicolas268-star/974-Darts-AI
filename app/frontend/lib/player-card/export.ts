import type { CardSnapshot } from "./types";
export function filename(snapshot: CardSnapshot) {
  const clean = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 65);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Reunion", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(snapshot.generatedAt));
  return `974darts-${clean(snapshot.data.name)}-${clean(snapshot.data.period)}-${snapshot.format}-${date}.png`;
}
export function pngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Export PNG indisponible.")), "image/png"));
}
export function canShareFile(file: File, nav: Pick<Navigator, "canShare" | "share"> = navigator) {
  try { return typeof nav.share === "function" && typeof nav.canShare === "function" && nav.canShare({ files: [file] }); } catch { return false; }
}
export async function shareFile(file: File, nav: Pick<Navigator, "canShare" | "share"> = navigator): Promise<"shared" | "cancelled" | "unsupported"> {
  if (!canShareFile(file, nav)) return "unsupported";
  try { await nav.share({ files: [file], title: "Ma carte 974Darts" }); return "shared"; }
  catch (error) { if (error instanceof Error && error.name === "AbortError") return "cancelled"; throw error; }
}
export function downloadFile(file: File) {
  const url = URL.createObjectURL(file); const a = document.createElement("a"); a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  // Keep the URL alive long enough for browsers that resolve downloads asynchronously.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
