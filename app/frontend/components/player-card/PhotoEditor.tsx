"use client";
import { useEffect, useRef, useState } from "react";
import { CameraSession, cameraError, decodeImage, drawPortrait, normalizePhoto } from "@/lib/player-card/photo";
import { DEFAULT_CROP, type Crop } from "@/lib/player-card/types";

export function PhotoEditor({ photo, crop, maxBytes, onApply, onClose }: { photo: string | null; crop: Crop; maxBytes: number; onApply: (photo: string | null, crop: Crop) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(photo), [framing, setFraming] = useState(crop);
  const [mode, setMode] = useState<"choice" | "camera" | "crop">(photo ? "crop" : "choice");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [live, setLive] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const camera = useRef(new CameraSession()), alive = useRef(true), request = useRef(0);
  const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null), dialog = useRef<HTMLDialogElement>(null);
  function stop() { camera.current.stop(); setLive(false); if (video.current) video.current.srcObject = null; }
  useEffect(() => {
    alive.current = true; const previous = document.activeElement as HTMLElement | null; dialog.current?.showModal();
    const session = camera.current, requests = request;
    const hide = () => { if (document.visibilityState === "hidden") { session.stop(); setLive(false); } };
    const exit = () => session.stop();
    document.addEventListener("visibilitychange", hide); window.addEventListener("pagehide", exit);
    return () => { alive.current = false; requests.current++; session.stop(); document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", exit); previous?.focus(); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (mode !== "crop" || !draft) return;
    decodeImage(draft).then(image => {
      if (cancelled || !canvas.current) return;
      const ctx = canvas.current.getContext("2d"); if (!ctx) return;
      ctx.clearRect(0, 0, 400, 400); drawPortrait(ctx, image, framing, 0, 0, 400);
    }).catch(() => { if (!cancelled) setError("Photo illisible. Importez une autre image."); });
    return () => { cancelled = true; };
  }, [draft, framing, mode]);
  async function importFile(file?: File) {
    if (!file) return;
    stop(); const id = ++request.current; setBusy(true); setError("");
    try { const normalized = await normalizePhoto(file, maxBytes); if (alive.current && id === request.current) { setDraft(normalized); setFraming(DEFAULT_CROP); setMode("crop"); } }
    catch (e) { if (alive.current && id === request.current) setError(e instanceof Error ? e.message : "Photo incompatible."); }
    finally { if (alive.current && id === request.current) setBusy(false); }
  }
  async function startCamera(nextFacing = facing) {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setError("Caméra indisponible ici. Utilisez HTTPS ou importez une photo."); return; }
    setMode("camera"); setBusy(true); setLive(false); setError(""); setFacing(nextFacing);
    try {
      const stream = await camera.current.start(navigator.mediaDevices, nextFacing);
      if (!stream) return;
      if (!alive.current || !video.current) { camera.current.stop(); return; }
      video.current.srcObject = stream; await video.current.play();
      if (!alive.current || video.current?.srcObject !== stream) return;
      setLive(true);
    } catch (e) { camera.current.stop(); if (alive.current) setError(cameraError(e)); }
    finally { if (alive.current) setBusy(false); }
  }
  function capture() {
    if (!video.current || !video.current.videoWidth) { setError("La caméra prépare encore l’image."); return; }
    const v = video.current, c = document.createElement("canvas");
    const scale = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight));
    c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
    const ctx = c.getContext("2d"); if (!ctx) { setError("Capture indisponible."); return; }
    ctx.drawImage(v, 0, 0, c.width, c.height); setDraft(c.toDataURL("image/png")); setFraming(DEFAULT_CROP); stop(); setMode("crop");
  }
  function close() { request.current++; stop(); onClose(); }
  return <dialog className="pc-photo-dialog" ref={dialog} onCancel={e => { e.preventDefault(); close(); }} aria-labelledby="pc-photo-title">
    <header><h2 id="pc-photo-title">Modifier ma photo</h2><button onClick={close} aria-label="Fermer">×</button></header>
    <p>Cette photo reste sur votre appareil pour la carte.</p>
    <div className="pc-photo-choices">
      <label className="pc-button">Importer une photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ""; }}/></label>
      <button onClick={() => void startCamera()} disabled={busy}>Prendre une photo</button>
      <button onClick={() => { stop(); onApply(null, DEFAULT_CROP); onClose(); }}>Utiliser mes initiales</button>
    </div>
    {busy && <p role="status">Préparation de la photo…</p>}
    {error && <p className="pc-error" role="alert">{error}</p>}
    {mode === "camera" && <section>
      <video ref={video} autoPlay playsInline muted aria-label="Aperçu caméra" className={facing === "user" ? "pc-mirrored" : ""}/>
      <div className="pc-photo-choices"><button disabled={!live} onClick={capture}>Capturer</button><button disabled={busy} onClick={() => void startCamera(facing === "user" ? "environment" : "user")}>Changer de caméra</button></div>
      {!live && !busy && <button onClick={() => void startCamera()}>Reprendre la caméra</button>}
    </section>}
    {mode === "crop" && draft && <section>
      <canvas ref={canvas} width={400} height={400} aria-label="Cadrage de votre photo"/>
      {([['zoom', 'Zoom', 1, 3], ['x', 'Position horizontale', 0, 1], ['y', 'Position verticale', 0, 1]] as const).map(([key, label, min, max]) => <label className="pc-range" key={key}>{label}<input type="range" min={min} max={max} step={0.01} value={framing[key]} onChange={e => setFraming({ ...framing, [key]: Number(e.target.value) })}/></label>)}
      <div className="pc-photo-choices"><button className="pc-primary" onClick={() => { stop(); onApply(draft, framing); onClose(); }}>Valider le cadrage</button><button onClick={() => void startCamera()}>Reprendre une photo</button></div>
    </section>}
    <button onClick={close}>Annuler</button>
  </dialog>;
}
