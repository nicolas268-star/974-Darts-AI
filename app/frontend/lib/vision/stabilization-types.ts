import type { Frame } from './engine';
export const STABILIZATION_VERSION = 'similarity-v1';
export const COORDINATES = 'T_current_to_reference: centred original capture pixels; inverse sampling; normalized reference annotation' as const;
export type Similarity = { dx: number; dy: number; rotation: number; scale: number };
export type StabilizationState = 'IDENTITY' | 'ALIGNED' | 'REJECTED' | 'CANCELLED';
export type StabilizationMetrics = {
  errorBefore: number; errorAfter: number; improvement: number; textureRegions: number;
  concordantRegions: number; sectors: number; validFraction: number; brightnessShift: number;
  sharpnessRatio: number; saturatedFraction: number; elapsedMs: number; allocatedBytes: number;
};
export type Stabilization = {
  version: string; state: StabilizationState; reason: string; transform: Similarity;
  metrics: StabilizationMetrics; aligned: Frame | null; validMask: Uint8Array | null;
};
export const IDENTITY: Similarity = { dx: 0, dy: 0, rotation: 0, scale: 1 };
