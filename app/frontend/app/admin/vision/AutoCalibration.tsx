"use client";

import { useEffect, useRef, useState } from "react";
import { detectBoard, adjustCalibration, type Adjustment } from "@/lib/vision/auto-calibration";
import type { Calibration, Frame } from "@/lib/vision/engine";
import VisionFrame from "./VisionFrame";
import styles from "./calibration.module.css";

type Props = { frame: Frame; disabled: boolean; onApply: (calibration: Calibration) => void };
const advanced: [Adjustment, string][] = [["NARROWER", "Largeur −"], ["WIDER", "Largeur +"], ["SHORTER", "Hauteur −"], ["TALLER", "Hauteur +"], ["TILT_LEFT", "Perspective ←"], ["TILT_RIGHT", "Perspective →"], ["TILT_UP", "Perspective ↑"], ["TILT_DOWN", "Perspective ↓"]];
export default function AutoCalibration({ frame, disabled, onApply }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null), generation = useRef(0), mounted = useRef(false);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [draft, setDraft] = useState<Calibration | null>(null), [initial, setInitial] = useState<Calibration | null>(null);
  const [fine, setFine] = useState(false), [simpleGrid, setSimpleGrid] = useState(true), [shapeOK, setShapeOK] = useState(false), [twentyOK, setTwentyOK] = useState(false);
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
    window.setTimeout(() => {
      if (!mounted.current || token !== generation.current) return;
      try {
        const proposal = detectBoard(frame);
        if (!mounted.current || token !== generation.current) return;
        setDraft(proposal.calibration); setInitial(proposal.calibration); setSimpleGrid(true);
        setMessage("Contours proposés. Ajustez directement sur l’image si nécessaire, puis vérifiez le vrai 20.");
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
  const blocked = !draft || busy || disabled;
  return <>
    <button type="button" className={styles.launch} onClick={findBoard} disabled={disabled}>Détecter ma cible</button>
    <p className={styles.hint}>Sur la référence vide : proposition automatique des contours, sans placer cinq points. Vérification finale obligatoire.</p>
    {open && <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="vision-auto-title" onCancel={close}>
      <header className={styles.header}><div><span>IMAGE FIGÉE · TRAITEMENT LOCAL · BÊTA</span><h2 id="vision-auto-title">Détection de la cible</h2></div><button type="button" onClick={close} autoFocus>Fermer sans appliquer</button></header>
      <p className={styles.guide} role="status">{message}</p>
      <div className={styles.autoStage}>
        <VisionFrame frame={frame} calibration={draft} gridMode={simpleGrid ? "ALIGN" : "FULL"} label="Aperçu de la calibration automatique" />
        {draft && <div className={styles.imageControls} data-testid="vision-image-controls" aria-label="Réglages rapides directement sur l’image">
          <div className={styles.imageControlTop}>
            <button type="button" aria-pressed={simpleGrid} onClick={() => setSimpleGrid(value => !value)}>{simpleGrid ? "Grille simple" : "Grille complète"}</button>
            <button type="button" aria-pressed={fine} onClick={() => setFine(value => !value)}>{fine ? "Pas fin 1 px" : "Pas 5 px"}</button>
          </div>
          <div className={styles.imageControlBottom}>
            <div className={styles.movePad} aria-label="Déplacer la grille">
              <button type="button" disabled={blocked} aria-label="Monter la grille" onClick={() => adjust("UP")}>↑</button>
              <button type="button" disabled={blocked} aria-label="Déplacer la grille à gauche" onClick={() => adjust("LEFT")}>←</button>
              <span aria-hidden="true">✥</span>
              <button type="button" disabled={blocked} aria-label="Déplacer la grille à droite" onClick={() => adjust("RIGHT")}>→</button>
              <button type="button" disabled={blocked} aria-label="Descendre la grille" onClick={() => adjust("DOWN")}>↓</button>
            </div>
            <div className={styles.quickAdjust} aria-label="Taille et rotation">
              <button type="button" disabled={blocked} aria-label="Réduire la grille" onClick={() => adjust("SHRINK")}>−</button>
              <button type="button" disabled={blocked} aria-label="Agrandir la grille" onClick={() => adjust("GROW")}>＋</button>
              <button type="button" disabled={blocked} aria-label="Tourner la grille à gauche" onClick={() => adjust("ROTATE_LEFT")}>↶</button>
              <button type="button" disabled={blocked} aria-label="Tourner la grille à droite" onClick={() => adjust("ROTATE_RIGHT")}>↷</button>
            </div>
          </div>
        </div>}
      </div>
      <p className={styles.onImageHint}>Les commandes principales restent sur la cible : tu ajustes sans la perdre de vue. Le mode « Grille simple » masque les séparations inutiles pendant l’alignement.</p>
      <section className={styles.adjust} aria-label="Réglages complémentaires de la grille">
        <div className={styles.secondaryControls}>
          <button type="button" disabled={blocked} onClick={() => adjust("SECTOR_LEFT")}>20 − 1 secteur</button>
          <button type="button" disabled={blocked} onClick={() => adjust("SECTOR_RIGHT")}>20 + 1 secteur</button>
          <button type="button" disabled={!initial || busy || disabled} onClick={() => { setDraft(initial); invalidate(); setMessage("Proposition d’origine restaurée. Vérifiez les contours et le 20."); }}>Rétablir</button>
          <button type="button" disabled={busy || disabled} onClick={findBoard}>Redétecter</button>
        </div>
        <details><summary>Largeur, hauteur et perspective</summary><div className={styles.secondaryControls}>{advanced.map(([command, label]) => <button key={command} type="button" disabled={blocked} onClick={() => adjust(command)}>{label}</button>)}</div></details>
        {!draft && !busy && <p>La cible n’a pas été reconnue. Fermez cette fenêtre pour utiliser « Calibrer en grand · zoom et loupe ».</p>}
      </section>
      {draft && <section className={styles.review}>
        <p>Le 20 est initialement supposé en haut. La grille simple sert à aligner le Bull, doubles et triples ; passez en grille complète seulement si vous voulez contrôler tous les secteurs.</p>
        <label className={styles.check}><input type="checkbox" checked={shapeOK} onChange={e => setShapeOK(e.target.checked)} />Le centre, les doubles et les triples suivent ma cible.</label>
        <label className={styles.check}><input type="checkbox" checked={twentyOK} onChange={e => setTwentyOK(e.target.checked)} />Le 20 de la grille correspond au vrai 20.</label>
      </section>}
      <footer className={styles.footer}><button type="button" className={styles.primary} disabled={!draft || !shapeOK || !twentyOK || disabled || busy} onClick={apply}>Appliquer cette détection</button><span>Votre calibration précédente reste inchangée tant que vous n’appliquez pas.</span></footer>
    </dialog>}
  </>;
}
