"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Download, Share2, SlidersHorizontal } from "lucide-react";
import type { CardFormat, CardPayload, CardSnapshot, Crop, ThemeId } from "@/lib/player-card/types";
import { DEFAULT_CROP } from "@/lib/player-card/types";
import { THEMES } from "@/lib/player-card/themes";
import { renderCard } from "@/lib/player-card/render";
import { canShareFile, downloadFile, filename, pngBlob, shareFile } from "@/lib/player-card/export";
import { PhotoEditor } from "./PhotoEditor";
import "./player-card.css";

type Ready = { key: string; url: string; file: File; snapshot: CardSnapshot; warnings: string[] };
export default function PlayerCardStudio({ playerId, season, initial, maxPhotoBytes = 10 * 1024 * 1024 }: { playerId?: string; season?: string; initial?: CardPayload; maxPhotoBytes?: number }) {
  const [payload, setPayload] = useState<CardPayload | null>(initial ?? null), [selectedSeason, setSeason] = useState(season ?? initial?.selectedSeason ?? "");
  const [theme, setTheme] = useState<ThemeId>(initial?.theme ?? "neutral"), [format, setFormat] = useState<CardFormat>("publication");
  const [photo, setPhoto] = useState<string | null>(null), [crop, setCrop] = useState<Crop>(DEFAULT_CROP), [editor, setEditor] = useState(false);
  const [ready, setReady] = useState<Ready | null>(null), [error, setError] = useState(""), [message, setMessage] = useState(""), [retry, setRetry] = useState(0), [sharing, setSharing] = useState(false);
  const [revision, setRevision] = useState(0);
  const defaultApplied = useRef(Boolean(initial)), version = useRef(0);
  useEffect(() => {
    if (initial || !playerId) return;
    const controller = new AbortController(); const generation = ++version.current;
    fetch(`/api/player-card/${encodeURIComponent(playerId)}${selectedSeason ? `?season=${encodeURIComponent(selectedSeason)}` : ""}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Statistiques indisponibles.");
      if (generation !== version.current) return;
      setPayload(result); if (!defaultApplied.current) { setTheme(result.theme); defaultApplied.current = true; }
    }).catch(e => { if (!controller.signal.aborted && generation === version.current) setError(e instanceof Error ? e.message : "Statistiques indisponibles."); });
    return () => { controller.abort(); };
  }, [initial, playerId, selectedSeason, retry]);
  const key = JSON.stringify([payload, selectedSeason, theme, format, photo, crop, retry, revision]);
  useEffect(() => {
    if (!payload) return;
    let cancelled = false; let url: string | undefined;
    const snapshot: CardSnapshot = { data: payload.data, theme, format, photo, crop: { ...crop }, generatedAt: new Date().toISOString() };
    renderCard(snapshot).then(async result => {
      const blob = await pngBlob(result.canvas); if (cancelled) return;
      const file = new File([blob], filename(snapshot), { type: "image/png" }); url = URL.createObjectURL(blob);
      setReady({ key, url, file, snapshot, warnings: result.warnings });
    }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Export indisponible."); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [payload, theme, format, photo, crop, retry, key]);
  const current = ready?.key === key && payload && !editor ? ready : null;
  function invalidate() { setReady(null); setMessage(""); setError(""); setRevision(value => value + 1); }
  async function share() {
    if (!current || sharing) return;
    setSharing(true); setMessage("");
    try {
      const result = await shareFile(current.file);
      if (result === "unsupported") setMessage("Le partage de fichiers n’est pas disponible dans ce navigateur. Téléchargez le PNG puis partagez-le.");
      if (result === "shared") setMessage("Le partage natif est terminé.");
    } catch { setMessage("Le partage n’a pas abouti. Vous pouvez télécharger le PNG."); }
    finally { setSharing(false); }
  }
  const back = playerId ? `/players/${encodeURIComponent(playerId)}${selectedSeason ? `?season=${encodeURIComponent(selectedSeason)}` : ""}` : "/player-card-preview?view=profile";
  return <main className="pc-studio">
    <header className="pc-studio-header"><a href={back}>← Profil joueur</a><span>974<span>Darts</span> / PLAYER CARD</span></header>
    <div className="pc-studio-heading"><div><p>VOTRE JEU PREND FORME</p><h1>Aperçu de ma carte</h1></div><span className="pc-subtitle">Mon jeu. Mes stats. Ma carte.</span></div>
    <div className="pc-workspace">
      <section className="pc-preview-panel" aria-label="Aperçu de la carte" aria-busy={!current && !error}>
        {current ? <>
          {/* This PNG is the exact prepared download and share file. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={`pc-card pc-card-${format}`} src={current.url} alt={`Carte ${payload!.data.name}, ${payload!.data.period}, thème ${THEMES[theme].label}`} width={1080} height={format === "story" ? 1920 : 1350}/>
          <span className="pc-export-state">PNG prêt · 1080 × {format === "story" ? "1920" : "1350"}</span>
        </> : <div className="pc-preparing" role="status">{error ? "La carte n’a pas pu être préparée." : editor ? "Personnalisation de votre photo…" : "Préparation de votre carte…"}</div>}
      </section>
      <aside className="pc-settings">
        {payload?.data.demonstration && <p className="pc-demo-notice">Statistiques de démonstration — à actualiser</p>}
        {!payload?.data.hasData && payload && <p className="pc-demo-notice">Aucune statistique disponible pour cette période. Les valeurs restent indiquées par un tiret.</p>}
        <details className="pc-customize" open={undefined}><summary><SlidersHorizontal size={18}/> Personnaliser</summary>
          <fieldset disabled={sharing}><legend>Format</legend><div className="pc-segments">{([['publication', 'Publication'], ['story', 'Story']] as const).map(([id, label]) => <button key={id} aria-pressed={format === id} onClick={() => { invalidate(); setFormat(id); }}>{label}</button>)}</div></fieldset>
          <fieldset disabled={sharing}><legend>Thème</legend><div className="pc-theme-options">{Object.values(THEMES).map(t => <button key={t.id} aria-pressed={theme === t.id} onClick={() => { invalidate(); setTheme(t.id); }}><i style={{ background: t.accent }}/>{t.label}</button>)}</div><small>L’habillage conserve votre club et votre équipe.</small></fieldset>
          {payload && <label className="pc-period">Période statistique<select aria-label="Période statistique" value={selectedSeason || payload.selectedSeason} disabled={Boolean(initial) || sharing} onChange={e => { version.current++; invalidate(); setPayload(null); setSeason(e.target.value); }}>
            {payload.seasons.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select></label>}
          {payload?.data.competition && <p className="pc-competition">{payload.data.competition}</p>}
          <button className="pc-photo-button" disabled={sharing} onClick={() => setEditor(true)}><Camera size={18}/> Modifier ma photo</button>
          <p className="pc-local-note">La photo importée reste locale à votre carte.</p>
        </details>
        {error && <div className="pc-error" role="alert"><p>{error}</p><button onClick={() => { invalidate(); if (!initial) { version.current++; setPayload(null); } setRetry(retry + 1); }}>Réessayer</button></div>}
        {current?.warnings.map(w => <p className="pc-demo-notice" key={w}>{w}</p>)}
        <div className="pc-actions"><button className="pc-primary" disabled={!current || sharing} onClick={() => void share()}><Share2 size={19}/>{sharing ? "Partage…" : "Partager ma carte"}</button><button disabled={!current || sharing} onClick={() => { if (current) { downloadFile(current.file); setMessage("Téléchargement du PNG demandé."); } }}><Download size={19}/> Télécharger en PNG</button></div>
        {current && !canShareFile(current.file) && <p className="pc-local-note">Téléchargez le PNG pour le partager depuis votre appareil.</p>}
        <p className="pc-message" role="status">{message}</p>
        <p className="pc-local-note">Carte composée à partir des statistiques publiques du profil, sans ressaisie.</p>
      </aside>
    </div>
    {editor && <PhotoEditor photo={photo} crop={crop} maxBytes={maxPhotoBytes} onClose={() => setEditor(false)} onApply={(value, framing) => { invalidate(); setPhoto(value); setCrop(framing); }}/ >}
  </main>;
}
