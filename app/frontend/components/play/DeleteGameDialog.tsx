"use client";

import { useEffect, useId, useRef } from "react";

type Props = {
  description: string;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteGameDialog({ description, busy, error, onCancel, onConfirm }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId(), descriptionId = useId();
  useEffect(() => {
    dialog.current?.showModal();
    cancel.current?.focus();
  }, []);
  return <dialog ref={dialog} className="play-delete-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id={titleId}>Supprimer cette partie ?</h2>
    <p id={descriptionId}>{description}</p>
    <p>Cette action est définitive.</p>
    {error ? <p role="alert" className="play-delete-error">{error}</p> : null}
    <div className="play-delete-actions">
      <button ref={cancel} type="button" disabled={busy} onClick={onCancel}>{error ? "Fermer" : "Conserver la partie"}</button>
      <button type="button" className="play-delete-button" disabled={busy} onClick={onConfirm}>{busy ? "Suppression…" : "Confirmer la suppression"}</button>
    </div>
  </dialog>;
}
