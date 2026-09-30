"use client";

import Link from "next/link";
import { CloudSessionBar } from "./CloudSessionBar";
import { useState } from "react";
import type { LocalControls } from "./useLocalGame";

export function LocalSessionBar({ controls }: { controls: LocalControls }) {
  const [confirming, setConfirming] = useState(false);
  const invalid = controls.problem === "invalid";
  if (controls.sync?.active) return <CloudSessionBar sync={controls.sync} reset={controls.reset} hasGame={controls.hasGame} />;
  return <section className="play-save-panel" aria-label="Sauvegarde de la partie">
    <div role="status" aria-live="polite">
      {!controls.ready ? "Chargement de votre partie…" : controls.problem === "conflict" ? "Cette partie a changé dans un autre onglet. Rechargez la sauvegarde avant de continuer." :
        invalid ? "Sauvegarde illisible ou incompatible. Elle est conservée ; les nouveaux lancers restent seulement en mémoire." :
          controls.problem === "unavailable" ? "Sauvegarde indisponible sur ce navigateur. Gardez cet onglet ouvert : la partie reste seulement en mémoire." :
            controls.busy ? "Sauvegarde en cours…" : controls.hasGame ? "Partie sauvegardée sur ce navigateur" : "Sauvegarde automatique sur ce navigateur"}
    </div>
    <small>Liée à votre compte sur cet appareil. La suppression des données du navigateur efface ces parties.</small>
    {controls.ready && controls.sync ? <div className="play-save-actions"><button type="button" disabled={controls.busy || Boolean(controls.problem) || controls.sync.busy} onClick={controls.sync.enable}>Synchroniser PC / téléphone</button>{controls.sync.remoteAvailable ? <button type="button" onClick={controls.sync.open}>Ouvrir la partie synchronisée</button> : null}{controls.sync.message ? <p role="status">{controls.sync.message}</p> : null}</div> : null}
    {controls.ready ? <div className="play-save-actions">
      {controls.problem === "conflict" ? <button type="button" onClick={controls.reload}>Recharger la sauvegarde</button> :
        controls.problem === "unavailable" ? <button type="button" disabled={controls.busy} onClick={controls.retry}>Réessayer la sauvegarde</button> : null}
      <Link href="/play" onClick={(event) => { if (controls.busy || (controls.problem && controls.problem !== "conflict")) event.preventDefault(); }} aria-disabled={controls.busy || Boolean(controls.problem && controls.problem !== "conflict")}>{controls.hasGame ? "Mettre en pause" : "Univers Jeux"}</Link>
      {(controls.hasGame || invalid) && !confirming ? <button type="button" disabled={controls.busy || controls.problem === "conflict"} onClick={() => setConfirming(true)}>{invalid ? "Effacer la sauvegarde illisible" : "Nouvelle partie"}</button> : null}
    </div> : null}
    {confirming ? <div className="play-save-confirm" role="alert">
      <p>{invalid ? "Effacer la sauvegarde et l’historique de ce jeu sur ce navigateur ?" : "Remplacer la partie en cours ? Les parties terminées restent dans votre historique."}</p>
      <button type="button" onClick={() => setConfirming(false)}>Continuer la partie</button>
      <button type="button" disabled={controls.busy || controls.problem === "conflict"} onClick={() => { if (invalid) controls.discardInvalid(); else controls.reset(); setConfirming(false); }}>Confirmer la nouvelle partie</button>
    </div> : null}
  </section>;
}
