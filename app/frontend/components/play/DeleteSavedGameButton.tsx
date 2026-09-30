"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { DeleteGameDialog } from "./DeleteGameDialog";
import type { LocalControls } from "./useLocalGame";

export function DeleteSavedGameButton({ controls }: { controls: LocalControls }) {
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const cloud = Boolean(controls.sync?.active);
  async function confirm() {
    if (!target || busy) return;
    setBusy(true); setError("");
    try {
      if (await controls.remove(target)) setTarget(null);
      else setError(cloud ? "Suppression non confirmée. Fermez cette fenêtre, vérifiez la synchronisation et réessayez." : "La suppression n’a pas été enregistrée. Fermez cette fenêtre et vérifiez la sauvegarde avant de réessayer.");
    } finally { setBusy(false); }
  }
  return <>
    {controls.sessionId ? <button type="button" className="play-delete-button" disabled={controls.busy || controls.blocked || Boolean(controls.problem) || busy}
      onClick={() => { setTarget(controls.sessionId); setError(""); }}><Trash2 size={16} aria-hidden="true" />Supprimer la partie</button> : null}
    {target ? <DeleteGameDialog busy={busy} error={error} onCancel={() => setTarget(null)} onConfirm={() => { void confirm(); }}
      description={cloud ? "La partie affichée, ses lancers et son résultat éventuel seront supprimés de la session synchronisée sur tous vos appareils. Les autres parties et les copies locales indépendantes seront conservées." : "La partie affichée, ses lancers et son résultat éventuel seront supprimés de ce navigateur. Les autres parties seront conservées."} /> : null}
  </>;
}
