"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import styles from "./PublicationCenter.module.css";
import ExecutiveDashboard from "./ExecutiveDashboard";

type Phase =
  | "idle" | "analyzing" | "analyzed" | "syncing" | "synced"
  | "planning" | "planned" | "publishing" | "published" | "error";

type Anomaly = {
  code?: string;
  severity?: string;
  row?: number;
  field?: string;
  value?: unknown;
  message?: string;
};

type Analysis = {
  filename?: string;
  rows?: number;
  publishedRows?: number;
  columns?: number;
  matchCount?: number;
  legCount?: number;
  criticalCount?: number;
  warningCount?: number;
  infoCount?: number;
  status?: string;
  anomalies?: Anomaly[];
  [key: string]: unknown;
};

type SyncPreview = {
  analysis?: Analysis;
  sync?: Record<string, unknown> | null;
  canPublish?: boolean;
  reason?: string | null;
  [key: string]: unknown;
};

type PublicationPlan = {
  analysis?: Analysis;
  comparison?: Record<string, unknown>;
  diff?: Record<string, unknown>;
  plan?: Record<string, unknown>;
  [key: string]: unknown;
};

type HistoryItem = {
  id: string;
  createdAt: string;
  fileName: string;
  response: Record<string, unknown>;
};

type Severity = "ALL" | "CRITICAL" | "WARNING" | "INFO";

const HISTORY_KEY = "974-darts-ai-publication-history-v2";
const PAGE_SIZE = 25;
const MAX_FILE_SIZE = 50 * 1024 * 1024;

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizedSeverity(value: unknown): Exclude<Severity, "ALL"> {
  const severity = stringValue(value).toUpperCase();
  if (severity === "CRITICAL" || severity === "ERROR") return "CRITICAL";
  if (severity === "WARNING" || severity === "WARN") return "WARNING";
  return "INFO";
}

function phaseStep(phase: Phase) {
  if (phase === "published") return 5;
  if (phase === "publishing" || phase === "planned") return 4;
  if (phase === "planning" || phase === "synced") return 3;
  if (phase === "syncing" || phase === "analyzed") return 2;
  return 1;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} octets`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

function errorDetail(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}

async function postFile<T>(
  path: string,
  file: File,
  options?: { headers?: Record<string, string>; query?: Record<string, string> },
): Promise<T> {
  const url = new URL(path, window.location.origin);
  Object.entries(options?.query ?? {}).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const body = new FormData();
  body.set("file", file, file.name);

  const response = await fetch(url, {
    method: "POST",
    headers: options?.headers,
    body,
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload: unknown = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok) {
    throw new Error(errorDetail(payload, `Erreur HTTP ${response.status}`));
  }

  return payload as T;
}

function deepNumber(value: unknown, candidates: string[]): number {
  if (!value || typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;
  for (const key of candidates) {
    const current = record[key];
    if (typeof current === "number" && Number.isFinite(current)) return current;
  }
  for (const current of Object.values(record)) {
    if (current && typeof current === "object") {
      const nested = deepNumber(current, candidates);
      if (nested) return nested;
    }
  }
  return 0;
}

function collectConflictRows(value: unknown): Array<Record<string, unknown>> {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.conflicts)) {
    return record.conflicts.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  }
  for (const current of Object.values(record)) {
    if (current && typeof current === "object") {
      const nested = collectConflictRows(current);
      if (nested.length) return nested;
    }
  }
  return [];
}

function collectPlanSections(value: unknown): Array<{ name: string; count: number }> {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const sections: Array<{ name: string; count: number }> = [];
  for (const [name, current] of Object.entries(record)) {
    if (Array.isArray(current)) {
      sections.push({ name, count: current.length });
    } else if (current && typeof current === "object") {
      for (const nested of collectPlanSections(current)) {
        sections.push({ name: `${name}.${nested.name}`, count: nested.count });
      }
    }
  }
  return sections.filter((section) => section.count > 0).sort((a, b) => b.count - a.count);
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre style={{
      margin: 0, maxHeight: 420, overflow: "auto", padding: 14,
      borderRadius: 12, background: "rgba(3, 15, 28, 0.88)",
      color: "#dbeafe", fontSize: "0.75rem", whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    }}>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function PublicationCenter() {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [sync, setSync] = useState<SyncPreview | null>(null);
  const [plan, setPlan] = useState<PublicationPlan | null>(null);
  const [execution, setExecution] = useState<Record<string, unknown> | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const [severity, setSeverity] = useState<Severity>("ALL");
  const [code, setCode] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setHistory(parsed as HistoryItem[]);
      }
    } catch {
      setHistory([]);
    }
  }, []);

  const busy = ["analyzing", "syncing", "planning", "publishing"].includes(phase);
  const anomalies = useMemo(() => analysis?.anomalies ?? [], [analysis]);

  const groups = useMemo(() => {
    const map = new Map<string, {
      code: string; count: number; critical: number; warning: number; info: number;
    }>();

    anomalies.forEach((item) => {
      const groupCode = stringValue(item.code) || "ANOMALIE";
      const itemSeverity = normalizedSeverity(item.severity);
      const current = map.get(groupCode) ?? {
        code: groupCode, count: 0, critical: 0, warning: 0, info: 0,
      };
      current.count += 1;
      if (itemSeverity === "CRITICAL") current.critical += 1;
      if (itemSeverity === "WARNING") current.warning += 1;
      if (itemSeverity === "INFO") current.info += 1;
      map.set(groupCode, current);
    });

    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [anomalies]);

  const codes = useMemo(() => groups.map((item) => item.code), [groups]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return anomalies.filter((item) => {
      const itemCode = stringValue(item.code) || "ANOMALIE";
      const itemSeverity = normalizedSeverity(item.severity);
      const text = [
        itemCode, item.message, item.field, item.row, item.value,
      ].map(String).join(" ").toLowerCase();

      return (
        (severity === "ALL" || itemSeverity === severity) &&
        (code === "ALL" || itemCode === code) &&
        (!query || text.includes(query))
      );
    });
  }, [anomalies, code, search, severity]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleAnomalies = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const currentStep = phaseStep(phase);
  const syncNew = useMemo(() => deepNumber(sync, ["totalNew", "new", "added", "toCreate", "createCount"]), [sync]);
  const syncUnchanged = useMemo(() => deepNumber(sync, ["totalUnchanged", "unchanged", "same", "existing"]), [sync]);
  const syncConflicts = useMemo(() => deepNumber(sync, ["totalConflicts", "conflicts", "updated", "updateCount"]), [sync]);
  const syncDeletes = useMemo(() => deepNumber(sync, ["totalDeleted", "deleted", "deletes", "deleteCount"]), [sync]);
  const conflictRows = useMemo(() => collectConflictRows(sync), [sync]);
  const planSections = useMemo(() => collectPlanSections(plan?.plan ?? plan), [plan]);
  const backendCanPublish = sync?.canPublish === true;
  const canSync = Boolean(file && analysis && !busy);
  const canPlan = Boolean(file && sync && !busy);
  const canPublish = Boolean(file && plan && confirmed && backendCanPublish && !busy);

  function saveHistory(next: HistoryItem[]) {
    setHistory(next);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  }

  function reset(nextFile: File | null = null) {
    setFile(nextFile);
    setPhase("idle");
    setError(null);
    setConfirmed(false);
    setAnalysis(null);
    setSync(null);
    setPlan(null);
    setExecution(null);
    setSeverity("ALL");
    setCode("ALL");
    setSearch("");
    setPage(1);
  }

  function selectFile(nextFile: File) {
    const extension = nextFile.name.slice(nextFile.name.lastIndexOf(".")).toLowerCase();

    if (![".xlsx", ".xls"].includes(extension)) {
      reset();
      setError("Format refusé. Utilise un fichier XLSX ou XLS.");
      setPhase("error");
      return;
    }
    if (!nextFile.size) {
      reset();
      setError("Le fichier sélectionné est vide.");
      setPhase("error");
      return;
    }
    if (nextFile.size > MAX_FILE_SIZE) {
      reset();
      setError("Le fichier dépasse la limite de 50 Mo.");
      setPhase("error");
      return;
    }
    reset(nextFile);
  }

  async function analyze() {
    if (!file) return;
    setPhase("analyzing");
    setError(null);
    try {
      setAnalysis(await postFile<Analysis>("/api/admin/publication/analyze", file));
      setPhase("analyzed");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analyse impossible.");
      setPhase("error");
    }
  }

  async function compare() {
    if (!file) return;
    setPhase("syncing");
    setError(null);
    try {
      setSync(await postFile<SyncPreview>("/api/admin/publication/sync-preview", file));
      setPhase("synced");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Comparaison impossible.");
      setPhase("error");
    }
  }

  async function generatePlan() {
    if (!file) return;
    setPhase("planning");
    setError(null);
    try {
      setPlan(await postFile<PublicationPlan>(
        "/api/admin/publication/publication-plan",
        file,
        { query: { allow_updates: "false" } },
      ));
      setPhase("planned");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Plan impossible.");
      setPhase("error");
    }
  }

  async function publish() {
    if (!file || !canPublish) return;
    setPhase("publishing");
    setError(null);
    try {
      const result = await postFile<Record<string, unknown>>(
        "/api/admin/publication/execute",
        file,
        { headers: { "X-Publication-Confirmed": "true" } },
      );
      setExecution(result);
      setPhase("published");
      saveHistory([{
        id: `pub-${Date.now()}`,
        createdAt: new Date().toISOString(),
        fileName: file.name,
        response: result,
      }, ...history].slice(0, 50));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Publication impossible.");
      setPhase("error");
    }
  }

  return (
    <main className={styles.shell}>
      <nav className={styles.breadcrumb}>
        <Link href="/admin">Administration</Link><span>/</span>
        <strong>Publication Nakka</strong>
      </nav>

      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>PILOTAGE DES DONNÉES</p>
          <h1>Publication Nakka</h1>
          <p>Analyser, filtrer les anomalies, comparer avec Supabase, planifier puis publier.</p>
        </div>
        <div className={styles.heroStatus}>
          <span>Backend FastAPI connecté</span>
          <strong>Proxy sécurisé actif</strong>
        </div>
      </header>

      <ExecutiveDashboard
        file={file}
        analysis={analysis}
        sync={sync}
        phase={phase}
      />

      <section className={styles.pipeline} style={{ marginTop: 18 }}>
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>PROGRESSION</p><h2>Parcours de publication</h2></div>
          <p>Étape {currentStep} sur 5</p>
        </div>
        <div style={{ height: 10, borderRadius: 999, overflow: "hidden", background: "rgba(148,163,184,.14)" }}>
          <div style={{
            width: `${currentStep * 20}%`, height: "100%", borderRadius: 999,
            background: "linear-gradient(90deg,#ff7a31,#ffb13b)",
            transition: "width 240ms ease",
          }} />
        </div>
        <div className={styles.stepsGrid} style={{ marginTop: 14 }}>
          {["Import", "Analyse", "Supabase", "Plan", "Publication"].map((label, index) => {
            const active = currentStep >= index + 1;
            return (
              <article className={`${styles.stepCard} ${active ? styles.activeStep : ""}`} key={label}>
                <div className={styles.stepTop}>
                  <span className={styles.stepNumber}>{index + 1}</span>
                  <span className={active ? styles.stepAvailable : styles.stepState}>
                    {currentStep > index + 1 ? "Terminé" : currentStep === index + 1 ? "En cours" : "En attente"}
                  </span>
                </div>
                <h2>{label}</h2>
                <p>{active ? "Étape active dans le parcours." : "Disponible après l’étape précédente."}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.importPanel}>
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>ÉTAPE 1</p><h2>Charger l’export Nakka</h2></div>
          <p>XLSX ou XLS · 50 Mo maximum</p>
        </div>

        <div
          className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ""}`}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
          onDrop={(event: DragEvent<HTMLDivElement>) => {
            event.preventDefault(); setDragging(false);
            const dropped = event.dataTransfer.files?.[0];
            if (dropped) selectFile(dropped);
          }}
        >
          <input
            ref={inputRef}
            className={styles.hiddenInput}
            type="file"
            accept=".xlsx,.xls"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const selected = event.target.files?.[0];
              if (selected) selectFile(selected);
            }}
          />
          <div className={styles.dropIcon}>⇧</div>
          <h3>Dépose ton export Excel Nakka ici</h3>
          <p>Le fichier est envoyé au backend uniquement lors d’une action.</p>
          <button type="button" onClick={() => inputRef.current?.click()}>Choisir un fichier Excel</button>
        </div>

        {file ? (
          <div className={`${styles.importMessage} ${styles.successMessage}`}>
            <div className={styles.fileHeader}>
              <div><strong>Fichier prêt</strong><span>{file.name}</span></div>
              <button type="button" onClick={() => reset()}>Changer de fichier</button>
            </div>
            <div className={styles.fileGrid}>
              <div><span>Taille</span><strong>{formatFileSize(file.size)}</strong></div>
              <div><span>Type</span><strong>{file.type || "Non fourni"}</strong></div>
              <div><span>Modifié</span><strong>{new Date(file.lastModified).toLocaleString("fr-FR")}</strong></div>
              <div><span>État</span><strong>{busy ? "Traitement" : "Prêt"}</strong></div>
            </div>
            <div className={styles.publicationActions}>
              <button type="button" onClick={analyze} disabled={busy}>
                {phase === "analyzing" ? "Analyse en cours…" : "Analyser"}
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className={`${styles.importMessage} ${styles.errorMessage}`}>
            <strong>Erreur</strong><span>{error}</span>
          </div>
        ) : null}
      </section>

      {analysis ? (
        <section className={styles.controlPanel}>
          <div className={styles.sectionHeading}>
            <div><p className={styles.eyebrow}>ÉTAPE 2</p><h2>Analyse backend</h2></div>
            <p>Vue synthétique et exploitable des contrôles Data Quality.</p>
          </div>

          <div className={styles.controlSummary}>
            <div><span>Lignes</span><strong>{numberValue(analysis.rows)}</strong></div>
            <div><span>Publiables</span><strong>{numberValue(analysis.publishedRows)}</strong></div>
            <div><span>Matchs</span><strong>{numberValue(analysis.matchCount)}</strong></div>
            <div><span>Legs</span><strong>{numberValue(analysis.legCount)}</strong></div>
          </div>

          <div className={styles.blockingPanel}>
            <div><strong>Critiques</strong><span>{numberValue(analysis.criticalCount)}</span></div>
            <div><strong>Avertissements</strong><span>{numberValue(analysis.warningCount)}</span></div>
            <div><strong>Statut</strong><span>{stringValue(analysis.status) || "—"}</span></div>
          </div>

          {anomalies.length ? (
            <>
              <div className={styles.sectionHeading} style={{ marginTop: 22 }}>
                <div><p className={styles.eyebrow}>REGROUPEMENT</p><h2>Top des anomalies</h2></div>
                <p>{groups.length} catégorie(s) · {anomalies.length} occurrence(s)</p>
              </div>

              <div style={{
                display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))",
                gap: 10,
              }}>
                {groups.slice(0, 8).map((group) => (
                  <button
                    key={group.code}
                    type="button"
                    onClick={() => { setCode(group.code); setPage(1); }}
                    style={{
                      padding: 14, borderRadius: 14, textAlign: "left",
                      color: "#f8fafc", cursor: "pointer",
                      border: code === group.code
                        ? "1px solid rgba(255,155,82,.75)"
                        : "1px solid rgba(148,163,184,.16)",
                      background: code === group.code
                        ? "rgba(255,122,49,.12)"
                        : "rgba(10,31,54,.88)",
                    }}
                  >
                    <strong style={{ display: "block" }}>{group.code}</strong>
                    <span style={{
                      display: "block", marginTop: 8, color: "#ffb13b",
                      fontSize: "1.5rem", fontWeight: 900,
                    }}>{group.count}</span>
                    <small style={{ color: "#8fa6bf" }}>
                      {group.warning} warning · {group.info} info · {group.critical} critique
                    </small>
                  </button>
                ))}
              </div>

              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 2fr auto",
                gap: 10, marginTop: 18, padding: 14, borderRadius: 14,
                border: "1px solid rgba(148,163,184,.15)",
                background: "rgba(10,31,54,.88)",
              }}>
                <select value={severity} onChange={(event) => {
                  setSeverity(event.target.value as Severity); setPage(1);
                }} style={{
                  minHeight: 42, borderRadius: 10, padding: "0 10px",
                  border: "1px solid rgba(148,163,184,.2)",
                  color: "#f8fafc", background: "#07182b",
                }}>
                  <option value="ALL">Toutes les sévérités</option>
                  <option value="CRITICAL">Critiques</option>
                  <option value="WARNING">Avertissements</option>
                  <option value="INFO">Informations</option>
                </select>

                <select value={code} onChange={(event) => {
                  setCode(event.target.value); setPage(1);
                }} style={{
                  minHeight: 42, borderRadius: 10, padding: "0 10px",
                  border: "1px solid rgba(148,163,184,.2)",
                  color: "#f8fafc", background: "#07182b",
                }}>
                  <option value="ALL">Tous les codes</option>
                  {codes.map((item) => <option value={item} key={item}>{item}</option>)}
                </select>

                <input
                  value={search}
                  onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                  placeholder="Rechercher une ligne, un champ, une valeur ou un message…"
                  style={{
                    minHeight: 42, borderRadius: 10, padding: "0 12px",
                    border: "1px solid rgba(148,163,184,.2)",
                    color: "#f8fafc", background: "#07182b",
                  }}
                />

                <button type="button" onClick={() => {
                  setSeverity("ALL"); setCode("ALL"); setSearch(""); setPage(1);
                }} style={{
                  borderRadius: 10, padding: "0 14px", cursor: "pointer",
                  border: "1px solid rgba(255,151,74,.42)",
                  color: "#08111f",
                  background: "linear-gradient(135deg,#ff7a31,#ffb13b)",
                  fontWeight: 900,
                }}>Réinitialiser</button>
              </div>

              <div style={{
                display: "flex", justifyContent: "space-between",
                margin: "14px 0 10px", color: "#8fa6bf",
              }}>
                <span>{filtered.length} résultat(s)</span>
                <span>Page {safePage} / {pageCount}</span>
              </div>

              <div className={styles.controlList}>
                {visibleAnomalies.map((item, index) => {
                  const itemSeverity = normalizedSeverity(item.severity);
                  return (
                    <article
                      key={`${item.code}-${item.row}-${index}`}
                      className={`${styles.controlItem} ${
                        itemSeverity === "CRITICAL"
                          ? styles.control_error
                          : itemSeverity === "WARNING"
                            ? styles.control_warning
                            : styles.control_info
                      }`}
                    >
                      <div>
                        <span>{itemSeverity === "CRITICAL" ? "×" : itemSeverity === "WARNING" ? "!" : "i"}</span>
                        <strong>{item.code || "ANOMALIE"}</strong>
                      </div>
                      <p>Ligne {item.row ?? "—"} · {item.field || "Champ inconnu"} · {item.message || "Aucun détail"}</p>
                    </article>
                  );
                })}
              </div>

              <div className={styles.publicationActions} style={{ justifyContent: "center" }}>
                <button type="button" disabled={safePage <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}>
                  Page précédente
                </button>
                <button type="button" disabled={safePage >= pageCount}
                  onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>
                  Page suivante
                </button>
              </div>
            </>
          ) : (
            <div className={styles.nextStepNotice} style={{ marginTop: 16 }}>
              <strong>Aucune anomalie signalée</strong>
              <p>L’analyse backend n’a retourné aucune anomalie.</p>
            </div>
          )}

          <div className={styles.publicationActions}>
            <button type="button" onClick={compare} disabled={!canSync}>
              {phase === "syncing" ? "Comparaison en cours…" : "Comparer avec Supabase"}
            </button>
          </div>
        </section>
      ) : null}

      {sync ? (
        <section className={styles.previewPanel}>
          <div className={styles.sectionHeading}>
            <div><p className={styles.eyebrow}>ÉTAPE 3</p><h2>Aperçu Supabase</h2></div>
            <p>{sync.canPublish ? "Préparation du plan autorisée." : sync.reason || "Publication bloquée."}</p>
          </div>

          <div className={styles.publicationGate}>
            <div><span>Nouveaux éléments</span><strong>{syncNew}</strong></div>
            <div><span>Inchangés</span><strong>{syncUnchanged}</strong></div>
            <div><span>Conflits</span><strong>{syncConflicts}</strong></div>
            <div><span>Suppressions potentielles</span><strong>{syncDeletes}</strong></div>
          </div>

          <div className={styles.readinessCard}>
            <div>
              <p className={styles.eyebrow}>DÉCISION BACKEND</p>
              <h3>{sync.canPublish ? "Publication autorisée" : "Publication bloquée"}</h3>
              <p>{sync.reason || "Aucun conflit ni suppression potentielle ne bloque la publication."}</p>
            </div>
            <strong>{sync.canPublish ? "GO" : "STOP"}</strong>
          </div>

          {conflictRows.length ? (
            <div style={{ marginTop: 16 }}>
              <div className={styles.sectionHeading}>
                <div><p className={styles.eyebrow}>CONFLITS</p><h2>Éléments à examiner</h2></div>
                <p>{conflictRows.length} conflit(s) détaillé(s)</p>
              </div>
              <div className={styles.controlList}>
                {conflictRows.slice(0, 20).map((item, index) => (
                  <article className={`${styles.controlItem} ${styles.control_warning}`} key={`conflict-${index}`}>
                    <div><span>!</span><strong>{stringValue(item.entity) || "Conflit"}</strong></div>
                    <p>Clé : {stringValue(item.naturalKey) || "non fournie"}</p>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.nextStepNotice}>
              <strong>Aucun conflit détaillé</strong>
              <p>La comparaison n’a retourné aucun conflit nécessitant un examen.</p>
            </div>
          )}

          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer", fontWeight: 900 }}>Afficher la réponse technique complète</summary>
            <div style={{ marginTop: 12 }}><JsonBlock value={sync.sync ?? sync} /></div>
          </details>

          <div className={styles.publicationActions}>
            <button type="button" onClick={generatePlan} disabled={!canPlan}>
              {phase === "planning" ? "Génération en cours…" : "Générer le plan de publication"}
            </button>
          </div>
        </section>
      ) : null}

      {plan ? (
        <section className={styles.publicationPanel}>
          <div className={styles.sectionHeading}>
            <div><p className={styles.eyebrow}>ÉTAPE 4</p><h2>Plan de publication</h2></div>
            <p>Aucune mise à jour ni suppression automatique.</p>
          </div>

          {planSections.length ? (
            <>
              <div className={styles.publicationGate}>
                <div><span>Sections actives</span><strong>{planSections.length}</strong></div>
                <div><span>Opérations prévues</span><strong>{planSections.reduce((sum, section) => sum + section.count, 0)}</strong></div>
                <div><span>Mises à jour</span><strong>Interdites</strong></div>
                <div><span>Suppressions</span><strong>Interdites</strong></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10, marginTop: 16 }}>
                {planSections.slice(0, 12).map((section) => (
                  <article className={styles.previewCard} key={section.name}>
                    <div className={styles.previewHeader}><h3>{section.name}</h3><span>{section.count}</span></div>
                    <p style={{ marginTop: 10 }}>{section.count} opération(s) prévue(s)</p>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className={styles.nextStepNotice}>
              <strong>Aucune opération détectée</strong>
              <p>Le plan ne contient aucune collection d’opérations exploitable.</p>
            </div>
          )}

          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer", fontWeight: 900 }}>Afficher le plan technique complet</summary>
            <div style={{ marginTop: 12 }}><JsonBlock value={plan.plan ?? plan} /></div>
          </details>

          <div className={styles.confirmationBox} style={{ marginTop: 16 }}>
            <label>
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              <span>Je confirme avoir examiné l’analyse, la comparaison Supabase et le plan de publication.</span>
            </label>
            <button type="button" onClick={publish} disabled={!canPublish}>
              {phase === "publishing" ? "Publication en cours…" : "Confirmer et publier"}
            </button>
          </div>

          {!backendCanPublish ? (
            <div className={styles.writeWarning}>
              <strong>Publication bloquée</strong>
              <p>Le backend n’autorise pas l’écriture tant que les conflits ou suppressions potentielles ne sont pas résolus.</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {execution ? (
        <section className={styles.publicationPanel}>
          <div className={styles.sectionHeading}>
            <div><p className={styles.eyebrow}>ÉTAPE 5</p><h2>Résultat de publication</h2></div>
            <p>Réponse transactionnelle du backend.</p>
          </div>
          <div className={styles.publicationResult}>
            <JsonBlock value={execution} />
          </div>
        </section>
      ) : null}

      <section className={styles.historyPanel}>
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>HISTORIQUE LOCAL</p><h2>Publications exécutées</h2></div>
          <p>Journal local distinct de l’historique transactionnel backend.</p>
        </div>
        <div className={styles.historyToolbar}>
          <div><span>Exécutions</span><strong>{history.length}</strong></div>
          <div className={styles.historyActions}>
            <button type="button" disabled={!history.length} onClick={() => {
              const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = "974-darts-ai-publication-history-v2.json";
              anchor.click();
              URL.revokeObjectURL(url);
            }}>Exporter le JSON</button>
            <button type="button" disabled={!history.length} onClick={() => saveHistory([])}>Vider l’historique</button>
          </div>
        </div>

        {history.length ? (
          <div className={styles.historyList}>
            {history.map((item) => (
              <article className={styles.historyItem} key={item.id}>
                <div className={styles.historyItemHeader}>
                  <div><span className={styles.historyMode}>Publication backend</span><strong>{item.fileName}</strong></div>
                  <time>{new Date(item.createdAt).toLocaleString("fr-FR")}</time>
                </div>
                <div className={styles.historyFooter}>
                  <code>{item.id}</code>
                  <button type="button" onClick={() => saveHistory(history.filter((entry) => entry.id !== item.id))}>Supprimer</button>
                </div>
              </article>
            ))}
          </div>
        ) : <div className={styles.historyEmpty}>Aucune publication enregistrée dans ce navigateur.</div>}
      </section>

      <section className={styles.bottomGrid}>
        <article><p className={styles.eyebrow}>UX</p><h3>Anomalies exploitables</h3><p>Regroupement, filtres, recherche et pagination.</p></article>
        <article><p className={styles.eyebrow}>BACKEND</p><h3>Connexion stable</h3><p>Les quatre routes de publication validées restent utilisées.</p></article>
        <article><p className={styles.eyebrow}>RETOUR</p><h3>Cockpit Administrateur</h3><Link href="/admin">Retour au cockpit →</Link></article>
      </section>
    </main>
  );
}
