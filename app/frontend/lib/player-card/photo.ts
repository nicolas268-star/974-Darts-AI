import type { Crop } from "./types";
export const DEFAULT_MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export function validatePhotoFile(file: Pick<File, "type" | "size" | "name">, limit = DEFAULT_MAX_PHOTO_BYTES) {
  if (/hei[cf]/i.test(file.type + file.name)) throw new Error("Photo HEIC/HEIF incompatible. Exportez-la en JPEG ou choisissez une autre photo.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choisissez une photo JPEG, PNG ou WebP.");
  if (!file.size || file.size > limit) throw new Error(`La photo doit peser moins de ${Math.round(limit / 1024 / 1024)} Mo.`);
}
export function cropRectangle(width: number, height: number, crop: Crop) {
  const side = Math.min(width, height) / Math.max(1, Math.min(3, crop.zoom));
  return { sx: (width - side) * Math.max(0, Math.min(1, crop.x)), sy: (height - side) * Math.max(0, Math.min(1, crop.y)), side };
}
export async function decodeImage(url: string): Promise<HTMLImageElement> {
  const image = new Image(); image.src = url;
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight) throw new Error("Photo illisible.");
  return image;
}
export async function normalizePhoto(file: File, limit = DEFAULT_MAX_PHOTO_BYTES): Promise<string> {
  validatePhotoFile(file, limit);
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!(file.type === "image/png" && png || file.type === "image/jpeg" && jpeg || file.type === "image/webp" && webp)) throw new Error("Ce fichier n’est pas une photo JPEG, PNG ou WebP valide.");
  const url = URL.createObjectURL(file);
  try {
    // Native image decoding applies EXIF orientation; re-encoding discards all metadata.
    const image = await decodeImage(url);
    const w = image.naturalWidth, h = image.naturalHeight;
    if (Math.min(w, h) < 64 || w * h > 40_000_000 || Math.max(w, h) > 16000) throw new Error("Dimensions incompatibles : au moins 64 px et au plus 40 mégapixels.");
    const scale = Math.min(1, 1600 / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Traitement photo indisponible.");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch (error) {
    if (error instanceof Error && /Dimensions/.test(error.message)) throw error;
    throw new Error("Cette photo ne peut pas être lue. Essayez un autre JPEG, PNG ou WebP.");
  } finally { URL.revokeObjectURL(url); }
}
export function drawPortrait(ctx: CanvasRenderingContext2D, image: HTMLImageElement, crop: Crop, x: number, y: number, diameter: number) {
  const { sx, sy, side } = cropRectangle(image.naturalWidth, image.naturalHeight, crop);
  ctx.drawImage(image, sx, sy, side, side, x, y, diameter, diameter);
}
export class CameraSession {
  private generation = 0;
  private stream: MediaStream | null = null;
  stop() { this.generation++; this.stream?.getTracks().forEach(t => t.stop()); this.stream = null; }
  async start(media: Pick<MediaDevices, "getUserMedia">, facing: "user" | "environment") {
    this.stop(); const generation = this.generation;
    const stream = await media.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 1280 } } });
    if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return null; }
    this.stream = stream; return stream;
  }
}
export function cameraError(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Accès caméra refusé. Autorisez-la dans le navigateur ou importez une photo.";
  if (name === "NotFoundError") return "Aucune caméra disponible. Importez une photo.";
  if (name === "NotReadableError") return "Caméra occupée. Fermez l’autre application ou importez une photo.";
  return "Caméra indisponible. Vous pouvez importer une photo.";
}
