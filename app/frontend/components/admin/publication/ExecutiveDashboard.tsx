"use client";

import styles from "./ExecutiveDashboard.module.css";

type Phase =
  | "idle"
  | "analyzing"
  | "analyzed"
  | "syncing"
  | "synced"
  | "planning"
  | "planned"
  | "publishing"
  | "published"
  | "error";

type Analysis = {
  filename?: string;
  rows?: number;
  publishedRows?: number;
  columns?: number;
  players?: string[];
  teams?: string[];
  rounds?: string[];
  seasons?: string[];
  matchCount?: number;
  legCount?: number;
  excludedRows?: number;
  criticalCount?: number;
  warningCount?: number;
  infoCount?: number;
  status?: string;
  [key: string]: unknown;
};

type SyncPreview = {
  canPublish?: boolean;
  reason?: string | null;
  sync?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type Props = {
  file: File | null;
  analysis: Analysis | null;
  sync: SyncPreview | null;
  phase: Phase;
};

function valueNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function deepNumber(value: unknown, names: string[]): number {
  if (!value || typeof value !== "object") return 0;

  const record = value as Record<string, unknown>;

  for (const name of names) {
    const current = record[name];
    if (typeof current === "number" && Number.isFinite(current)) {
      return current;
    }
  }

  for (const current of Object.values(record)) {
    if (current && typeof current === "object") {
      const nested = deepNumber(current, names);
      if (nested !== 0) return nested;
    }
  }

  return 0;
}

function phaseLabel(phase: Phase): string {
  const labels: Record<Phase, string> = {
    idle: "En attente",
    analyzing: "Analyse en cours",
    analyzed: "Analyse terminée",
    syncing: "Comparaison en cours",
    synced: "Comparaison terminée",
    planning: "Plan en cours",
    planned: "Plan prêt",
    publishing: "Publication en cours",
    published: "Publication terminée",
    error: "Erreur",
  };

  return labels[phase];
}

function qualityIndex(analysis: Analysis | null): number | null {
  if (!analysis) return null;

  const rows = Math.max(1, valueNumber(analysis.publishedRows) || valueNumber(analysis.rows));
  const critical = valueNumber(analysis.criticalCount);
  const warnings = valueNumber(analysis.warningCount);

  // Indice analytique interne : ce n'est pas une statistique officielle Nakka.
  const criticalPenalty = Math.min(70, critical * 20);
  const warningRate = warnings / rows;
  const warningPenalty = Math.min(30, warningRate * 30);

  return Math.max(0, Math.round(100 - criticalPenalty - warningPenalty));
}

export default function ExecutiveDashboard({
  file,
  analysis,
  sync,
  phase,
}: Props) {
  const newItems = deepNumber(sync, [
    "totalNew",
    "new",
    "added",
    "toCreate",
    "createCount",
  ]);

  const unchangedItems = deepNumber(sync, [
    "totalUnchanged",
    "unchanged",
    "same",
    "existing",
  ]);

  const conflicts = deepNumber(sync, [
    "totalConflicts",
    "conflicts",
    "updated",
    "updateCount",
  ]);

  const deletes = deepNumber(sync, [
    "totalDeleted",
    "deleted",
    "deletes",
    "deleteCount",
  ]);

  const index = qualityIndex(analysis);
  const publicationState =
    sync === null
      ? "Non évaluée"
      : sync.canPublish
        ? "AUTORISÉE"
        : "BLOQUÉE";

  return (
    <section className={styles.dashboard} aria-labelledby="executive-dashboard-title">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>PILOTAGE DES DONNÉES</p>
          <h2 id="executive-dashboard-title">Dashboard exécutif d’import</h2>
        </div>
        <div className={styles.phase}>
          <span>État du pipeline</span>
          <strong>{phaseLabel(phase)}</strong>
        </div>
      </div>

      <div className={styles.primaryGrid}>
        <article>
          <span>Export</span>
          <strong title={file?.name}>{file?.name ?? "Aucun fichier"}</strong>
        </article>
        <article>
          <span>Joueurs détectés</span>
          <strong>{analysis?.players?.length ?? 0}</strong>
        </article>
        <article>
          <span>Matchs</span>
          <strong>{valueNumber(analysis?.matchCount)}</strong>
        </article>
        <article>
          <span>Legs</span>
          <strong>{valueNumber(analysis?.legCount)}</strong>
        </article>
        <article className={conflicts > 0 ? styles.warningCard : ""}>
          <span>Conflits Supabase</span>
          <strong>{conflicts}</strong>
        </article>
        <article
          className={
            sync?.canPublish === true
              ? styles.successCard
              : sync
                ? styles.dangerCard
                : ""
          }
        >
          <span>Publication</span>
          <strong>{publicationState}</strong>
        </article>
      </div>

      <div className={styles.secondaryGrid}>
        <article>
          <span>Lignes analysées</span>
          <strong>{valueNumber(analysis?.rows)}</strong>
        </article>
        <article>
          <span>Lignes publiables</span>
          <strong>{valueNumber(analysis?.publishedRows)}</strong>
        </article>
        <article>
          <span>Nouveaux éléments</span>
          <strong>{newItems}</strong>
        </article>
        <article>
          <span>Inchangés</span>
          <strong>{unchangedItems}</strong>
        </article>
        <article>
          <span>Exclus</span>
          <strong>{valueNumber(analysis?.excludedRows)}</strong>
        </article>
        <article>
          <span>Suppressions potentielles</span>
          <strong>{deletes}</strong>
        </article>
        <article>
          <span>Erreurs critiques</span>
          <strong>{valueNumber(analysis?.criticalCount)}</strong>
        </article>
        <article>
          <span>Avertissements</span>
          <strong>{valueNumber(analysis?.warningCount)}</strong>
        </article>
      </div>

      <div className={styles.qualityPanel}>
        <div>
          <p className={styles.eyebrow}>INDICE ANALYTIQUE INTERNE</p>
          <h3>
            {index === null
              ? "En attente de l’analyse"
              : index >= 90
                ? "Qualité élevée"
                : index >= 70
                  ? "Qualité à surveiller"
                  : "Qualité insuffisante"}
          </h3>
          <p>
            Cet indice synthétique repose uniquement sur les erreurs critiques et
            le taux d’avertissements retournés par le backend. Il ne constitue
            pas une statistique officielle Nakka et ne remplace jamais la
            décision de publication du backend.
          </p>
          {sync?.reason ? <p className={styles.reason}>{sync.reason}</p> : null}
        </div>
        <strong>{index === null ? "—" : `${index}%`}</strong>
      </div>
    </section>
  );
}
