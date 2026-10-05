import type { Frame } from './engine';

const MAX_SIDE = 960;
// Bound retained canvas memory on phones; never upscale or call a reduced image native.
const MAX_NATIVE_PIXELS = 4_000_000;
type NativeUnavailable = 'source_too_large' | 'canvas_unavailable' | null;
export type Snapshot = {
  frame: Frame; id: string; capturedAt: string; sourceWidth: number; sourceHeight: number;
  nativeCanvas: HTMLCanvasElement | null; nativeUnavailable: NativeUnavailable;
};

export function capture(source: CanvasImageSource, width: number, height: number): Snapshot {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16) throw new Error('Image indisponible. Attendez que la caméra soit prête.');
  const capturedAt = new Date().toISOString();
  let nativeCanvas: HTMLCanvasElement | null = null;
  let nativeUnavailable: NativeUnavailable = width * height > MAX_NATIVE_PIXELS ? 'source_too_large' : null;
  if (!nativeUnavailable) {
    try {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas indisponible');
      context.drawImage(source, 0, 0, width, height);
      nativeCanvas = canvas;
    } catch { nativeUnavailable = 'canvas_unavailable'; }
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Ce navigateur ne permet pas l’analyse Canvas.');
  // Draw the live source once. Native and analysis pixels therefore share one instant.
  ctx.drawImage(nativeCanvas ?? source, 0, 0, canvas.width, canvas.height);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { frame, nativeCanvas, nativeUnavailable, sourceWidth: width, sourceHeight: height, capturedAt,
    id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16)).join('-') };
}

export function nativeSnapshot(snapshot: Snapshot) {
  let image: string | null = null, unavailableReason: NativeUnavailable | 'encoding_failed' = snapshot.nativeUnavailable;
  if (snapshot.nativeCanvas) {
    try {
      const encoded = snapshot.nativeCanvas.toDataURL('image/png');
      if (!encoded.startsWith('data:image/png;base64,')) throw new Error('Encodage PNG indisponible');
      image = encoded;
    } catch { unavailableReason = 'encoding_failed'; }
  }
  return { captureId: snapshot.id, capturedAt: snapshot.capturedAt, width: snapshot.sourceWidth, height: snapshot.sourceHeight,
    analysisWidth: snapshot.frame.width, analysisHeight: snapshot.frame.height,
    scaleX: snapshot.sourceWidth / snapshot.frame.width, scaleY: snapshot.sourceHeight / snapshot.frame.height,
    status: image ? 'available' : 'unavailable', unavailableReason, image };
}
