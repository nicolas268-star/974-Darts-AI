"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { ANCHOR_LABELS, ENGINE_VERSION, RINGS, SECTORS, calibrate, detect, motionFraction, project, scorePoint, validLabel, type Calibration, type Detection, type Frame, type Point } from "@/lib/vision/engine";
import styles from "./vision.module.css";

type Snapshot = { frame: Frame; id: string; capturedAt: string };
type Sample = {
  id: string; capturedAt: string; source: "camera" | "images";
  calibration: Calibration; threshold: number; detection: Detection;
  annotation: "LABELLED" | "FALSE_POSITIVE" | "UNRESOLVED";
  truth: string | null; point: Point | null; processingMs: number;
};
type WakeHandle = { release: () => Promise<void>; addEventListener: (name: "release", callback: () => void) => void };
const MAX_SIDE = 960;
const MAX_SAMPLES = 100;

function capture(source: CanvasImageSource, width: number, height: number): Snapshot {
  if (width < 16 || height < 16) throw new Error("Image indisponible. Attendez que la caméra soit prête.");
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Ce navigateur ne permet pas l’analyse Canvas.");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { frame, id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16)).join("-"), capturedAt: new Date().toISOString() };
}
function paint(canvas: HTMLCanvasElement, frame: Frame) {
  canvas.width = frame.width; canvas.height = frame.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const image = ctx.createImageData(frame.width, frame.height); image.data.set(frame.data); ctx.putImageData(image, 0, 0);
}
function imageDataUrl(frame: Frame): string {
  const canvas = document.createElement("canvas"); paint(canvas, frame);
  return canvas.toDataURL("image/jpeg", 0.85);
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
function overlayPaths(calibration: Calibration): string[] {
  const line = (points: Point[]) => points.map((p, i) => { const t = project(calibration.boardToImage, p); return `${i ? "L" : "M"}${t.x * 1000},${t.y * 1000}`; }).join(" ");
  return [
    ...RINGS.map(r => line(Array.from({ length: 101 }, (_, i) => ({ x: Math.sin(i * Math.PI / 50) * r, y: -Math.cos(i * Math.PI / 50) * r })))),
    ...SECTORS.map((_, i) => { const a = (i + 0.5) * Math.PI / 10; return line([{ x: Math.sin(a) * RINGS[1], y: -Math.cos(a) * RINGS[1] }, { x: Math.sin(a), y: -Math.cos(a) }]); }),
  ];
}

export default function VisionLab() {
  const videoRef = useRef<HTMLVideoElement>(null), canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null), timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeRef = useRef<WakeHandle | null>(null), generation = useRef(0), mounted = useRef(false);
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

  const pause = useCallback(() => {
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
    if (mounted.current) { setCamera(false); setStarting(false); setWake("Désactivé"); }
  }, [pause]);
  useEffect(() => {
    mounted.current = true;
    const hidden = () => { if (document.visibilityState === "hidden") { stop(); setMessage("Caméra arrêtée lorsque la page passe en arrière-plan. Réactivez-la et refaites la calibration."); } };
    const leaving = () => stop();
    document.addEventListener("visibilitychange", hidden); window.addEventListener("pagehide", leaving);
    return () => { mounted.current = false; stop(); document.removeEventListener("visibilitychange", hidden); window.removeEventListener("pagehide", leaving); };
  }, [stop]);
  useEffect(() => {
    const frame = after?.frame ?? before?.frame;
    if (frame && canvasRef.current) paint(canvasRef.current, frame);
  }, [before, after]);

  function resetReference(snapshot: Snapshot, origin: "camera" | "images") {
    pause(); setBefore(snapshot); setAfter(null); setAnchors([]); setCalibration(null); setVerified(false);
    setResult(null); setSelected(null); setTruth(""); setSaved(false); setSource(origin); setIncludeImages(false);
    setMessage("Image figée. Placez les cinq repères, puis vérifiez la superposition des anneaux.");
  }
  async function startCamera() {
    stop();
    const token = generation.current;
    setStarting(true); setMessage("Autorisez la caméra arrière. Le microphone reste désactivé.");
    setBefore(null); setAfter(null); setAnchors([]); setCalibration(null); setVerified(false); setResult(null); setSelected(null); setSaved(false);
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("La caméra nécessite HTTPS et un navigateur compatible. L’import d’images reste disponible.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 15, max: 30 } } });
      if (!mounted.current || token !== generation.current || document.visibilityState === "hidden") { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) { stop(); return; }
      video.srcObject = stream; await video.play();
      if (!mounted.current || token !== generation.current) return;
      stream.getVideoTracks().forEach(track => track.addEventListener("ended", () => { if (streamRef.current === stream) { stop(); setMessage("La caméra a été interrompue. Réactivez-la et recalibrez."); } }));
      setCamera(true); setStarting(false); setSource("camera");
      setMessage("Immobilisez le téléphone, cible entière et vide. Appuyez sur « Figer la référence ».");
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
    if (watching || imageBusy || !before) return;
    if (!calibration) {
      const points = [...anchors, point];
      if (points.length > 5) return;
      setAnchors(points);
      if (points.length === 5) {
        try { setCalibration(calibrate(points)); setMessage("Contrôlez les anneaux et le 20. Une mauvaise calibration fausse tous les secteurs."); }
        catch (reason) { setMessage(errorMessage(reason)); }
      }
    } else if (after && result && !saved) {
      setSelected(point); setTruth(scorePoint(project(calibration.imageToBoard, point)).label);
    }
  }
  function clickImage(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    placePoint({ x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) });
  }
  function addCoordinates() {
    if (!manualX.trim() || !manualY.trim()) return;
    const x = Number(manualX), y = Number(manualY);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > 100 || y > 100) { setMessage("Les coordonnées doivent être comprises entre 0 et 100 %."); return; }
    placePoint({ x: x / 100, y: y / 100 });
  }
  function analyse(snapshot: Snapshot): Detection | null {
    if (!before || !calibration || !verified) return null;
    const start = performance.now();
    const detection = detect(before.frame, snapshot.frame, calibration, threshold);
    setProcessingMs(Math.round(performance.now() - start));
    setAfter(snapshot); setResult(detection); setSelected(null); setTruth(""); setSaved(false); setIncludeImages(false);
    setMessage(detection.reason);
    return detection;
  }
  function sampleNow() {
    pause();
    try { analyse(cameraFrame()); } catch (reason) { setMessage(errorMessage(reason)); }
  }
  function arm() {
    if (!before || !calibration || !verified || !camera || after) return;
    pause();
    let previous: Frame;
    try { previous = cameraFrame().frame; } catch (reason) { setMessage(errorMessage(reason)); return; }
    const startedAt = performance.now(); let stable = 0;
    setWatching(true); setMessage("Surveillance locale active : lancez une seule fléchette, puis attendez la stabilisation de l’image.");
    timerRef.current = setInterval(() => {
      try {
        const snapshot = cameraFrame();
        stable = motionFraction(previous, snapshot.frame) < 0.004 ? stable + 1 : 0;
        previous = snapshot.frame;
        if (performance.now() - startedAt > 60_000) { pause(); setMessage("Surveillance suspendue après 60 secondes sans résultat exploitable. Aucun zéro ajouté."); return; }
        if (stable < 3) return;
        const start = performance.now();
        const detection = detect(before.frame, snapshot.frame, calibration, threshold);
        if (detection.status === "NO_CHANGE") return;
        pause(); setAfter(snapshot); setResult(detection); setSelected(null); setTruth(""); setSaved(false); setIncludeImages(false);
        setProcessingMs(Math.round(performance.now() - start)); setMessage(detection.reason);
      } catch (reason) { pause(); setMessage(errorMessage(reason)); }
    }, 250);
  }
  async function importImage(event: ChangeEvent<HTMLInputElement>, target: "before" | "after") {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    stop(); const token = generation.current; setImageBusy(true);
    try {
      const snapshot = await readImage(file);
      if (!mounted.current || token !== generation.current) return;
      if (target === "before") resetReference(snapshot, "images");
      else { setSource("images"); analyse(snapshot); }
    } catch (reason) { if (mounted.current && token === generation.current) setMessage(errorMessage(reason)); }
    finally { if (mounted.current) setImageBusy(false); }
  }
  function record(annotation: Sample["annotation"]) {
    if (!after || !calibration || !result || savedIds.current.has(after.id)) return;
    const label = annotation === "LABELLED" ? validLabel(truth) : null;
    if (annotation === "LABELLED" && (!label || label === "UNKNOWN")) { setMessage("Renseignez le secteur réellement observé : S20, D16, T19, 25, 50 ou MISS."); return; }
    if (samples.length >= MAX_SAMPLES) { setMessage("Limite de 100 annotations : exportez le journal puis videz-le avant de poursuivre."); return; }
    savedIds.current.add(after.id);
    setSamples(current => [...current, { id: after.id, capturedAt: after.capturedAt, source, calibration, threshold, detection: result, annotation, truth: label, point: selected, processingMs }]);
    setSaved(true); setMessage("Annotation enregistrée dans ce navigateur, en mémoire uniquement. Aucune partie modifiée.");
  }
  function nextDart() {
    if (!after || !saved || result?.status === "SCENE_CHANGED") return;
    pause(); setBefore(after); setAfter(null); setResult(null); setSelected(null); setTruth(""); setSaved(false); setIncludeImages(false);
    setMessage("L’image annotée devient la référence. Ne retirez pas les fléchettes ; armez la détection pour le prochain lancer.");
  }
  function exportJournal() {
    if (!samples.length && !after) return;
    const payload = {
      schemaVersion: 1, engineVersion: ENGINE_VERSION, exportedAt: new Date().toISOString(),
      notice: "Laboratoire expérimental : extrémités de silhouettes, pas de modèle IA entraîné ni de validation automatique. Coordonnées image normalisées. Les annotations ne sont pas des scores de partie.",
      samples,
      currentPair: includeImages && before && after ? { before: imageDataUrl(before.frame), after: imageDataUrl(after.frame), captureId: after.id, calibration, width: before.frame.width, height: before.frame.height } : null,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `974darts-vision-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  function clearJournal() {
    if (!window.confirm("Effacer les annotations locales ? Exportez-les d’abord si elles sont utiles.")) return;
    setSamples([]); savedIds.current.clear();
    // The currently inspected sample stays resolved: clearing a journal must not change the capture lifecycle.
  }
  const frame = after?.frame ?? before?.frame;
  const paths = calibration ? overlayPaths(calibration) : [];
  const manualAllowed = Boolean(before && !watching && !imageBusy && (!calibration || (after && !saved)));
  const labelled = samples.filter(sample => sample.annotation === "LABELLED").length;

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
            <button type="button" onClick={() => void startCamera()} disabled={starting || imageBusy}>{starting ? "Autorisation…" : camera ? "Redémarrer la caméra" : "Activer la caméra arrière"}</button>
            <button type="button" onClick={() => { stop(); setMessage("Caméra arrêtée. Les annotations restent en mémoire jusqu’à la fermeture de cette page."); }} disabled={!camera && !starting}>Arrêter la caméra</button>
          </div>
          <video ref={videoRef} className={styles.video} autoPlay playsInline muted aria-label="Vue en direct de la cible" />
          <div className={styles.meta}><span>{camera ? "Caméra active" : "Caméra arrêtée"}</span><span>{wake}</span></div>
          <button type="button" onClick={freezeReference} disabled={!camera || watching || imageBusy}>Figer la référence · cible vide</button>
          <details className={styles.details}><summary>Tester avec deux images, sans caméra</summary><p>Même appareil, même cadrage, avant puis après un seul lancer. Aucun fichier n’est envoyé au serveur.</p>
            <label className={styles.fileLabel}>Image AVANT<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void importImage(event, "before")} disabled={imageBusy || watching} /></label>
            <label className={styles.fileLabel}>Image APRÈS<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void importImage(event, "after")} disabled={!verified || imageBusy || watching || Boolean(after)} /></label>
          </details>
        </section>
        <section className={styles.panel} aria-labelledby="calibration-heading">
          <h2 id="calibration-heading">2. Calibration et inspection</h2>
          {!calibration && before && <p className={styles.guide}>{anchors.length < 5 ? `Repère ${anchors.length + 1}/5 — ${ANCHOR_LABELS[anchors.length]}` : "Calibration refusée. Recommencez les repères."}</p>}
          <p>Placez les repères sur le fil extérieur des doubles, au milieu des secteurs indiqués, pas sur les chiffres. Le cinquième point vérifie le centre.</p>
          {frame ? <div className={styles.image} style={{ aspectRatio: `${frame.width} / ${frame.height}` }} onClick={clickImage}>
            <canvas ref={canvasRef} aria-label={after ? "Image après lancer : touchez le point d’entrée réel" : "Image de référence : placez les repères"} />
            <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
              {paths.map((path, i) => <path key={i} d={path} className={styles.ring} />)}
              {anchors.map((point, i) => <g key={i}><circle cx={point.x * 1000} cy={point.y * 1000} r="8" className={styles.anchor} /><text x={point.x * 1000 + 10} y={point.y * 1000 - 10}>{i + 1}</text></g>)}
              {result?.boxes.map((box, i) => <rect key={i} x={box.x * 1000} y={box.y * 1000} width={box.width * 1000} height={box.height * 1000} className={styles.box} />)}
              {result?.candidates.map((candidate, i) => <g key={i}><circle cx={candidate.point.x * 1000} cy={candidate.point.y * 1000} r="10" className={styles.candidate} /><text x={candidate.point.x * 1000 + 12} y={candidate.point.y * 1000}>{i + 1}</text></g>)}
              {selected && <circle cx={selected.x * 1000} cy={selected.y * 1000} r="14" className={styles.selected} />}
            </svg>
          </div> : <div className={styles.placeholder}>L’image de référence apparaîtra ici.</div>}
          <div className={styles.buttons}><button type="button" disabled={!before || watching || imageBusy} onClick={() => { setAnchors([]); setCalibration(null); setVerified(false); setAfter(null); setResult(null); setSelected(null); setTruth(""); setSaved(false); setMessage("Recommencez sur la référence figée : repère 20, puis 6, 3, 11 et Bull."); }}>Recommencer les repères</button></div>
          {calibration && <label className={styles.check}><input type="checkbox" checked={verified} disabled={watching || Boolean(after)} onChange={event => setVerified(event.target.checked)} />Les anneaux et secteurs se superposent correctement aux fils réels.</label>}
          <details className={styles.details}><summary>Positionner un point au clavier</summary><div className={styles.coordinates}><label>X (%)<input type="number" min="0" max="100" step="0.1" value={manualX} onChange={event => setManualX(event.target.value)} /></label><label>Y (%)<input type="number" min="0" max="100" step="0.1" value={manualY} onChange={event => setManualY(event.target.value)} /></label><button type="button" onClick={addCoordinates} disabled={!manualAllowed}>Placer le point</button></div></details>
        </section>
      </div>
      <section className={styles.panel} aria-labelledby="detection-heading">
        <h2 id="detection-heading">3. Un lancer à la fois</h2>
        <p>La surveillance attend trois images stables, puis s’arrête dès qu’un changement est proposé. Elle ne valide jamais de score. Pause obligatoire avant de retirer les fléchettes.</p>
        <div className={styles.buttons}>
          <button type="button" onClick={arm} disabled={!camera || !verified || watching || Boolean(after) || imageBusy}>Armer la détection</button>
          <button type="button" onClick={() => { pause(); setMessage("Surveillance en pause. La caméra reste active jusqu’à son arrêt explicite."); }} disabled={!watching}>Pause</button>
          <button type="button" onClick={sampleNow} disabled={!camera || !verified || Boolean(after) || imageBusy}>Comparer maintenant</button>
          <label className={styles.threshold}>Seuil de différence : {threshold}<input type="range" min="12" max="80" value={threshold} disabled={watching || Boolean(after)} onChange={event => setThreshold(Number(event.target.value))} /></label>
        </div>
        {result && <div className={styles.result}>
          <strong>{result.status === "NO_CHANGE" ? "Aucun changement exploitable" : result.status === "SCENE_CHANGED" ? "Scène à vérifier — recalibration conseillée" : "Changement à annoter"}</strong>
          <p>{result.reason}</p>
          <p className={styles.meta}>Calcul : {processingMs} ms · Pixels modifiés dans la zone cible : {(result.changedFraction * 100).toFixed(2)} % · Pas de pourcentage de confiance IA.</p>
          <div className={styles.buttons}>{result.candidates.map((candidate, i) => <button key={i} type="button" disabled={saved} onClick={() => { setSelected(candidate.point); setTruth(candidate.score.label); }}>Extrémité {i + 1} : {candidate.score.label}{candidate.score.nearWire ? " · proche d’un fil" : ""}</button>)}</div>
          <p>Touchez le véritable point d’entrée sur l’image, ou corrigez directement le secteur ci-dessous. Un clic calcule seulement le secteur géométrique.</p>
          <div className={styles.buttons}><label>Secteur réel observé<input type="text" value={truth} onChange={event => setTruth(event.target.value)} placeholder="T20, D16, S5, 25, 50, MISS" maxLength={8} disabled={saved} autoCapitalize="characters" /></label>
            <button type="button" disabled={saved} onClick={() => record("LABELLED")}>Confirmer l’annotation</button>
            <button type="button" disabled={saved} onClick={() => record("FALSE_POSITIVE")}>Ce n’est pas une fléchette</button>
            <button type="button" disabled={saved} onClick={() => record("UNRESOLVED")}>Impossible à déterminer</button>
          </div>
          {selected && calibration && scorePoint(project(calibration.imageToBoard, selected)).nearWire && <p className={styles.warning}>Point proche d’une séparation. Contrôlez le secteur sur la cible : aucune précision millimétrique n’est garantie.</p>}
          <button type="button" disabled={!saved || result.status === "SCENE_CHANGED"} onClick={nextDart}>Garder les fléchettes en place · préparer le lancer suivant</button>
          {result.status === "SCENE_CHANGED" && <p>Ne réutilisez pas cette image automatiquement. Vérifiez la cible puis créez une nouvelle référence.</p>}
        </div>}
      </section>
      <section className={styles.panel} aria-labelledby="journal-heading">
        <h2 id="journal-heading">4. Journal d’essais local</h2>
        <div className={styles.stats}><div><strong>{samples.length}</strong><span>échantillons / {MAX_SAMPLES}</span></div><div><strong>{labelled}</strong><span>secteurs annotés</span></div><div><strong>{samples.filter(sample => sample.annotation === "FALSE_POSITIVE").length}</strong><span>fausses détections signalées</span></div></div>
        <p>Ce journal ne mesure pas encore la fiabilité d’un autoscoring : les annotations sont humaines et les candidats peuvent être multiples. Il est perdu au rechargement ou à la fermeture de la page.</p>
        {samples.length > 0 && <div className={styles.log}>{samples.slice(-8).reverse().map(sample => <div key={sample.id}><time>{new Date(sample.capturedAt).toLocaleTimeString("fr-FR")}</time><strong>{sample.truth ?? (sample.annotation === "FALSE_POSITIVE" ? "Fausse détection" : "Indéterminable")}</strong><span>{sample.detection.candidates.map(candidate => candidate.score.label).join(" / ") || "Sans candidat"}</span></div>)}</div>}
        <label className={styles.check}><input type="checkbox" checked={includeImages} disabled={!before || !after} onChange={event => setIncludeImages(event.target.checked)} />Inclure les deux images actuellement inspectées dans l’export (elles peuvent montrer les alentours de la cible).</label>
        <div className={styles.buttons}><button type="button" onClick={exportJournal} disabled={!samples.length && !after}>Exporter le journal JSON</button><button type="button" onClick={clearJournal} disabled={!samples.length}>Vider le journal</button></div>
        <p className={styles.meta}>Traitement local · Aucun envoi vidéo · Aucune API payante · Aucune synchronisation de partie à cette étape.</p>
      </section>
    </main>
  );
}
