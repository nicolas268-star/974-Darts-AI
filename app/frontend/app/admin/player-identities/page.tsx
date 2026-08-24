"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  BrainCircuit,
  Check,
  ChevronDown,
  Link2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import type {
  CanonicalMergePreview,
  IdentitySuggestion,
  IdentitySuggestionsResponse,
} from "@/lib/player/identity-assistant-types";
import ManualIdentityMerge from "./ManualIdentityMerge";
import "./identity-admin.css";
import "./manual-identity-merge.css";

const backend = "/api/admin/backend";

const toneLabel = {
  very_high: "Très forte confiance",
  high: "Forte confiance",
  review: "À vérifier",
  low: "Faible confiance",
};

export default function IdentityAdminPage() {
  const [payload, setPayload] = useState<IdentitySuggestionsResponse | null>(null);
  const [query, setQuery] = useState("");
  const [minimumScore, setMinimumScore] = useState(68);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [pendingMerge, setPendingMerge] = useState<{
    suggestion: IdentitySuggestion;
    canonical: "left" | "right";
    preview: CanonicalMergePreview;
  } | null>(null);

  const load = async () => {
    setLoading(true);
    setMessage("");
    try {
      const url = new URL(
        `${backend}/api/v1/identities/suggestions/list`,
        window.location.origin,
      );
      if (query.trim()) url.searchParams.set("query", query.trim());
      url.searchParams.set("minimum_score", String(minimumScore));
      const response = await fetch(url.toString(), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Chargement impossible");
      setPayload(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [minimumScore]);

  const visible = useMemo(
    () => (payload?.suggestions ?? []).filter(
      (item) => !dismissed.includes(item.suggestion_id) && !item.already_same_identity,
    ),
    [payload, dismissed],
  );

  const requestPreview = async (
    suggestion: IdentitySuggestion,
    canonical: "left" | "right",
  ) => {
    const canonicalPlayer = canonical === "left" ? suggestion.left : suggestion.right;
    const sourcePlayer = canonical === "left" ? suggestion.right : suggestion.left;

    setBusyId(suggestion.suggestion_id);
    setMessage("");
    try {
      const response = await fetch(`${backend}/api/v1/identities/canonical-merge/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keep_player_id: canonicalPlayer.player_id,
          merge_player_id: sourcePlayer.player_id,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Prévisualisation impossible");
      setPendingMerge({ suggestion, canonical, preview: data });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setBusyId(null);
    }
  };

  const rejectSuggestion = async (suggestion: IdentitySuggestion) => {
    setBusyId(suggestion.suggestion_id);
    setMessage("");
    try {
      const response = await fetch(`${backend}/api/v1/identities/suggestions/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          left_player_id: suggestion.left.player_id,
          right_player_id: suggestion.right.player_id,
          notes: `Validation administrateur : ${suggestion.left.display_name} et ${suggestion.right.display_name} sont deux personnes différentes`,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Décision impossible");

      setDismissed((current) => [...current, suggestion.suggestion_id]);
      setMessage(
        `Décision enregistrée : ${suggestion.left.display_name} et ${suggestion.right.display_name} ne seront plus proposés ensemble.`,
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setBusyId(null);
    }
  };

  const confirmMerge = async () => {
    if (!pendingMerge) return;

    const { suggestion, canonical } = pendingMerge;
    const canonicalPlayer = canonical === "left" ? suggestion.left : suggestion.right;
    const sourcePlayer = canonical === "left" ? suggestion.right : suggestion.left;

    setBusyId(suggestion.suggestion_id);
    setMessage("");
    try {
      const response = await fetch(`${backend}/api/v1/identities/canonical-merge/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keep_player_id: canonicalPlayer.player_id,
          merge_player_id: sourcePlayer.player_id,
          notes: `Validation administrateur : ${sourcePlayer.display_name} → ${canonicalPlayer.display_name}`,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Fusion impossible");

      setDismissed((current) => [...current, suggestion.suggestion_id]);
      setPendingMerge(null);
      setMessage(
        `Fusion réussie : ${sourcePlayer.display_name} est maintenant rattaché à ${canonicalPlayer.display_name}.`,
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erreur inconnue");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="identity-admin identity-assistant-page">
      <header className="identity-assistant-header">
        <div className="identity-assistant-orb"><BrainCircuit size={30}/></div>
        <div>
          <span><Sparkles size={16}/> Assistant de fusion d’identités</span>
          <h1>Résoudre les doublons joueurs</h1>
          <p>
            Le moteur propose des rapprochements explicables. Aucune fusion n’est
            réalisée sans validation administrateur.
          </p>
        </div>
        <div className="identity-contract">
          <ShieldCheck size={16}/>
          <strong>Fusion non destructive</strong>
          <small>Fusion non destructive</small>
        </div>
      </header>

      <section className="identity-assistant-toolbar">
        <label>
          <Search size={16}/>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void load()}
            placeholder="Rechercher Nico, Dudule, Ben…"
          />
        </label>
        <label className="identity-score-filter">
          <span>Confiance minimum</span>
          <select
            value={minimumScore}
            onChange={(event) => setMinimumScore(Number(event.target.value))}
          >
            <option value={95}>95 — Très probable</option>
            <option value={82}>82 — Probable</option>
            <option value={68}>68 — À vérifier</option>
          </select>
          <ChevronDown size={15}/>
        </label>
        <button type="button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={16} className={loading ? "is-spinning" : ""}/>
          Actualiser
        </button>
      </section>

      {message && <div className="identity-assistant-message">{message}</div>}

      <ManualIdentityMerge/>

      <section className="identity-assistant-summary">
        <article><strong>{visible.length}</strong><span>suggestions à traiter</span></article>
        <article><strong>{payload?.suggestions.filter((item) => item.level === "very_high").length ?? 0}</strong><span>très forte confiance</span></article>
        <article><strong>{dismissed.length}</strong><span>traitées dans cette session</span></article>
      </section>

      <section className="identity-suggestion-list">
        {visible.map((suggestion) => (
          <article
            className={`identity-suggestion identity-level-${suggestion.level}`}
            key={suggestion.suggestion_id}
          >
            <div className="identity-suggestion-confidence">
              <span>{suggestion.label}</span>
              <strong>{suggestion.score}</strong>
              <small>/100</small>
              <div><i style={{ width: `${suggestion.score}%` }}/></div>
              <em>{toneLabel[suggestion.level]}</em>
            </div>

            <div className="identity-player-card">
              <span>{suggestion.left.display_name.slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{suggestion.left.display_name}</strong>
                <small>{suggestion.left.team ?? "Équipe non renseignée"}</small>
              </div>
              <button
                type="button"
                disabled={busyId === suggestion.suggestion_id}
                onClick={() => void requestPreview(suggestion, "left")}
              >
                <BadgeCheck size={15}/> Garder comme identité
              </button>
            </div>

            <div className="identity-link-symbol"><Link2 size={19}/></div>

            <div className="identity-player-card">
              <span>{suggestion.right.display_name.slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{suggestion.right.display_name}</strong>
                <small>{suggestion.right.team ?? "Équipe non renseignée"}</small>
              </div>
              <button
                type="button"
                disabled={busyId === suggestion.suggestion_id}
                onClick={() => void requestPreview(suggestion, "right")}
              >
                <BadgeCheck size={15}/> Garder comme identité
              </button>
            </div>

            <div className="identity-reasons">
              <span>Pourquoi cette suggestion ?</span>
              {suggestion.reasons.length ? suggestion.reasons.map((reason) => (
                <small key={reason}><Check size={13}/>{reason}</small>
              )) : <small><AlertTriangle size={13}/>Vérification manuelle nécessaire</small>}
            </div>

            <button
              type="button"
              className="identity-dismiss"
              disabled={busyId === suggestion.suggestion_id}
              onClick={() => void rejectSuggestion(suggestion)}
            >
              <X size={15}/> Ce ne sont pas les mêmes personnes
            </button>
          </article>
        ))}

        {!loading && visible.length === 0 && (
          <div className="identity-assistant-empty">
            <Users size={28}/>
            <strong>Aucune suggestion à traiter</strong>
            <span>Modifie le seuil ou la recherche pour afficher d’autres rapprochements.</span>
          </div>
        )}
      </section>


      {pendingMerge && (
        <div className="identity-merge-modal-backdrop" role="presentation">
          <section className="identity-merge-modal" role="dialog" aria-modal="true">
            <div className="identity-merge-modal-title">
              <div>
                <span><ShieldCheck size={16}/> Fusion canonique sécurisée</span>
                <h2>Confirmer la fusion</h2>
              </div>
              <button type="button" onClick={() => setPendingMerge(null)}>
                <X size={18}/>
              </button>
            </div>

            <div className="identity-merge-direction">
              <article>
                <small>Identité conservée</small>
                <strong>{pendingMerge.preview.keep_identity.display_name}</strong>
                <span>{pendingMerge.preview.keep_identity.identity_id}</span>
              </article>
              <Link2 size={22}/>
              <article className="is-merged">
                <small>Identité archivée</small>
                <strong>{pendingMerge.preview.merge_identity.display_name}</strong>
                <span>{pendingMerge.preview.merge_identity.identity_id}</span>
              </article>
            </div>

            <div className="identity-merge-impact">
              <article><strong>{pendingMerge.preview.impact.aliases_after_merge}</strong><span>alias après fusion</span></article>
              <article><strong>{pendingMerge.preview.impact.memberships_after_merge}</strong><span>appartenances équipe</span></article>
              <article><strong>{pendingMerge.preview.impact.source_player_ids_after_merge}</strong><span>identifiants joueurs</span></article>
              <article><strong>{pendingMerge.preview.impact.legs_compiled_after_merge}</strong><span>legs compilés</span></article>
            </div>

            <div className="identity-merge-warning">
              <AlertTriangle size={18}/>
              <span>
                L’ancienne identité sera marquée MERGED. Aucun joueur ni aucune statistique
                historique ne sera supprimé ou réécrit.
              </span>
            </div>

            <div className="identity-merge-actions">
              <button type="button" className="is-cancel" onClick={() => setPendingMerge(null)}>
                Annuler
              </button>
              <button
                type="button"
                className="is-confirm"
                disabled={busyId === pendingMerge.suggestion.suggestion_id}
                onClick={() => void confirmMerge()}
              >
                <BadgeCheck size={16}/> Confirmer la fusion
              </button>
            </div>
          </section>
        </div>
      )}

      <div className="identity-assistant-safety">
        <ShieldCheck size={18}/>
        <div>
          <strong>Validation humaine obligatoire</strong>
          <span>
            L’assistant ne supprime aucun joueur, ne déplace aucune statistique et
            ne fusionne jamais automatiquement deux personnes.
          </span>
        </div>
      </div>
    </main>
  );
}
