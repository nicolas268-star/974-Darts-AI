"use client";

import { useEffect, useRef, useState } from "react";
import { detectBoard, adjustCalibration, type Adjustment } from "@/lib/vision/auto-calibration";
import type { Calibration, Frame } from "@/lib/vision/engine";
import VisionFrame from "./VisionFrame";
import styles from "./calibration.module.css";

type Props = { frame: Frame; disabled: boolean; onApply: (calibration: Calibration) => void };
const groups: { title: string; commands: [Adjustment, string][] }[] = [
  { title: "Position", commands: [["LEFT", "← Gauche"], ["RIGHT", "Droite →"], ["UP", "↑ Haut"], ["DOWN", "Bas ↓"]] },
  { title: "Taille", commands: [["SHRINK", "− Réduire"], ["GROW", "+ Agrandir"]] },
  { title: "Orientation du 20", commands: [["ROTATE_LEFT", "↶ Rotation gauche"], ["ROTATE_RIGHT", "↷ Rotation droite"], ["SECTOR_LEFT", "− 1 secteur"], ["SECTOR_RIGHT", "+ 1 secteur"]] },
];
const advanced: [Adjustment, string][] = [["NARROWER", "Largeur −"], ["WIDER", "Largeur +"], ["SHORTER", "Hauteur −"], ["TALLER", "Hauteur +"], ["TILT_LEFT", "Perspective ←"], ["TILT_RIGHT", "Perspective →"], ["TILT_UP", "Perspective ↑"], ["TILT_DOWN", "Perspective ↓"]];
export default function AutoCalibration({ frame, disabled, onApply }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null), generation = useRef(0), mounted = useRef(false);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [draft, setDraft] = useState<Calibration | null>(null), [initial, setInitial] = useState<Calibration | null>(null);
  const [fine, setFine] = useState(true), [shapeOK, setShapeOK] = useState(false), [twentyOK, setTwentyOK] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const dialog = dialogRef.current; dialog.showModal();
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { dialog.close(); document.body.style.overflow = overflow; };
  }, [open]);
  function close() { generation.current++; setBusy(false); setOpen(false); }
  function invalidate() { setShapeOK(false); setTwentyOK(false); }
  function findBoard() {
    const token = ++generation.current; setOpen(true); setBusy(true); setDraft(null); setInitial(null); invalidate();
    setMessage("Recherche locale du Bull et des anneaux rouge/vert…");
    // Let the browser display progress; inference is bounded to a 400-pixel raster and 32 centres.
    window.setTimeout(() => {
      if (!mounted.current || token !== generation.current) return;
      try {
        const proposal = detectBoard(frame);
        if (!mounted.current || token !== generation.current) return;
        setDraft(proposal.calibration); setInitial(proposal.calibration);
        setMessage("Contours proposés. Vérifiez le centre et les fils, puis l’orientation du 20. Les chiffres ne sont pas lus automatiquement.");
      } catch (e) { if (mounted.current && token === generation.current) setMessage(e instanceof Error ? e.message : "Détection indisponible."); }
      finally { if (mounted.current && token === generation.current) setBusy(false); }
    }, 30);
  }
  function adjust(command: Adjustment) {
    if (!draft || disabled || busy) return;
    try { setDraft(adjustCalibration(draft, command, frame.width, frame.height, fine)); invalidate(); setMessage("Grille ajustée. Vérifiez de nouveau les fils et le 20 avant d’appliquer."); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Ajustement refusé."); }
  }
  function apply() {
    if (!draft || !shapeOK || !twentyOK || disabled || busy) return;
    onApply(draft); close();
  }
  return <>
    <button type="button" className={styles.launch} onClick={findBoard} disabled={disabled}>Détecter ma cible</button>
    <p className={styles.hint}>Sur la référence vide : proposition automatique des contours, sans placer cinq points. Vérification finale obligatoire.</p>
    {open && <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="vision-auto-title" onCancel={close}>
      <header className={styles.header}><div><span>IMAGE FIGÉE · TRAITEMENT LOCAL · BÊTA</span><h2 id="vision-auto-title">Détection de la cible</h2></div><button type="button" onClick={close} autoFocus>Fermer sans appliquer</button></header>
      <p className={styles.guide} role="status">{message}</p>
      <div className={styles.workspace}>
        <VisionFrame frame={frame} calibration={draft} label="Aperçu de la calibration automatique" />
        <section className={styles.adjust} aria-label="Commandes d’ajustement de la grille">
          <label className={styles.check}><input type="checkbox" checked={fine} disabled={busy} onChange={e => setFine(e.target.checked)} />Ajustement fin</label>
          {groups.map(group => <div key={group.title} style={{ minWidth: 0 }}><strong>{group.title}</strong><div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>{group.commands.map(([command, label]) => <button key={command} type="button" disabled={!draft || busy || disabled} onClick={() => adjust(command)}>{label}</button>)}</div></div>)}
          <details><summary>Largeur, hauteur et perspective</summary><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{advanced.map(([command, label]) => <button key={command} type="button" disabled={!draft || busy || disabled} onClick={() => adjust(command)}>{label}</button>)}</div></details>
          <button type="button" disabled={!initial || busy || disabled} onClick={() => { setDraft(initial); invalidate(); setMessage("Proposition d’origine restaurée. Vérifiez les contours et le 20."); }}>Rétablir la proposition</button>
          <button type="button" disabled={busy || disabled} onClick={findBoard}>Relancer la détection</button>
          {!draft && !busy && <p>Fermez cette fenêtre pour utiliser « Calibrer en grand · zoom et loupe ». Aucun résultat approximatif n’est appliqué à votre place.</p>}
        </section>
      </div>
      {draft && <section className={styles.review}>
        <p>Le 20 est initialement supposé en haut. Corrigez son orientation si nécessaire. Cette détection des contours ne reconnaît pas encore les impacts.</p>
        <label className={styles.check}><input type="checkbox" checked={shapeOK} onChange={e => setShapeOK(e.target.checked)} />Le centre, les doubles et les triples suivent ma cible.</label>
        <label className={styles.check}><input type="checkbox" checked={twentyOK} onChange={e => setTwentyOK(e.target.checked)} />Le 20 de la grille correspond au vrai 20.</label>
      </section>}
      <footer className={styles.footer}><button type="button" className={styles.primary} disabled={!draft || !shapeOK || !twentyOK || disabled || busy} onClick={apply}>Appliquer cette détection</button><span>Votre calibration précédente reste inchangée tant que vous n’appliquez pas.</span></footer>
    </dialog>}
  </>;
}
