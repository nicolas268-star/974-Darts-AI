"use client";

import { useState } from "react";
import { AlertTriangle, BadgeCheck, Link2, Search, ShieldCheck, X } from "lucide-react";
import type { CanonicalMergePreview, IdentitySuggestionPlayer } from "@/lib/player/identity-assistant-types";

const backend = "/api/admin/backend";
type Side = "left" | "right";
type Candidate = IdentitySuggestionPlayer & { canonical_player_id: string | null; canonical_display_name: string | null };

export default function ManualIdentityMerge() {
  const [queries, setQueries] = useState<Record<Side, string>>({ left: "", right: "" });
  const [results, setResults] = useState<Record<Side, Candidate[]>>({ left: [], right: [] });
  const [selected, setSelected] = useState<Record<Side, Candidate | null>>({ left: null, right: null });
  const [loading, setLoading] = useState<Side | null>(null);
  const [keep, setKeep] = useState<Side | null>(null);
  const [preview, setPreview] = useState<CanonicalMergePreview | null>(null);
  const [message, setMessage] = useState("");

  async function search(side: Side) {
    const query = queries[side].trim();
    if (!query) return;
    setLoading(side); setMessage("");
    try {
      const parameters = new URLSearchParams({ query });
      const response = await fetch(`${backend}/api/v1/identities/candidates/list?${parameters}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? data.error ?? "Recherche impossible");
      setResults((current) => ({ ...current, [side]: data.players ?? [] }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Recherche impossible");
    } finally { setLoading(null); }
  }

  function choose(side: Side, candidate: Candidate) {
    setSelected((current) => ({ ...current, [side]: candidate }));
    setResults((current) => ({ ...current, [side]: [] }));
    setMessage("");
  }

  async function requestPreview(keepSide: Side) {
    const keepPlayer = selected[keepSide];
    const mergePlayer = selected[keepSide === "left" ? "right" : "left"];
    if (!keepPlayer || !mergePlayer) return;
    if (keepPlayer.player_id === mergePlayer.player_id) { setMessage("Sélectionne deux joueurs différents."); return; }
    setLoading(keepSide); setMessage("");
    try {
      const response = await fetch(`${backend}/api/v1/identities/canonical-merge/preview`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keep_player_id: keepPlayer.player_id, merge_player_id: mergePlayer.player_id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? data.error ?? "Prévisualisation impossible");
      setKeep(keepSide); setPreview(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Prévisualisation impossible");
    } finally { setLoading(null); }
  }

  async function confirm() {
    if (!preview || !keep) return;
    const keepPlayer = selected[keep];
    const mergePlayer = selected[keep === "left" ? "right" : "left"];
    if (!keepPlayer || !mergePlayer) return;
    setLoading(keep);
    try {
      const response = await fetch(`${backend}/api/v1/identities/canonical-merge/apply`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keep_player_id: keepPlayer.player_id, merge_player_id: mergePlayer.player_id, notes: `Fusion manuelle administrateur : ${mergePlayer.display_name} → ${keepPlayer.display_name}` }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? data.error ?? "Fusion impossible");
      setPreview(null); setKeep(null); setSelected({ left: null, right: null }); setQueries({ left: "", right: "" });
      setMessage(`Fusion réussie : ${mergePlayer.display_name} est rattaché à ${keepPlayer.display_name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Fusion impossible");
    } finally { setLoading(null); }
  }

  return <section className="identity-manual-merge">
    <header><div><Link2 size={18}/><div><strong>Fusion manuelle</strong><span>Choisir deux joueurs, même si l’IA ne les propose pas.</span></div></div><small>Validation obligatoire</small></header>
    <div className="identity-manual-grid">
      {(["left", "right"] as Side[]).map((side, index) => <div className="identity-manual-picker" key={side}>
        <label>Joueur {index + 1}</label>
        <div className="identity-manual-search"><Search size={15}/><input value={queries[side]} onChange={(event) => setQueries((current) => ({ ...current, [side]: event.target.value }))} onKeyDown={(event) => event.key === "Enter" && void search(side)} placeholder={side === "left" ? "Ex. Coco" : "Ex. Corentin"}/><button type="button" onClick={() => void search(side)} disabled={loading === side}>Rechercher</button></div>
        {selected[side] && <div className="identity-manual-selected"><b>{selected[side]!.display_name}</b><span>{selected[side]!.team ?? "Équipe non renseignée"}</span><button type="button" onClick={() => setSelected((current) => ({ ...current, [side]: null }))}><X size={14}/></button></div>}
        {!!results[side].length && <div className="identity-manual-results">{results[side].map((candidate) => <button type="button" key={candidate.player_id} onClick={() => choose(side, candidate)}><b>{candidate.display_name}</b><span>{candidate.team ?? "Équipe non renseignée"}</span></button>)}</div>}
      </div>)}
    </div>
    {selected.left && selected.right && <div className="identity-manual-actions"><span>Quelle identité veux-tu conserver ?</span><button type="button" onClick={() => void requestPreview("left")}><BadgeCheck size={15}/>Conserver {selected.left.display_name}</button><button type="button" onClick={() => void requestPreview("right")}><BadgeCheck size={15}/>Conserver {selected.right.display_name}</button></div>}
    {message && <p className="identity-manual-message">{message}</p>}
    {preview && <div className="identity-merge-modal-backdrop" role="presentation"><section className="identity-merge-modal" role="dialog" aria-modal="true"><div className="identity-merge-modal-title"><div><span><ShieldCheck size={16}/> Fusion manuelle sécurisée</span><h2>Confirmer la fusion</h2></div><button type="button" onClick={() => setPreview(null)}><X size={18}/></button></div><div className="identity-merge-direction"><article><small>Identité conservée</small><strong>{preview.keep_identity.display_name}</strong><span>{preview.keep_identity.identity_id}</span></article><Link2 size={22}/><article className="is-merged"><small>Identité archivée</small><strong>{preview.merge_identity.display_name}</strong><span>{preview.merge_identity.identity_id}</span></article></div><div className="identity-merge-impact"><article><strong>{preview.impact.aliases_after_merge}</strong><span>alias après fusion</span></article><article><strong>{preview.impact.memberships_after_merge}</strong><span>appartenances équipe</span></article><article><strong>{preview.impact.source_player_ids_after_merge}</strong><span>identifiants joueurs</span></article><article><strong>{preview.impact.legs_compiled_after_merge}</strong><span>legs compilés</span></article></div><div className="identity-merge-warning"><AlertTriangle size={18}/><span>L’ancienne identité sera archivée. Aucun joueur, match ou statistique historique ne sera supprimé.</span></div><div className="identity-merge-actions"><button type="button" className="is-cancel" onClick={() => setPreview(null)}>Annuler</button><button type="button" className="is-confirm" disabled={loading !== null} onClick={() => void confirm()}><BadgeCheck size={16}/>Confirmer la fusion</button></div></section></div>}
  </section>;
}
