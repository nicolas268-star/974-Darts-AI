"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { ANCHOR_LABELS, ENGINE_VERSION, calibrate, motionFraction, project, scorePoint, validLabel, type Calibration, type Detection, type Frame, type Point } from "@/lib/vision/engine";
import { AnalysisClient } from "@/lib/vision/analysis-client";
import { canPromote, type AnalysisResult } from "@/lib/vision/analysis-pipeline";
import { COORDINATES, STABILIZATION_VERSION } from "@/lib/vision/stabilization-types";
import { capture, nativeSnapshot, type Snapshot } from "@/lib/vision/capture";
import { putJournalEntry, listJournalEntries, annotateJournalEntry, clearJournalEntries, buildJournalZip, type JournalSummary } from "@/lib/vision/journal";
import styles from "./vision.module.css";
import CalibrationAssistant from "./CalibrationAssistant";
import VisionFrame from "./VisionFrame";

function metadata(analysis: AnalysisResult) { const { aligned: _aligned, validMask: _mask, ...stabilization } = analysis.stabilization; void _aligned; void _mask; return { sessionId: analysis.sessionId, referenceId: analysis.referenceId, captureId: analysis.captureId, stabilization, rawChangedFraction: analysis.rawChangedFraction, totalMs: analysis.totalMs }; }
type Sample = {
  id: string; capturedAt: string; source: "camera" | "images";
  calibration: Calibration; threshold: number; detection: Detection | null;
  annotation: "LABELLED" | "FALSE_POSITIVE" | "UNRESOLVED";
  annotationMode: "REFERENCE_POINT" | "SECTOR_ONLY";
  truth: string | null; point: Point | null; processingMs: number; analysis: ReturnType<typeof metadata> | null;
};
type WakeHandle = { release: () => Promise<void>; addEventListener: (name: "release", callback: () => void) => void };
const MAX_SAMPLES = 100;

function metric(value: number | null, digits = 2, suffix = "", scale = 1): string {
  return value === null ? "non calculé" : `${(value * scale).toFixed(digits)}${suffix}`;
}

function paint(canvas: HTMLCanvasElement, frame: Frame) {
  canvas.width = frame.width; canvas.height = frame.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const image = ctx.createImageData(frame.width, frame.height); image.data.set(frame.data); ctx.putImageData(image, 0, 0);
}
function imageDataUrl(frame: Frame): string {
  const canvas = document.createElement("canvas"); paint(canvas, frame);
  return canvas.toDataURL("image/png");
}
function maskRuns(mask: Uint8Array): number[][] {
  const runs: number[][] = []; let start = -1;
  for (let i = 0; i <= mask.length; i++) { if (mask[i] && start < 0) start = i; else if (!mask[i] && start >= 0) { runs.push([start, i - start]); start = -1; } }
  return runs;
}
type CaptureContext = {
  before: Snapshot | null; after: Snapshot | null; referenceRaw: Snapshot | null; spatialAnchor: Snapshot | null;
  analysis: AnalysisResult | null; calibration: Calibration | null; result: Detection | null; stabilizationEnabled: boolean;
};
function capturePayload(context: CaptureContext, samples: Sample[], includeImages: boolean) {
  const { before, after, referenceRaw, spatialAnchor, analysis, calibration, result, stabilizationEnabled } = context;
  return {
    schemaVersion: 2, stabilizationVersion: STABILIZATION_VERSION, coordinateConvention: COORDINATES, engineVersion: ENGINE_VERSION, exportedAt: new Date().toISOString(),
    notice: "Laboratoire expérimental : extrémités de silhouettes, pas de modèle IA entraîné ni de validation automatique. Coordonnées image normalisées. Les annotations ne sont pas des scores de partie.",
    samples,
    currentAnalysis: analysis ? { ...metadata(analysis), capturedAt: after?.capturedAt, enabled: stabilizationEnabled, calibration, detection: result, width: after?.frame.width, height: after?.frame.height,
      sourceWidth: after?.sourceWidth, sourceHeight: after?.sourceHeight, anchorId: spatialAnchor?.id,
      sourceTranslation: after ? { dx: analysis.stabilization.transform.dx * after.sourceWidth / after.frame.width, dy: analysis.stabilization.transform.dy * after.sourceHeight / after.frame.height } : null } : null,
    nativePair: includeImages && before && after ? {
      schemaVersion: 1, coordinateConvention: "raw source pixels, unaligned; pixel centers: native=(analysis+0.5)*scale-0.5; undo stabilization before mapping annotations",
      before: nativeSnapshot(referenceRaw ?? before), after: nativeSnapshot(after), spatialAnchor: spatialAnchor ? nativeSnapshot(spatialAnchor) : null,
    } : null,
    currentPair: includeImages && before && after ? { before: imageDataUrl((referenceRaw ?? before).frame), after: imageDataUrl(after.frame), spatialAnchor: spatialAnchor ? imageDataUrl(spatialAnchor.frame) : null, comparisonReference: imageDataUrl(before.frame), aligned: analysis?.stabilization.aligned ? imageDataUrl(analysis.stabilization.aligned) : null, validMask: analysis?.stabilization.validMask ? { encoding: "row-runs-of-valid-pixels", runs: maskRuns(analysis.stabilization.validMask) } : null, captureId: after.id, capturedAt: after.capturedAt, calibration, width: before.frame.width, height: before.frame.height } : null,
  };
}
function downloadBlob(blob: Blob, filename: string): string {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  return url;
}
function errorMessage(reason: unknown): string {
  if (reason instanceof DOMException) {
    if (reason.name === "NotAllowedError" || reason.name === "SecurityError") return "Caméra refusée. Ouvrez cette page directement dans Safari ou Chrome en HTTPS, autorisez la caméra puis rechargez la page.";
    if (reason.name === "NotFoundError") return "Aucune caméra disponible. Utilisez l’import de deux images.";
    if (reason.name === "NotReadableError") return "Caméra occupée ou interrompue. Fermez les autres applications qui l’utilisent.";
    if (reason.name === "OverconstrainedError") return "Cette caméra ne prend pas en charge le format demandé.";
  }
  return reason instanceof Error ? reason.message : "Une erreur a interrompu l’analyse.";
}
async function readImage(file: File): Promise<Snapshot> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 12 * 1024 * 1024) throw new Error("Choisissez une image JPEG, PNG ou WebP de moins de 12 Mo.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url;
    await image.decode();
    if (image.naturalWidth * image.naturalHeight > 20_000_000) throw new Error("Image trop grande : utilisez une photo de moins de 20 mégapixels.");
    return capture(image, image.naturalWidth, image.naturalHeight);
  } finally { URL.revokeObjectURL(url); }
}

export default function VisionLab() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraDevice = useRef<string | undefined>(undefined);
  const [resumeCheck, setResumeCheck] = useState(false);
  const streamRef = useRef<MediaStream | null>(null), timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeRef = useRef<WakeHandle | null>(null), generation = useRef(0), mounted = useRef(false);
  const analysisClient = useRef<AnalysisClient | null>(null), analysisEpoch = useRef(0), calibrationRevision = useRef(0);
  const [spatialAnchor, setSpatialAnchor] = useState<Snapshot | null>(null), [referenceRaw, setReferenceRaw] = useState<Snapshot | null>(null);
  const [referenceMask, setReferenceMask] = useState<Uint8Array | undefined>(undefined);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null), [busy, setBusy] = useState(false);
  const [stabilizationEnabled, setStabilizationEnabled] = useState(true);
  const [view, setView] = useState<"REFERENCE" | "RAW" | "ALIGNED" | "DIFFERENCES">("REFERENCE");
  const [annotation, setAnnotation] = useState<Sample["annotation"] | null>(null);
  const savedIds = useRef(new Set<string>());
  const [camera, setCamera] = useState(false), [starting, setStarting] = useState(false), [watching, setWatching] = useState(false);
  const [wake, setWake] = useState("Non demandé"), [message, setMessage] = useState("Commencez par activer la caméra ou importer une image de référence.");
  const [before, setBefore] = useState<Snapshot | null>(null), [after, setAfter] = useState<Snapshot | null>(null);
  const [anchors, setAnchors] = useState<Point[]>([]), [calibration, setCalibration] = useState<Calibration | null>(null), [verified, setVerified] = useState(false);
  const [result, setResult] = useState<Detection | null>(null), [selected, setSelected] = useState<Point | null>(null), [truth, setTruth] = useState("");
  const [threshold, setThreshold] = useState(30), [processingMs, setProcessingMs] = useState(0), [samples, setSamples] = useState<Sample[]>([]);
  const [saved, setSaved] = useState(false), [includeImages, setIncludeImages] = useState(false), [source, setSource] = useState<"camera" | "images">("camera");
  const [imageBusy, setImageBusy] = useState(false);
  const [manualX, setManualX] = useState("50"), [manualY, setManualY] = useState("50");
  const [journal, setJournal] = useState<JournalSummary[]>([]), [journalReady, setJournalReady] = useState(false);
  const [journalBusy, setJournalBusy] = useState(false), [exportBusy, setExportBusy] = useState(false);
  const journalLock = useRef(false), exportLock = useRef(false), archiveUrl = useRef<string | null>(null);
  const [journalSelection, setJournalSelection] = useState<string[]>([]);
  const [journalMessage, setJournalMessage] = useState("Chargement du journal local…");
  const [archivedCaptureId, setArchivedCaptureId] = useState<string | null>(null);
  const [readyArchive, setReadyArchive] = useState<{ url: string; filename: string } | null>(null);

  const pause = useCallback(() => {
    analysisEpoch.current++; analysisClient.current?.cancel();
    if (mounted.current) setBusy(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mounted.current) setWatching(false);
  }, []);
  const stop = useCallback(() => {
    generation.current++;
    pause();
    const stream = streamRef.current; streamRef.current = null;
    stream?.getTracks().forEach(track => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    const lock = wakeRef.current; wakeRef.current = null;
    if (lock) void lock.release().catch(() => {});
    if (mounted.current) { setCamera(false); setStarting(false); setResumeCheck(true); setWake("Désactivé"); }
  }, [pause]);
  useEffect(() => {
    mounted.current = true;
    const hidden = () => { if (document.visibilityState === "hidden") { stop(); setMessage("Caméra suspendue pendant l’absence. Référence, calibration et captures conservées : utilisez « Reprendre la caméra »."); } };
    const leaving = () => stop();
    document.addEventListener("visibilitychange", hidden); window.addEventListener("pagehide", leaving);
    return () => { mounted.current = false; stop(); document.removeEventListener("visibilitychange", hidden); window.removeEventListener("pagehide", leaving); };
  }, [stop]);
  useEffect(() => {
    let active = true;
    void listJournalEntries().then(entries => {
      if (active) { setJournal(entries); setJournalMessage(entries.length ? `${entries.length} essai(s) retrouvé(s) sur cet appareil.` : "Le journal est prêt. Chaque capture analysée sera conservée automatiquement."); }
    }).catch(reason => { if (active) setJournalMessage(errorMessage(reason)); })
      .finally(() => { if (active) setJournalReady(true); });
    return () => { active = false; if (archiveUrl.current) { URL.revokeObjectURL(archiveUrl.current); archiveUrl.current = null; } };
  }, []);

  async function saveCapture(context: CaptureContext, origin: "camera" | "images", sample?: Sample): Promise<boolean> {
    if (!context.after || !context.analysis || journalLock.current) return false;
    journalLock.current = true; setJournalBusy(true); setJournalMessage("Enregistrement de la capture sur cet appareil…");
    try {
      const entry = sample && archivedCaptureId === context.after.id
        ? await annotateJournalEntry(context.after.id, sample, sample.annotation, sample.truth)
        : await putJournalEntry({ id: context.after.id, capturedAt: context.after.capturedAt, source: origin,
        annotation: sample?.annotation ?? "UNANNOTATED", truth: sample?.truth ?? null,
        state: context.analysis.stabilization.state, hasImages: true }, capturePayload(context, sample ? [sample] : [], true));
      if (mounted.current) {
        setJournal(current => [...current.filter(item => item.id !== entry.id), entry].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id)));
        setArchivedCaptureId(context.after.id); setJournalMessage("Capture et images conservées dans le journal local.");
      }
      return true;
    } catch (reason) {
      if (mounted.current) setJournalMessage(`${errorMessage(reason)} La capture actuelle reste disponible : exportez-la individuellement ou réessayez son enregistrement.`);
      return false;
    } finally { journalLock.current = false; if (mounted.current) setJournalBusy(false); }
  }

  function resetReference(snapshot: Snapshot, origin: "camera" | "images") {
    if (journalLock.current) return;
    pause(); setResumeCheck(false); setSpatialAnchor(snapshot); setReferenceRaw(snapshot); setReferenceMask(undefined); setAnalysis(null); setView("REFERENCE"); setAnnotation(null); setBefore(snapshot); setAfter(null); setAnchors([]); setCalibration(null); setVerified(false);
    setResult(null); setSelected(null); setTruth(""); setSaved(false); setSource(origin); setIncludeImages(false);
    setMessage("Image figée. Utilisez « Détecter ma cible », puis vérifiez la grille proposée. La méthode manuelle reste disponible.");
  }
  async function startCamera(resume = false) {
    if (journalLock.current) return;
    const preserve = resume && source === "camera" && Boolean(before && calibration);
    stop();
    const token = generation.current;
    setStarting(true); setMessage("Autorisez la caméra arrière. Le microphone reste désactivé.");
    if (!preserve) {
      setResumeCheck(false); cameraDevice.current = undefined;
      setSpatialAnchor(null); setReferenceRaw(null); setReferenceMask(undefined); setAnalysis(null); setBefore(null); setAfter(null); setAnchors([]); setCalibration(null); setVerified(false); setResult(null); setSelected(null); setSaved(false);
    }
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("La caméra nécessite HTTPS et un navigateur compatible. L’import d’images reste disponible.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...(preserve && cameraDevice.current ? { deviceId: { exact: cameraDevice.current } } : {}), facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 15, max: 30 } } });
      if (!mounted.current || token !== generation.current || document.visibilityState === "hidden") { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) { stop(); return; }
      video.srcObject = stream; await video.play();
      if (!mounted.current || token !== generation.current) return;
      if (preserve && before && (video.videoWidth !== before.sourceWidth || video.videoHeight !== before.sourceHeight)) {
        stop(); setVerified(false);
        setMessage("Le format de la caméra a changé. Captures conservées : recommencez la configuration, puis figez une référence vide et recalibrez.");
        return;
      }
      cameraDevice.current = stream.getVideoTracks()[0]?.getSettings().deviceId;
      setResumeCheck(preserve);
      stream.getVideoTracks().forEach(track => track.addEventListener("ended", () => { if (streamRef.current === stream) { stop(); setMessage("La caméra a été interrompue. Captures conservées : utilisez « Reprendre la caméra »."); } }));
      setCamera(true); setStarting(false); setSource("camera");
      setMessage(preserve ? "Caméra reprise, réglages conservés. Vérifiez la vue en direct et confirmez que la caméra et la cible n’ont pas bougé. La détection reste en pause." : "Immobilisez le téléphone, cible entière et vide. Appuyez sur « Figer la référence ».");
      const nav = navigator as Navigator & { wakeLock?: { request: (kind: "screen") => Promise<WakeHandle> } };
      if (nav.wakeLock) {
        try {
          const lock = await nav.wakeLock.request("screen");
          if (!mounted.current || token !== generation.current) { await lock.release(); return; }
          wakeRef.current = lock; setWake("Écran maintenu allumé");
          lock.addEventListener("release", () => { if (wakeRef.current === lock) { wakeRef.current = null; if (mounted.current) setWake("Maintien relâché par le système"); } });
        } catch { if (mounted.current && token === generation.current) setWake("Indisponible : gardez l’écran actif"); }
      } else setWake("Non pris en charge : gardez l’écran actif");
    } catch (reason) { if (mounted.current && token === generation.current) { stop(); setMessage(errorMessage(reason)); } }
  }
  function cameraFrame(): Snapshot {
    const video = videoRef.current;
    if (!video || !streamRef.current || video.readyState < 2) throw new Error("Caméra non prête.");
    return capture(video, video.videoWidth, video.videoHeight);
  }
  function freezeReference() {
    try { resetReference(cameraFrame(), "camera"); } catch (reason) { setMessage(errorMessage(reason)); }
  }
  function placePoint(point: Point) {
    if (watching || busy || imageBusy || journalLock.current || !before || (after && (view !== "ALIGNED" || !analysis?.stabilization.aligned))) return;
    if (!calibration) {
      const points = [...anchors, point];
      if (points.length > 5) return;
      setAnchors(points);
      if (points.length === 5) {
        try { const next = calibrate(points); calibrationRevision.current++; setCalibration(next); setMessage("Contrôlez les anneaux et le 20. Une mauvaise calibration fausse tous les secteurs."); }
        catch (reason) { setMessage(errorMessage(reason)); }
      }
    } else if (after && result && !saved) {
      setSelected(point); setTruth(scorePoint(project(calibration.imageToBoard, point)).label);
    }
  }
  function addCoordinates() {
    if (!manualX.trim() || !manualY.trim()) return;
    const x = Number(manualX), y = Number(manualY);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > 100 || y > 100) { setMessage("Les coordonnées doivent être comprises entre 0 et 100 %."); return; }
    placePoint({ x: x / 100, y: y / 100 });
  }
  function assertSameCapture(frame: Frame) {
    if (before && (before.frame.width !== frame.width || before.frame.height !== frame.height)) {
      pause(); setVerified(false);
      throw new Error("Le format de l’image a changé. Figez une nouvelle référence et relancez la calibration.");
    }
  }
  async function analyse(snapshot: Snapshot, automatic = false, captureSource = source): Promise<AnalysisResult | null> {
    if (!before || !spatialAnchor || !calibration || !verified || analysisClient.current?.busy || journalLock.current) return null;
    const token = analysisEpoch.current;
    if (!analysisClient.current) analysisClient.current = new AnalysisClient(() => new Worker(new URL("./vision-analysis.worker.ts", import.meta.url)));
    setBusy(true); setMessage("Recalage de la cible…");
    const output = await analysisClient.current.run({ sessionId: `${spatialAnchor.id}:${calibrationRevision.current}`, referenceId: before.id, captureId: snapshot.id,
      anchor: spatialAnchor.frame, reference: before.frame, current: snapshot.frame, referenceMask, calibration, threshold, enabled: stabilizationEnabled });
    if (!mounted.current || token !== analysisEpoch.current) return null;
    setBusy(false);
    if (automatic && output.detection?.status === "NO_CHANGE" && output.stabilization.state !== "REJECTED") {
      setMessage("Aucun mouvement significatif — surveillance active."); return output;
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setWatching(false); setAnalysis(output); setAfter(snapshot); setResult(output.detection);
    setProcessingMs(Math.round(output.totalMs)); setSelected(null); setTruth(""); setSaved(false); setAnnotation(null); setIncludeImages(false);
    setView(output.stabilization.aligned ? "ALIGNED" : "RAW");
    setMessage(output.stabilization.reason + (output.detection ? " · " + output.detection.reason : ""));
    await saveCapture({ before, after: snapshot, referenceRaw, spatialAnchor, analysis: output, calibration, result: output.detection, stabilizationEnabled }, captureSource);
    return output;
  }
  function sampleNow() { arm(true); }
  function arm(manual = false) {
    if (!before || !calibration || !verified || !camera || resumeCheck || after || journalLock.current || !journalReady) return;
    pause();
    let previous: Frame;
    try { previous = cameraFrame().frame; assertSameCapture(previous); } catch (reason) { setMessage(errorMessage(reason)); return; }
    const startedAt = performance.now(); let stable = 0;
    setWatching(true); setMessage("Attente d’une image stable…");
    timerRef.current = setInterval(() => {
      if (analysisClient.current?.busy) return;
      try {
        const snapshot = cameraFrame(); assertSameCapture(snapshot.frame);
        stable = motionFraction(previous, snapshot.frame) < 0.004 ? stable + 1 : 0;
        previous = snapshot.frame;
        if (performance.now() - startedAt > 60_000) { pause(); setMessage("Surveillance suspendue après 60 secondes. Réessayez la capture ; référence conservée."); return; }
        if (stable < 3) { setMessage("Attente d’une image stable…"); return; }
        stable = 0;
        void analyse(snapshot, !manual).catch(reason => { pause(); setMessage(errorMessage(reason)); });
      } catch (reason) { pause(); setMessage(errorMessage(reason)); }
    }, 250);
  }
  function retryCapture() {
    if (busy || imageBusy || journalLock.current || exportLock.current) return;
    if (after && (archivedCaptureId !== after.id || currentAnnotationPending) && !window.confirm("Cet essai ou son annotation n’est pas conservé dans le journal. Avez-vous téléchargé son JSON avec les images ? Réessayer remplacera la capture affichée.")) return;
    pause(); setAfter(null); setAnalysis(null); setResult(null); setSelected(null); setTruth(""); setSaved(false); setAnnotation(null); setIncludeImages(false); setView("REFERENCE");
    setMessage(source === "camera" ? "Gardez les fléchettes en place. Référence AVANT et calibration conservées : cliquez sur « Comparer maintenant » pour reprendre ce lancer. Si la caméra est arrêtée, reprenez-la d’abord et confirmez le cadrage." : "Référence AVANT et calibration conservées. Importez une nouvelle image APRÈS du même lancer, avec les fléchettes en place.");
  }
  async function importImage(event: ChangeEvent<HTMLInputElement>, target: "before" | "after") {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || journalLock.current) return;
    stop(); const token = generation.current; setImageBusy(true);
    try {
      const snapshot = await readImage(file);
      if (!mounted.current || token !== generation.current) return;
      if (target === "before") resetReference(snapshot, "images");
      else { setSource("images"); setResumeCheck(false); await analyse(snapshot, false, "images"); }
    } catch (reason) { if (mounted.current && token === generation.current) setMessage(errorMessage(reason)); }
    finally { if (mounted.current) setImageBusy(false); }
  }
  async function record(annotation: Sample["annotation"]) {
    if (busy || imageBusy || journalLock.current || exportLock.current || !after || !calibration || !analysis || analysis.captureId !== after.id || savedIds.current.has(after.id)) return;
    const label = annotation === "LABELLED" ? validLabel(truth) : null;
    if (annotation === "LABELLED" && (!label || label === "UNKNOWN")) { setMessage("Renseignez le secteur réellement observé : S20, D16, T19, 25, 50 ou MISS."); return; }
    if (samples.length >= MAX_SAMPLES) { setMessage("Limite de 100 annotations : exportez le journal puis videz-le avant de poursuivre."); return; }
    savedIds.current.add(after.id);
    // A failed alignment has no usable point in the reference image. Keep the
    // human sector as diagnostic truth, never as a generated detection or score.
    const point = result && analysis.stabilization.aligned ? selected : null;
    const sample: Sample = { id: after.id, capturedAt: after.capturedAt, source, calibration, threshold, detection: result, annotation, annotationMode: point ? "REFERENCE_POINT" : "SECTOR_ONLY", truth: label, point, processingMs, analysis: metadata(analysis) };
    const persisted = await saveCapture({ before, after, referenceRaw, spatialAnchor, analysis, calibration, result, stabilizationEnabled }, source, sample);
    if (!mounted.current) return;
    setSamples(current => [...current, sample]);
    setSaved(true); setAnnotation(annotation);
    setMessage(persisted ? "Annotation enregistrée dans le journal de cet appareil. Aucune partie modifiée." : "Annotation gardée pour cette page seulement. Exportez le JSON avec les images de la capture avant de poursuivre ; le journal local n’a pas pu être mis à jour.");
  }
  function nextDart() {
    if (journalLock.current || !after || !saved || !canPromote(analysis, annotation, stabilizationEnabled) || !analysis?.stabilization.aligned) return;
    if ((archivedCaptureId !== after.id || currentAnnotationPending) && !window.confirm("Cet essai ou son annotation n’est pas conservé dans le journal. Avez-vous téléchargé son JSON avec les images ? Continuer remplacera la capture affichée.")) return;
    pause(); setBefore({ ...after, frame: analysis.stabilization.aligned }); setReferenceRaw(after); setReferenceMask(analysis.stabilization.validMask ?? undefined); setAnalysis(null); setView("REFERENCE"); setAfter(null); setResult(null); setSelected(null); setTruth(""); setSaved(false); setIncludeImages(false);
    setMessage("L’image annotée devient la référence. Ne retirez pas les fléchettes ; armez la détection pour le prochain lancer.");
  }
  function exportJournal() {
    if (!samples.length && !after) return;
    const payload = capturePayload({ before, after, referenceRaw, spatialAnchor, analysis, calibration, result, stabilizationEnabled }, samples, includeImages);
    const url = downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `974darts-vision-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  async function exportGroup(all: boolean) {
    if (journalLock.current || exportLock.current) return;
    const selectedIds = new Set(journalSelection);
    const ids = journal.filter(entry => all || selectedIds.has(entry.id)).map(entry => entry.id);
    if (!ids.length) return;
    exportLock.current = true; setExportBusy(true); setJournalMessage(`Préparation de ${ids.length} essai(s)…`);
    try {
      const blob = await buildJournalZip(ids, { includeImages, onProgress: (done, total) => { if (mounted.current) setJournalMessage(`Préparation du fichier : ${done} / ${total} essais.`); } });
      if (!mounted.current) return;
      if (archiveUrl.current) URL.revokeObjectURL(archiveUrl.current);
      const filename = `974darts-vision-${all ? "journal" : "selection"}-${ids.length}-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
      const url = downloadBlob(blob, filename); archiveUrl.current = url; setReadyArchive({ url, filename });
      setJournalMessage(`${ids.length} essai(s) regroupé(s) dans un seul ZIP${includeImages ? ", avec les images conservées" : ", sans images"}. Vous pouvez envoyer ce fichier en une seule fois.`);
    } catch (reason) { if (mounted.current) setJournalMessage(errorMessage(reason)); }
    finally { exportLock.current = false; if (mounted.current) setExportBusy(false); }
  }
  async function clearJournal() {
    if (journalLock.current || exportLock.current || !window.confirm("Effacer tous les essais et leurs images sur cet appareil ? Téléchargez le journal d’abord si vous souhaitez le conserver.")) return;
    journalLock.current = true; setJournalBusy(true);
    try {
      await clearJournalEntries();
      if (!mounted.current) return;
      setJournal([]); setJournalSelection([]); setArchivedCaptureId(null); setSamples([]); savedIds.current.clear();
      if (archiveUrl.current) URL.revokeObjectURL(archiveUrl.current);
      archiveUrl.current = null; setReadyArchive(null); setJournalMessage("Journal local vidé.");
    } catch (reason) { if (mounted.current) setJournalMessage(errorMessage(reason)); }
    finally { journalLock.current = false; if (mounted.current) setJournalBusy(false); }
    // The currently inspected sample stays resolved: clearing a journal must not change the capture lifecycle.
  }
  const frame = view === "RAW" ? after?.frame : view === "DIFFERENCES" ? analysis?.differences : view === "ALIGNED" ? analysis?.stabilization.aligned : before?.frame;
  const showOverlay = view === "REFERENCE" || view === "ALIGNED" && Boolean(analysis?.stabilization.aligned);
  const manualAllowed = Boolean(before && !watching && !busy && !imageBusy && !journalBusy && (!calibration || (after && !saved && view === "ALIGNED" && analysis?.stabilization.aligned)));
  const labelled = journal.filter(sample => sample.annotation === "LABELLED").length;
  const selectedCount = journal.filter(entry => journalSelection.includes(entry.id)).length;
  const currentSample = samples.find(sample => sample.id === after?.id);
  const currentStored = journal.find(entry => entry.id === after?.id);
  const currentAnnotationPending = Boolean(currentSample && (currentSample.annotation !== currentStored?.annotation || currentSample.truth !== currentStored?.truth));
  const captureWithoutProposal = Boolean(after && analysis?.captureId === after.id && !result && !busy && !imageBusy);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>974DARTS VISION · ÉTAPE 1</span><h1>Laboratoire de vision</h1><p>Une cible réelle. Des mesures vérifiables. Aucun impact sur vos parties.</p></div>
        <span className={styles.badge}>BÊTA PRIVÉE · ADMIN</span>
      </header>
      <div className={styles.notice}><strong>Détection expérimentale, pas encore un autoscoring.</strong> Le moteur compare deux images et propose des extrémités de silhouettes. Il ne sait pas toujours distinguer la pointe de l’ailette. Chaque annotation reste manuelle.</div>
      <div className={styles.status} role="status" aria-live="polite">{message}</div>
      <div className={styles.grid}>
        <section className={styles.panel} aria-labelledby="camera-heading">
          <h2 id="camera-heading">1. Caméra et référence</h2>
          <p>Téléphone immobilisé hors de la trajectoire des fléchettes. Cible entièrement visible, 20 en haut, sans reflet.</p>
          <div className={styles.buttons}>
            <button type="button" onClick={() => void startCamera(!camera && source === "camera" && Boolean(before && calibration))} disabled={starting || imageBusy || journalBusy || !journalReady}>{starting ? "Autorisation…" : camera ? "Recommencer la configuration caméra" : before && calibration && source === "camera" ? "Reprendre la caméra · conserver les réglages" : "Activer la caméra arrière"}</button>
            <button type="button" onClick={() => { stop(); setMessage("Caméra arrêtée. Les captures enregistrées restent dans le journal de cet appareil."); }} disabled={!camera && !starting}>Arrêter la caméra</button>
            {!camera && before && calibration && <button type="button" onClick={() => void startCamera(false)} disabled={starting || imageBusy || journalBusy || !journalReady}>Recommencer la configuration caméra</button>}
          </div>
          <video ref={videoRef} className={styles.video} autoPlay playsInline muted aria-label="Vue en direct de la cible" />
          <div className={styles.meta}><span>{camera ? "Caméra active" : "Caméra arrêtée"}</span><span>{wake}</span></div>
          {camera && resumeCheck && <div className={styles.notice}>
            <p>Vérifiez la vue en direct : même caméra, même cadrage, cible et téléphone immobiles. Si l’un a bougé, figez une nouvelle référence vide et refaites la calibration.</p>
            <button type="button" onClick={() => { setResumeCheck(false); setMessage(after ? result ? "Reprise confirmée. Annotez la capture puis préparez le lancer suivant." : "Reprise confirmée. Gardez les fléchettes en place et réessayez ce lancer dans « Capture sans proposition »." : "Reprise confirmée. Vous pouvez armer la détection."); }}>Je confirme : caméra et cible inchangées</button>
          </div>}
          <button type="button" onClick={freezeReference} disabled={!camera || watching || busy || imageBusy || journalBusy}>Figer la référence · cible vide</button>
          <details className={styles.details}><summary>Tester avec deux images, sans caméra</summary><p>Même appareil, même cadrage, avant puis après un seul lancer. Aucun fichier n’est envoyé au serveur.</p>
            <label className={styles.fileLabel}>Image AVANT<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void importImage(event, "before")} disabled={imageBusy || watching || busy || journalBusy || !journalReady} /></label>
            <label className={styles.fileLabel}>Image APRÈS<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void importImage(event, "after")} disabled={!verified || imageBusy || watching || busy || journalBusy || !journalReady || Boolean(after)} /></label>
          </details>
        </section>
        <section className={styles.panel} aria-labelledby="calibration-heading">
          <h2 id="calibration-heading">2. Calibration et inspection</h2>
          {before && before.id === spatialAnchor?.id && !after && <CalibrationAssistant key={before.id} frame={before.frame} anchors={anchors} disabled={watching || busy || imageBusy || journalBusy} onApply={next => {
            if (watching || busy || imageBusy || after) return;
            pause(); calibrationRevision.current++; setAnalysis(null); setAnchors(next.anchors); setCalibration(next); setVerified(true);
            setMessage("Calibration appliquée après votre contrôle de la grille. Vous pouvez maintenant armer la détection.");
          }} />}
          {!calibration && before && <p className={styles.guide}>{anchors.length < 5 ? `Secours manuel · Repère ${anchors.length + 1}/5 — ${ANCHOR_LABELS[anchors.length]}` : "Calibration refusée. Recommencez les repères."}</p>}
          <p>La détection automatique propose les contours. Vérifiez toujours le centre, les anneaux et le vrai 20. En mode manuel, placez les repères sur le fil extérieur des doubles.</p>
          {frame ? <VisionFrame frame={frame} calibration={showOverlay ? calibration : null} onPoint={manualAllowed ? placePoint : undefined} gridMode={after ? "FULL" : "ALIGN"}
            markers={showOverlay ? [...anchors.map((point, i) => ({ point, label: String(i + 1) })), ...(result?.candidates ?? []).map((candidate, i) => ({ point: candidate.point, label: `?${i + 1}`, active: true })), ...(selected ? [{ point: selected, label: "Impact", active: true }] : [])] : []}
            boxes={view === "ALIGNED" ? result?.boxes : undefined} label={view === "RAW" ? "Après brut · sans saisie" : view === "DIFFERENCES" ? "Différences · sans saisie" : view === "ALIGNED" ? "Image après lancer : touchez le point d’entrée réel" : "Image de référence : placez les repères"} />
            : <div className={styles.placeholder}>L’image de référence apparaîtra ici.</div>}
          <div className={styles.buttons}><button type="button" disabled={!before || watching || busy || imageBusy || journalBusy} onClick={() => { pause(); if (spatialAnchor) { setBefore(spatialAnchor); setReferenceRaw(spatialAnchor); } setReferenceMask(undefined); setAnalysis(null); setView("REFERENCE"); setAnchors([]); setCalibration(null); setVerified(false); setAfter(null); setResult(null); setSelected(null); setTruth(""); setSaved(false); setMessage("Recommencez sur la référence figée : détection automatique ou repères manuels."); }}>Recommencer les repères</button></div>
          {calibration && <label className={styles.check}><input type="checkbox" checked={verified} disabled={watching || busy || journalBusy || Boolean(after)} onChange={event => { pause(); setVerified(event.target.checked); }} />Les anneaux et secteurs se superposent correctement aux fils réels.</label>}
          <details className={styles.details}><summary>Positionner un point au clavier</summary><div className={styles.coordinates}><label>X (%)<input type="number" min="0" max="100" step="0.1" value={manualX} onChange={event => setManualX(event.target.value)} /></label><label>Y (%)<input type="number" min="0" max="100" step="0.1" value={manualY} onChange={event => setManualY(event.target.value)} /></label><button type="button" onClick={addCoordinates} disabled={!manualAllowed}>Placer le point</button></div></details>
        </section>
      </div>
      <section className={styles.panel} aria-labelledby="detection-heading">
        <label className={styles.check}><input type="checkbox" checked={stabilizationEnabled} disabled={watching || busy || journalBusy || Boolean(after)} onChange={e => setStabilizationEnabled(e.target.checked)} />Stabilisation automatique</label>
        {after && <div className={styles.buttons}>
          {([["REFERENCE", "Référence"], ["RAW", "Après brut"], ["ALIGNED", "Après recalé"], ["DIFFERENCES", "Différences"]] as const).map(([key, label]) => <button type="button" key={key} aria-pressed={view === key} disabled={key === "ALIGNED" && !analysis?.stabilization.aligned || key === "DIFFERENCES" && !analysis?.differences} onClick={() => setView(key)}>{label}</button>)}
          <button type="button" onClick={retryCapture} disabled={busy || imageBusy || journalBusy || exportBusy}>Réessayer la capture</button>
        </div>}
        {after && !showOverlay && <p>Vue diagnostique : grille et saisie de points désactivées. Les annotations utilisent le repère de référence.</p>}
        {analysis && <details className={styles.details}><summary>Mesures du recalage · {analysis.stabilization.state}</summary>
          <p>{analysis.stabilization.reason}</p>
          {analysis.stabilization.state === "CANCELLED" ? <p>Transformation : non calculée.</p> : analysis.stabilization.state === "REJECTED" ? <p>Transformation non validée — aucun recalage appliqué.</p> : <>
            <p>Translation capture : {analysis.stabilization.transform.dx.toFixed(2)} / {analysis.stabilization.transform.dy.toFixed(2)} px · Rotation : {(analysis.stabilization.transform.rotation * 180 / Math.PI).toFixed(3)}° · Échelle : {analysis.stabilization.transform.scale.toFixed(5)}</p>
            {after && <p>Translation source : {(analysis.stabilization.transform.dx * after.sourceWidth / after.frame.width).toFixed(2)} / {(analysis.stabilization.transform.dy * after.sourceHeight / after.frame.height).toFixed(2)} px · Capture : {after.frame.width} × {after.frame.height} · Source : {after.sourceWidth} × {after.sourceHeight}</p>}
          </>}
          <p>Erreur avant / après : {metric(analysis.stabilization.metrics.errorBefore)} / {metric(analysis.stabilization.metrics.errorAfter)} · Régions concordantes : {metric(analysis.stabilization.metrics.concordantRegions, 0, " / 36")} · Couverture valide : {metric(analysis.stabilization.metrics.validFraction, 2, " %", 100)}</p>
          <p>Pixels modifiés bruts / résiduels : {metric(analysis.rawChangedFraction, 2, " %", 100)} / {metric(result?.changedFraction ?? null, 2, " %", 100)} · Luminosité : {metric(result?.brightnessShift ?? analysis.stabilization.metrics.brightnessShift)} · Calcul : {processingMs} ms</p>
          <p>Ces mesures évaluent le recalage, jamais la probabilité que le score soit correct.</p>
        </details>}
        <h2 id="detection-heading">3. Un lancer à la fois</h2>
        <p>La surveillance attend trois images stables, puis s’arrête dès qu’un changement est proposé. Elle ne valide jamais de score. Pause obligatoire avant de retirer les fléchettes.</p>
        <div className={styles.status} role="status" aria-label="État de la surveillance" aria-live="polite">
          <strong>{busy ? "Analyse en cours…" : watching ? "Surveillance active · attente d’une image stable" : !camera && source === "camera" ? "Caméra arrêtée · reprise nécessaire" : resumeCheck && source === "camera" ? "Reprise caméra · vérification nécessaire" : after ? "Surveillance arrêtée · capture figée" : "Surveillance en pause"}</strong>
          {after ? <p>Image figée à <time dateTime={after.capturedAt}>{new Date(after.capturedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time> · elle ne se met plus à jour.</p> : !watching && !busy && camera && verified && !resumeCheck ? <p>Armez la détection avant de lancer.</p> : null}
        </div>
        {!camera && source === "camera" && before && calibration && <button type="button" disabled={starting || imageBusy || journalBusy || !journalReady} onClick={() => void startCamera(true)}>Reprendre la caméra · conserver les réglages</button>}
        {camera && resumeCheck && <p>Confirmez le cadrage dans « 1. Caméra et référence » avant de réarmer.</p>}
        {after && result && <p>Pour continuer avec les fléchettes en place, confirmez l’annotation puis utilisez « Garder les fléchettes en place · préparer le lancer suivant ». Pour une nouvelle cible vide, retirez les fléchettes en pause puis figez une nouvelle référence.</p>}
        {captureWithoutProposal && <div className={styles.result} role="region" aria-labelledby="capture-recovery-heading">
          <strong id="capture-recovery-heading">Capture sans proposition</strong>
          <p>{analysis?.stabilization.state === "CANCELLED" ? "L’analyse a été interrompue." : "Le recalage n’a pas fourni d’image exploitable."} Aucun point d’impact ni score n’a été calculé pour cette capture.</p>
          <p>Gardez les fléchettes en place, sans nouveau lancer. La référence AVANT et la calibration restent conservées.</p>
          <button type="button" onClick={retryCapture} disabled={journalBusy || exportBusy}>Réessayer ce lancer · garder les fléchettes</button>
          <p>{source === "camera" ? "Puis cliquez sur « Comparer maintenant ». Si la caméra est arrêtée, reprenez-la et confirmez le cadrage avant de comparer." : "Puis importez une nouvelle image APRÈS du même lancer."} Ne figez pas une référence « cible vide » avec les fléchettes en place.</p>
          <p>Vous pouvez aussi noter le secteur réellement observé pour le diagnostic. Cette annotation ne place aucun point et ne prépare pas le lancer suivant.</p>
          <div className={styles.buttons}>
            <label>Secteur réel observé<input type="text" value={truth} onChange={event => setTruth(event.target.value)} placeholder="T20, D16, S5, 25, 50, MISS" maxLength={8} disabled={saved || journalBusy || exportBusy} autoCapitalize="characters" /></label>
            <button type="button" disabled={saved || journalBusy || exportBusy} onClick={() => void record("LABELLED")}>Enregistrer le secteur observé</button>
            <button type="button" disabled={saved || journalBusy || exportBusy} onClick={() => void record("UNRESOLVED")}>Impossible à déterminer</button>
          </div>
          {saved && <p>Saisie conservée pour cette capture. Réessayez ce lancer avant de lancer la fléchette suivante.</p>}
        </div>}
        <div className={styles.buttons}>
          <button type="button" onClick={() => arm()} disabled={!camera || !verified || resumeCheck || watching || Boolean(after) || imageBusy || journalBusy || !journalReady}>Armer la détection</button>
          <button type="button" onClick={() => { pause(); setMessage("Surveillance en pause. La caméra reste active jusqu’à son arrêt explicite."); }} disabled={!watching && !busy}>Pause</button>
          <button type="button" onClick={sampleNow} disabled={!camera || !verified || resumeCheck || watching || busy || Boolean(after) || imageBusy || journalBusy || !journalReady}>Comparer maintenant</button>
          <label className={styles.threshold}>Seuil de différence : {threshold}<input type="range" min="12" max="80" value={threshold} disabled={watching || busy || journalBusy || Boolean(after)} onChange={event => setThreshold(Number(event.target.value))} /></label>
        </div>
        {result && <div className={styles.result}>
          <strong>{result.status === "NO_CHANGE" ? "Aucun changement exploitable" : result.status === "SCENE_CHANGED" ? "Scène à vérifier — réessayez la capture" : "Changement à annoter"}</strong>
          <p>Vérifiez que la fléchette est visible dans l’image figée. Si elle est absente, utilisez « Réessayer la capture » : la référence AVANT reste conservée.</p>
          <p>{result.reason}</p>
          <p className={styles.meta}>Calcul : {processingMs} ms · Pixels modifiés dans la zone cible : {(result.changedFraction * 100).toFixed(2)} % · Pas de pourcentage de confiance IA.</p>
          <div className={styles.buttons}>{result.candidates.map((candidate, i) => <button key={i} type="button" disabled={saved || journalBusy || exportBusy} onClick={() => { setSelected(candidate.point); setTruth(candidate.score.label); }}>Extrémité {i + 1} : {candidate.score.label}{candidate.score.nearWire ? " · proche d’un fil" : ""}</button>)}</div>
          <p>Touchez le véritable point d’entrée sur l’image, ou corrigez directement le secteur ci-dessous. Un clic calcule seulement le secteur géométrique.</p>
          <div className={styles.buttons}><label>Secteur réel observé<input type="text" value={truth} onChange={event => setTruth(event.target.value)} placeholder="T20, D16, S5, 25, 50, MISS" maxLength={8} disabled={saved || journalBusy || exportBusy} autoCapitalize="characters" /></label>
            <button type="button" disabled={saved || journalBusy || exportBusy} onClick={() => void record("LABELLED")}>Confirmer l’annotation</button>
            <button type="button" disabled={saved || journalBusy || exportBusy} onClick={() => void record("FALSE_POSITIVE")}>Ce n’est pas une fléchette</button>
            <button type="button" disabled={saved || journalBusy || exportBusy} onClick={() => void record("UNRESOLVED")}>Impossible à déterminer</button>
          </div>
          {selected && calibration && scorePoint(project(calibration.imageToBoard, selected)).nearWire && <p className={styles.warning}>Point proche d’une séparation. Contrôlez le secteur sur la cible : aucune précision millimétrique n’est garantie.</p>}
          <button type="button" disabled={journalBusy || !saved || !canPromote(analysis, annotation, stabilizationEnabled)} onClick={nextDart}>Garder les fléchettes en place · préparer le lancer suivant</button>
          {result.status === "SCENE_CHANGED" && <p>Ne réutilisez pas cette image automatiquement. Vérifiez la cible puis réessayez la capture. La référence AVANT reste conservée.</p>}
        </div>}
      </section>
      <section className={styles.panel} aria-labelledby="journal-heading">
        <h2 id="journal-heading">4. Journal d’essais local</h2>
        <div className={styles.stats}><div><strong>{journal.length}</strong><span>captures / {MAX_SAMPLES}</span></div><div><strong>{labelled}</strong><span>secteurs annotés</span></div><div><strong>{selectedCount}</strong><span>essais sélectionnés</span></div></div>
        <p>Chaque capture analysée et ses images sont conservées sur cet appareil, même sans annotation et après un rechargement. Aucun envoi au serveur. Téléchargez une sauvegarde avant d’effacer les données du navigateur.</p>
        <p>Ce journal ne mesure pas encore la fiabilité d’un autoscoring : les annotations sont humaines et les candidats peuvent être multiples.</p>
        <div className={styles.status} role="status" aria-label="État du journal" aria-live="polite">{journalMessage}</div>
        {journal.length > 0 && <>
          <div className={styles.buttons}>
            <button type="button" disabled={journalBusy || exportBusy || selectedCount === journal.length} onClick={() => setJournalSelection(journal.map(entry => entry.id))}>Tout sélectionner</button>
            <button type="button" disabled={journalBusy || exportBusy || !selectedCount} onClick={() => setJournalSelection([])}>Tout désélectionner</button>
          </div>
          <div className={styles.journalList}>{journal.map((entry, index) => <label className={styles.journalRow} key={entry.id}>
            <input type="checkbox" aria-label={`Sélectionner l’essai ${index + 1}`} checked={journalSelection.includes(entry.id)} disabled={journalBusy || exportBusy}
              onChange={event => setJournalSelection(current => event.target.checked ? [...new Set([...current, entry.id])] : current.filter(id => id !== entry.id))} />
            <span><strong>Essai {index + 1} · {entry.truth ?? (entry.annotation === "FALSE_POSITIVE" ? "Fausse détection" : entry.annotation === "UNRESOLVED" ? "Indéterminable" : "À annoter")}</strong><time dateTime={entry.capturedAt}>{new Date(entry.capturedAt).toLocaleString("fr-FR")}</time></span>
            <span>{entry.state === "REJECTED" ? "Recalage refusé" : entry.state === "CANCELLED" ? "Analyse interrompue" : "Capture conservée"} · {(entry.bytes / 1024 / 1024).toFixed(1)} Mo</span>
          </label>)}</div>
        </>}
        <label className={styles.check}><input type="checkbox" checked={includeImages} disabled={exportBusy || !journal.length && (!before || !after)} onChange={event => setIncludeImages(event.target.checked)} />Inclure les images natives, les captures d’analyse et les diagnostics dans l’export (elles peuvent montrer les alentours de la cible).</label>
        <p>Pour analyser vos lancers, cochez l’option images puis téléchargez un seul ZIP. Il contient un fichier de diagnostic par essai ; vous pouvez envoyer directement le ZIP depuis votre téléphone.</p>
        <div className={styles.buttons}>
          <button type="button" onClick={() => void exportGroup(false)} disabled={!journalReady || !selectedCount || journalBusy || exportBusy}>Télécharger la sélection ({selectedCount})</button>
          <button type="button" onClick={() => void exportGroup(true)} disabled={!journalReady || !journal.length || journalBusy || exportBusy}>Télécharger tout le journal ({journal.length})</button>
        </div>
        {readyArchive && <p>Si le téléchargement ne s’est pas ouvert : <a href={readyArchive.url} download={readyArchive.filename}>Récupérer le fichier ZIP préparé</a>.</p>}
        {after && analysis && (archivedCaptureId !== after.id || currentAnnotationPending) && !journalBusy && <button type="button" disabled={exportBusy} onClick={() => void saveCapture({ before, after, referenceRaw, spatialAnchor, analysis, calibration, result, stabilizationEnabled }, source, currentSample)}>Réessayer l’enregistrement de la capture</button>}
        {before && after && <p>Images natives : {(referenceRaw ?? before).sourceWidth} × {(referenceRaw ?? before).sourceHeight} avant · {after.sourceWidth} × {after.sourceHeight} après. Captures d’analyse : {after.frame.width} × {after.frame.height}.</p>}
        {before && after && (!(referenceRaw ?? before).nativeCanvas || !after.nativeCanvas || spatialAnchor && !spatialAnchor.nativeCanvas) && <p>Au moins une image native est indisponible (limite : 4 mégapixels par image). Son absence sera indiquée dans l’export ; les captures d’analyse restent disponibles.</p>}
        <p>L’export JSON individuel conserve seulement les images de la capture actuellement affichée. Utilisez le ZIP pour retrouver les images des essais précédents.</p>
        <div className={styles.buttons}><button type="button" onClick={exportJournal} disabled={journalBusy || exportBusy || !samples.length && !after}>Exporter le journal JSON</button><button type="button" onClick={() => void clearJournal()} disabled={journalBusy || exportBusy || !journal.length && !samples.length}>Vider le journal</button></div>
        <p className={styles.meta}>Traitement local · Aucun envoi vidéo · Aucune API payante · Aucune synchronisation de partie à cette étape.</p>
      </section>
    </main>
  );
}
