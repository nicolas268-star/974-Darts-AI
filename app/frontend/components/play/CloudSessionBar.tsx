"use client";

import Link from "next/link";
import { useState } from "react";
import type { SyncControls } from "./useSyncedGame";

export function CloudSessionBar({ sync, reset, hasGame }: { sync: SyncControls; reset: () => void; hasGame: boolean }) {
  const [confirming, setConfirming] = useState(false), [copied, setCopied] = useState(false);
  return <section className="play-save-panel play-cloud-panel" aria-label="Synchronisation PC téléphone">
    <strong>{sync.isScorer ? "Saisie sur cet appareil" : "Écran de score · lecture seule"}</strong>
    <p role="status">{sync.message || "Partie synchronisée avec votre compte. Les autres écrans suivent automatiquement."}</p>
    <small>Connectez le PC et le téléphone au même compte. Un seul appareil saisit les scores à la fois.</small>
    <div className="play-save-actions">
      {sync.error ? <button type="button" disabled={sync.busy} onClick={sync.retry}>Réessayer la synchronisation</button> :
        sync.isScorer ? <button type="button" disabled={sync.busy} onClick={sync.observe}>Passer en écran de score</button> :
          <button type="button" disabled={sync.busy} onClick={sync.claim}>Saisir sur cet appareil</button>}
      <Link href="/play" aria-disabled={sync.busy || sync.error} onClick={(e) => { if (sync.busy || sync.error) e.preventDefault(); }}>Mettre en pause</Link>
      {sync.canWrite && hasGame ? <button type="button" onClick={() => setConfirming(true)}>Nouvelle partie</button> : null}
    </div>
    <details><summary>Ouvrir sur l’autre appareil</summary>
      <p>Ouvrez ce lien sur l’autre appareil, puis connectez-vous au même compte. Il affichera le score sans modifier la partie.</p>
      <label>Lien pour l’autre appareil<input readOnly value={sync.link} onFocus={(event) => event.target.select()} /></label>
      <button type="button" onClick={() => { void navigator.clipboard?.writeText(sync.link).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{copied ? "Lien copié" : "Copier le lien"}</button>
    </details>
    {confirming ? <div className="play-save-confirm" role="alert"><p>Remplacer la partie synchronisée sur tous vos appareils ? Les résultats terminés restent dans l’historique.</p>
      <button type="button" onClick={() => setConfirming(false)}>Continuer la partie</button>
      <button type="button" disabled={!sync.canWrite || sync.busy} onClick={() => { reset(); setConfirming(false); }}>Confirmer la nouvelle partie</button>
    </div> : null}
  </section>;
}
