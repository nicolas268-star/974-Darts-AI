"use client";

import { AlertTriangle, CheckCircle2, Database, LoaderCircle, XCircle } from "lucide-react";
import type { ImportAnalysis } from "@/lib/import/types";
import type { ExecutePublicationResponse, PublicationError } from "@/lib/import/publication";
import type { PublicationPhase } from "@/lib/import/usePublication";

type Props = {
  phase: PublicationPhase;
  file: File;
  analysis: ImportAnalysis;
  result: ExecutePublicationResponse | null;
  error: PublicationError | null;
  onCancel: () => void;
  onConfirm: () => void;
  onClose: () => void;
};

export function PublicationDialog({
  phase,
  file,
  analysis,
  result,
  error,
  onCancel,
  onConfirm,
  onClose,
}: Props) {
  if (phase === "idle") return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="publication-title">
        {phase === "confirm" && (
          <>
            <div className="dialog-icon warning"><AlertTriangle size={28} /></div>
            <h3 id="publication-title">Confirmer la publication réelle</h3>
            <p>
              Le fichier <b>{file.name}</b> sera réanalysé côté serveur puis publié dans Supabase dans une transaction unique.
            </p>
            <div className="dialog-summary">
              <div><span>Joueurs détectés</span><b>{analysis.players.length}</b></div>
              <div><span>Équipes détectées</span><b>{analysis.teams.length}</b></div>
              <div><span>Matchs détectés</span><b>{analysis.matchCount}</b></div>
              <div><span>Legs valides</span><b>{analysis.validLegs}</b></div>
            </div>
            <div className="safety-note">
              Aucune suppression ni mise à jour métier ne sera exécutée dans ce lot.
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onCancel}>Annuler</button>
              <button className="btn btn-primary" onClick={onConfirm}>
                <Database size={18} /> Publier maintenant
              </button>
            </div>
          </>
        )}

        {phase === "publishing" && (
          <>
            <div className="dialog-icon"><LoaderCircle className="spin" size={30} /></div>
            <h3 id="publication-title">Publication en cours</h3>
            <p>Ne ferme pas cette page. PostgreSQL annulera toute la transaction si une seule étape échoue.</p>
            <div className="progress-track"><div className="progress-indeterminate" /></div>
            <ol className="publication-steps">
              <li className="active">Validation et nouvelle analyse du fichier</li>
              <li>Calcul du plan incrémental</li>
              <li>Transaction Supabase</li>
              <li>Commit et rapport final</li>
            </ol>
          </>
        )}

        {phase === "success" && result && (
          <>
            <div className="dialog-icon success"><CheckCircle2 size={30} /></div>
            <h3 id="publication-title">
              {result.status === "NO_CHANGES" ? "Base déjà à jour" : "Publication terminée"}
            </h3>
            <p>{result.message}</p>
            <div className="dialog-summary">
              <div><span>Rencontres</span><b>{result.details.encounters}</b></div>
              <div><span>Matchs</span><b>{result.details.matches}</b></div>
              <div><span>Legs</span><b>{result.details.legs}</b></div>
              <div><span>Stats joueur-leg</span><b>{result.details.playerLegRows}</b></div>
              <div><span>Total inséré</span><b>{result.inserted}</b></div>
              <div><span>Inchangé</span><b>{result.unchanged}</b></div>
            </div>
            {result.transactionId && <p className="transaction-id">Transaction : {result.transactionId}</p>}
            <div className="modal-actions"><button className="btn btn-primary" onClick={onClose}>Terminer</button></div>
          </>
        )}

        {phase === "error" && error && (
          <>
            <div className="dialog-icon danger"><XCircle size={30} /></div>
            <h3 id="publication-title">Publication refusée</h3>
            <p>{error.message}</p>
            <div className="error-code">Erreur HTTP {error.status}</div>
            <div className="modal-actions"><button className="btn btn-secondary" onClick={onClose}>Fermer</button></div>
          </>
        )}
      </section>
    </div>
  );
}
