"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { calibrate, type Calibration, type Frame, type Point } from "@/lib/vision/engine";
import { FULL_VIEW, confirmDraftPoint, newDraft, nudgePoint, setDraftPoint, viewToImage, zoomView, type View } from "@/lib/vision/calibration-ui";
import styles from "./calibration.module.css";
import AutoCalibration from "./AutoCalibration";
import VisionFrame from "./VisionFrame";

const LABELS = ["20", "6", "3", "11", "Bull"];
const DIRECTIONS = ["En haut", "À droite", "En bas", "À gauche", "Au centre"];
const POSITIONS: Point[] = [{ x: .5, y: .15 }, { x: .85, y: .5 }, { x: .5, y: .85 }, { x: .15, y: .5 }, { x: .5, y: .5 }];
type Props = { frame: Frame; anchors: Point[]; disabled: boolean; onApply: (calibration: Calibration) => void };

export default function CalibrationAssistant({ frame, anchors, disabled, onApply }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null), loupeRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(() => newDraft(anchors));
  const [view, setView] = useState<View>(FULL_VIEW), [fine, setFine] = useState(true), [accepted, setAccepted] = useState(false);
  const point = draft.points[draft.active];
  const complete = draft.confirmed.every(Boolean) && draft.points.every(p => p !== null);
  const preview = useMemo(() => {
    if (!complete) return { calibration: null, error: "" };
    try { return { calibration: calibrate(draft.points as Point[]), error: "" }; }
    catch (reason) { return { calibration: null, error: reason instanceof Error ? reason.message : "Vérifiez les repères." }; }
  }, [complete, draft.points]);

  useEffect(() => {
    const source = document.createElement("canvas"); source.width = frame.width; source.height = frame.height;
    const ctx = source.getContext("2d");
    if (ctx) { const data = ctx.createImageData(frame.width, frame.height); data.data.set(frame.data); ctx.putImageData(data, 0, 0); }
    sourceRef.current = source;
    return () => { sourceRef.current = null; };
  }, [frame]);
  useEffect(() => {
    if (!open || !point || !sourceRef.current || !loupeRef.current) return;
    const canvas = loupeRef.current; canvas.width = 288; canvas.height = 192;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#08101b"; ctx.fillRect(0, 0, 288, 192); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sourceRef.current, point.x * frame.width - 36, point.y * frame.height - 24, 72, 48, 0, 0, 288, 192);
    for (const [color, width] of [["#000000", 4], ["#ffdf61", 2]] as const) {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
      ctx.moveTo(144, 62); ctx.lineTo(144, 90); ctx.moveTo(144, 102); ctx.lineTo(144, 130);
      ctx.moveTo(110, 96); ctx.lineTo(138, 96); ctx.moveTo(150, 96); ctx.lineTo(178, 96); ctx.stroke();
    }
  }, [frame, point, open]);
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { dialog.close(); document.body.style.overflow = previousOverflow; };
  }, [open]);

  function show() { setDraft(newDraft(anchors)); setView(FULL_VIEW); setAccepted(false); setOpen(true); }
  function update(p: Point | null) { setDraft(current => setDraftPoint(current, p)); setAccepted(false); }
  function choose(index: number) { setDraft(current => ({ ...current, active: index })); setView(FULL_VIEW); }
  function nudge(dx: number, dy: number) {
    if (!point) return;
    update(nudgePoint(point, dx * (fine ? 1 : 5), dy * (fine ? 1 : 5), frame.width, frame.height));
  }
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (event.key in moves) { event.preventDefault(); nudge(...moves[event.key]); }
    else if ((event.key === "Enter" || event.key === " ") && !point) { event.preventDefault(); update(viewToImage(view, .5, .5)); }
  }
  function confirm() { setDraft(current => confirmDraftPoint(current)); setView(FULL_VIEW); setAccepted(false); }
  function apply() {
    if (!preview.calibration || !accepted || disabled) return;
    onApply(preview.calibration); setOpen(false);
  }

  return <>
    <AutoCalibration frame={frame} disabled={disabled || open} onApply={onApply} />
    <button type="button" className={styles.launch} onClick={show} disabled={disabled}>Calibrer en grand · zoom et loupe</button>
    <p className={styles.hint}>Secours manuel : touchez approximativement, ajustez avec les flèches, puis confirmez. Chaque point reste modifiable.</p>
    {open && <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="vision-assistant-title" onCancel={() => setOpen(false)}>
      <header className={styles.header}><div><span>IMAGE FIGÉE · RIEN À COLLER SUR LA CIBLE</span><h2 id="vision-assistant-title">Calibration guidée</h2></div><button type="button" onClick={() => setOpen(false)} autoFocus>Fermer sans appliquer</button></header>
      <nav className={styles.steps} aria-label="Choisir le repère à placer ou corriger">{LABELS.map((label, i) => <button type="button" key={label} aria-current={draft.active === i ? "step" : undefined} onClick={() => choose(i)}>{label}<small>{draft.confirmed[i] ? "✓ placé" : "à placer"}</small></button>)}</nav>
      <p className={styles.guide} aria-live="polite"><strong>{LABELS[draft.active]} · {DIRECTIONS[draft.active]}</strong>{draft.active === 4 ? "Visez le centre du petit rond rouge du Bull." : "Visez le bord extérieur de la fine bande du double, au milieu de ce secteur. Pas le chiffre, ni le grand anneau lumineux."}</p>
      <div className={styles.workspace}>
        <div>
          <div className={styles.zoom} aria-label="Zoom d’affichage">{[1, 2, 4].map(level => <button type="button" key={level} aria-pressed={Math.abs(view.width - 1 / level) < .001} onClick={() => setView(zoomView(point ?? { x: .5, y: .5 }, level))}>{level === 1 ? "Vue entière" : `Zoom ×${level}`}</button>)}</div>
          <VisionFrame frame={frame} calibration={preview.calibration} view={view} onPoint={update} onKeyDown={onKey}
            markers={draft.points.flatMap((p, i) => p ? [{ point: p, label: LABELS[i], active: i === draft.active }] : [])}
            label={`Positionner le repère ${LABELS[draft.active]}. Toucher l’image, ou Entrée puis flèches au clavier.`} />
          <p className={styles.hint}>Le zoom agrandit seulement cette photo, sans changer la caméra. Revenez à « Vue entière » pour retrouver un secteur.</p>
        </div>
        <section className={styles.adjust} aria-label="Ajustement précis du point">
          {point ? <><strong>Loupe · point {LABELS[draft.active]}</strong><canvas className={styles.loupe} ref={loupeRef} aria-label="Détail agrandi, croix au centre du point choisi" /><p>La croix indique le point retenu. Ajustez sans masquer le fil avec votre doigt.</p></> : <div className={styles.empty}>Touchez d’abord près du secteur {LABELS[draft.active]} sur la grande image. La loupe apparaîtra ici.</div>}
          <div className={styles.arrows}>
            <button type="button" disabled={!point} aria-label="Déplacer le point vers le haut" onClick={() => nudge(0, -1)}>↑</button>
            <div><button type="button" disabled={!point} aria-label="Déplacer le point vers la gauche" onClick={() => nudge(-1, 0)}>←</button><button type="button" disabled={!point} aria-label="Déplacer le point vers le bas" onClick={() => nudge(0, 1)}>↓</button><button type="button" disabled={!point} aria-label="Déplacer le point vers la droite" onClick={() => nudge(1, 0)}>→</button></div>
          </div>
          <label className={styles.check}><input type="checkbox" checked={fine} onChange={event => setFine(event.target.checked)} />Ajustement fin (1 pixel au lieu de 5)</label>
          <button type="button" className={styles.primary} disabled={!point} onClick={confirm}>Confirmer le point {LABELS[draft.active]}</button>
          <button type="button" disabled={!point} onClick={() => update(null)}>Effacer seulement ce point</button>
          <p className={styles.hint}>{draft.confirmed.filter(Boolean).length}/5 confirmés. Pour corriger un point déjà placé, sélectionnez son numéro en haut.</p>
          <details><summary>Où se trouve ce repère ?</summary><svg className={styles.locator} viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="35" fill="none" stroke="currentColor" />{POSITIONS.map((p, i) => <g key={i}><circle cx={p.x * 100} cy={p.y * 100} r={i === draft.active ? 5 : 2} fill={i === draft.active ? "#ffdf61" : "currentColor"} /><text x={p.x * 100} y={p.y * 100 - 8} textAnchor="middle" fontSize="9" fill="currentColor">{LABELS[i]}</text></g>)}</svg><p>Schéma indicatif, pas une détection automatique.</p></details>
        </section>
      </div>
      {complete && <section className={styles.review} aria-live="polite">
        {preview.error ? <p role="alert">{preview.error} Les autres points sont conservés : choisissez le repère à corriger en haut.</p> : <><strong>Dernière vérification</strong><p>La grille verte doit suivre les fils des doubles, triples et secteurs. Corrigez un point si elle est décalée.</p><label className={styles.check}><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} />La grille suit les fils de ma cible.</label></>}
      </section>}
      <footer className={styles.footer}><button type="button" className={styles.primary} disabled={!preview.calibration || !accepted || disabled} onClick={apply}>Appliquer la calibration</button><span>Sans validation, la calibration précédente reste inchangée.</span></footer>
    </dialog>}
  </>;
}
