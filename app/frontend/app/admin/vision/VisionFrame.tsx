"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Calibration, Frame, Point } from "@/lib/vision/engine";
import { FULL_VIEW, viewToImage, type View } from "@/lib/vision/calibration-ui";
import { drawVisionFrame, type Marker, type FrameBox } from "@/lib/vision/frame-renderer";
const NO_MARKERS: Marker[] = [], NO_BOXES: FrameBox[] = [];
type Props = { frame: Frame; calibration?: Calibration | null; markers?: Marker[]; boxes?: FrameBox[]; view?: View; label: string; onPoint?: (p: Point) => void; onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void };
export default function VisionFrame({ frame, calibration = null, markers = NO_MARKERS, boxes = NO_BOXES, view = FULL_VIEW, label, onPoint, onKeyDown }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    try { if (ref.current) drawVisionFrame(ref.current, frame, calibration, view, markers, boxes); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Affichage indisponible."); }
  }, [frame, calibration, view, markers, boxes]);
  return <>
    <div role={onPoint ? "button" : undefined} tabIndex={onPoint ? 0 : undefined} aria-label={onPoint ? label : undefined} onKeyDown={onKeyDown}
      onClick={event => { if (!onPoint || event.detail === 0 || !ref.current) return; const rect = ref.current.getBoundingClientRect(); if (rect.width && rect.height) onPoint(viewToImage(view, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height)); }}
      style={{ width: "100%", overflow: "hidden", touchAction: "pan-y pinch-zoom", borderRadius: 10, background: "#06101b", cursor: onPoint ? "crosshair" : "default" }}>
      <canvas ref={ref} width={frame.width} height={frame.height} aria-label={label}
        data-vision-frame="true" data-anchors={JSON.stringify(calibration?.anchors ?? [])} data-markers={JSON.stringify(markers)} data-view={JSON.stringify(view)}
        style={{ display: "block", position: "static", width: "100%", height: "auto", maxWidth: "100%", maxHeight: "none", aspectRatio: `${frame.width} / ${frame.height}` }} />
    </div>
    {error && <p role="alert">{error}</p>}
  </>;
}
