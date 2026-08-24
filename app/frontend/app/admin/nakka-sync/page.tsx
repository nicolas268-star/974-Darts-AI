"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Database,
  FileCheck2,
  Globe2,
  Radar,
  Search,
  PlusCircle,
  CalendarClock,
  BellRing,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import "./nakka-sync.css";

type Issue = {
  level: "critical" | "warning" | "info";
  code: string;
  message: string;
  event_id?: string | null;
};

type EventView = {
  id: string;
  label: string;
  url?: string;
  status?: number | null;
  eventDate?: number | null;
  singlesMarker?: number | null;
  doublesMarker?: number | null;
};

type ModifiedEvent = {
  id: string;
  label: string;
  changedFields: string[];
  before: EventView;
  after: EventView;
};

type Comparison = {
  referenceAvailable: boolean;
  referenceAcceptedAt?: string | null;
  status: "UNCHANGED" | "REVIEW" | "BLOCKED";
  hasChanges: boolean;
  addedCount: number;
  modifiedCount: number;
  removedCount: number;
  unchangedCount: number;
  added: EventView[];
  modified: ModifiedEvent[];
  removed: EventView[];
  acceptBlocked: boolean;
  acceptBlockedReason?: string | null;
};

type Run = {
  collectedAt: string;
  leagueTitle: string;
  eventCount: number;
  status: "READY" | "CHECK" | "BLOCKED";
  issues: Issue[];
  snapshotHash: string;
  changedSinceLastRun?: boolean;
  comparison?: Comparison;
  publication: { executed: boolean; reason: string };
};

type State = {
  source: { season: number; url: string; active: boolean };
  reference?: {
    acceptedAt: string;
    acceptedBy: string;
    eventCount: number;
    snapshotHash: string;
  } | null;
  lastRun: Run | null;
  history: Array<{
    collectedAt: string;
    status: string;
    eventCount: number;
    snapshotHash: string;
  }>;
};

type WatchState = {
  version: number;
  watches: Array<{
    id: string; title: string; season: number; sourceUrl: string;
    eventDate: string; eventTime: string; status: string; active: boolean;
    nextCheckAt?: string | null; lastCheckAt?: string | null;
    attentionRequired: boolean;
    lastSummary?: { participants?: number; matches?: number; completeMatches?: number } | null;
  }>;
  history: Array<{ id: string; title: string; checkedAt: string; automatic: boolean; changed: boolean; participants: number; matches: number; status?: string }>;
};

const endpoint = "/api/admin/backend/api/v1/nakka-sync";
const defaultUrl =
  "https://n01darts.com/n01/league/portal.php?lgid=lg_QqGB_7154";

type RadarEvidence = {
  location: string;
  value: string;
  alias: string;
};

type RadarTeam = {
  id: string;
  name: string;
  evidence: RadarEvidence[];
};

type RadarEvent = {
  id: string;
  title: string;
  date?: number | null;
  status?: number | null;
  url: string;
};

type RadarDiscovery = {
  key: string;
  sourceType: "LEAGUE" | "TOURNAMENT";
  sourceId: string;
  parentTitle: string;
  title: string;
  date?: number | null;
  status?: number | null;
  url: string;
  matchedTeams: RadarTeam[];
  confidence: number;
  eventCount: number;
  events: RadarEvent[];
  alreadyTracked: boolean;
  decision: {
    action: "NEW" | "REVIEW" | "FOLLOW" | "IGNORE" | "TRACKED";
    decidedAt?: string | null;
    decidedBy?: string | null;
    reason?: string | null;
  };
};

type RadarState = {
  sourceHome?: string;
  teams: Array<{ id: string; name: string; aliases: string[] }>;
  lastScan?: {
    collectedAt: string;
    season: number;
    keyword: string;
    status: "READY" | "BLOCKED";
    scanned: {
      leaguePortals: number;
      leagueEvents: number;
      tournaments: number;
    };
    discoveries: RadarDiscovery[];
    issues: Array<{ level: string; code: string; message: string }>;
    publication: { executed: false; reason: string };
  } | null;
};

type DirectParticipant = {
  sourceId: string;
  name: string;
  identity: {
    status: "EXACT" | "UNRESOLVED" | "AMBIGUOUS";
    canonicalPlayerId?: string | null;
    canonicalName?: string | null;
    confidence: number;
  };
  matchesPlayed: number;
  matchesWon: number;
  legsPlayed: number;
  legsWon: number;
  average3Darts?: number | null;
  first9?: number | null;
  bestFinish?: number | null;
  scores180: number;
};

type DirectPreview = {
  collectedAt: string;
  sourceUrl: string;
  sourceId: string;
  season: number;
  title: string;
  date?: string | null;
  dateLabel?: string | null;
  status: "READY" | "REVIEW" | "BLOCKED";
  blockingReasons: string[];
  snapshotHash: string;
  imported?: boolean;
  importedTournamentCode?: string | null;
  identitySummary: { exact: number; unresolved: number; total: number };
  summary: {
    participants: number;
    matches: number;
    poolMatches?: number;
    knockoutMatches?: number;
    completeMatches: number;
    legs: number;
    scores180: number;
  };
  participants: DirectParticipant[];
};

type DirectState = {
  version: number;
  lastPreview?: DirectPreview | null;
  imports: Array<{
    importedAt: string;
    sourceId: string;
    title: string;
    tournamentCode: string;
  }>;
};

type IdentityCandidate = {
  player_id: string;
  display_name: string;
  canonical_player_id?: string | null;
  canonical_display_name?: string | null;
};

type IdentityEditor = {
  sourceId: string;
  aliasName: string;
};

const defaultDirectUrl =
  "https://n01darts.com/n01/league/season.php?id=t_XcWA_3292";

export default function NakkaSyncPage() {
  const [state, setState] = useState<State | null>(null);
  const [season, setSeason] = useState(2026);
  const [url, setUrl] = useState(defaultUrl);
  const [deep, setDeep] = useState(false);
  const [running, setRunning] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");
  const [radar, setRadar] = useState<RadarState | null>(null);
  const [radarSeason, setRadarSeason] = useState(2026);
  const [radarKeyword, setRadarKeyword] = useState("");
  const [scanLeague, setScanLeague] = useState(true);
  const [scanTournament, setScanTournament] = useState(true);
  const [radarMaxItems, setRadarMaxItems] = useState(30);
  const [radarRunning, setRadarRunning] = useState(false);
  const [decisionKey, setDecisionKey] = useState("");
  const [showIgnored, setShowIgnored] = useState(false);
  const [direct, setDirect] = useState<DirectState | null>(null);
  const [directSeason, setDirectSeason] = useState(2026);
  const [directUrl, setDirectUrl] = useState(defaultDirectUrl);
  const [directAnalyzing, setDirectAnalyzing] = useState(false);
  const [directImporting, setDirectImporting] = useState(false);
  const [directConfirmed, setDirectConfirmed] = useState(false);
  const [identityEditor, setIdentityEditor] = useState<IdentityEditor | null>(null);
  const [identityQuery, setIdentityQuery] = useState("");
  const [identityCandidates, setIdentityCandidates] = useState<IdentityCandidate[]>([]);
  const [selectedIdentity, setSelectedIdentity] = useState<IdentityCandidate | null>(null);
  const [identitySearching, setIdentitySearching] = useState(false);
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityNotice, setIdentityNotice] = useState("");
  const [watch, setWatch] = useState<WatchState | null>(null);
  const [watchTitle, setWatchTitle] = useState("Tournoi du 28 août");
  const [watchUrl, setWatchUrl] = useState("https://n01darts.com/n01/tournament/comp.php?id=t_M317_6772");
  const [watchDate, setWatchDate] = useState("2026-08-28");
  const [watchTime, setWatchTime] = useState("09:00");
  const [watchBusy, setWatchBusy] = useState("");

  async function load() {
    const response = await fetch(`${endpoint}/status`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? payload.detail ?? "État indisponible.");
    setState(payload);
    setSeason(payload.source?.season ?? 2026);
    setUrl(payload.source?.url ?? defaultUrl);
  }

  async function loadRadar() {
    const response = await fetch(`${endpoint}/radar/status`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? payload.detail ?? "Radar indisponible.");
    }
    setRadar(payload);
    setRadarSeason(payload.lastScan?.season ?? 2026);
  }

  async function loadDirect() {
    const response = await fetch(`${endpoint}/direct/status`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? payload.detail ?? "Import direct indisponible.");
    }
    setDirect(payload);
    if (payload.lastPreview?.sourceUrl) setDirectUrl(payload.lastPreview.sourceUrl);
    if (payload.lastPreview?.season) setDirectSeason(payload.lastPreview.season);
  }

  async function loadWatch() {
    const response = await fetch(`${endpoint}/watch/status`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? payload.detail ?? "Surveillance indisponible.");
    setWatch(payload);
  }

  useEffect(() => {
    void Promise.all([load(), loadRadar(), loadDirect(), loadWatch()]).catch((reason) =>
      setError(String(reason.message ?? reason)),
    );
  }, []);

  async function watchRequest(path: string, body: Record<string, unknown>) {
    setWatchBusy(path); setError("");
    try {
      const response = await fetch(`${endpoint}/watch/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail ?? payload.error ?? "Action impossible.");
      setWatch(payload);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setWatchBusy(""); }
  }

  async function run() {
    setRunning(true);
    setError("");
    try {
      const response = await fetch(`${endpoint}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          season,
          source_url: url,
          deep,
          max_deep_events: deep ? 12 : 0,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail ?? payload.error ?? "Collecte impossible.");
      }
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setRunning(false);
    }
  }

  async function acceptReference() {
    if (!last?.comparison || last.comparison.acceptBlocked) return;
    const message =
      "Valider ce contrôle comme nouvelle référence ?\n\n" +
      "Cette action ne publie rien sur le site et ne modifie aucune statistique. " +
      "Elle marque seulement les différences affichées comme vérifiées.";
    if (!window.confirm(message)) return;

    setAccepting(true);
    setError("");
    try {
      const response = await fetch(`${endpoint}/reference/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot_hash: last.snapshotHash,
          confirmed: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail ?? payload.error ?? "Validation impossible.");
      }
      setState(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setAccepting(false);
    }
  }

  async function runRadar() {
    const sourceTypes = [
      ...(scanLeague ? ["LEAGUE"] : []),
      ...(scanTournament ? ["TOURNAMENT"] : []),
    ];
    if (!sourceTypes.length) {
      setError("Sélectionne League, Tournament ou les deux.");
      return;
    }
    setRadarRunning(true);
    setError("");
    try {
      const response = await fetch(`${endpoint}/radar/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          season: radarSeason,
          keyword: radarKeyword,
          source_types: sourceTypes,
          max_items: radarMaxItems,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail ?? payload.error ?? "Recherche impossible.");
      }
      setRadar(payload);
      setShowIgnored(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setRadarRunning(false);
    }
  }

  async function decideRadar(discovery: RadarDiscovery, action: "FOLLOW" | "IGNORE") {
    const verb = action === "FOLLOW" ? "suivre" : "ignorer";
    const consequence =
      action === "FOLLOW"
        ? "Cette compétition sera conservée dans la veille des prochains contrôles."
        : "Cette compétition sera masquée de la liste principale, mais restera réversible.";
    if (
      !window.confirm(
        `Confirmer la décision de ${verb} « ${discovery.title} » ?\n\n` +
        `${consequence}\nAucune donnée ni statistique ne sera publiée ou modifiée.`,
      )
    ) {
      return;
    }
    setDecisionKey(discovery.key);
    setError("");
    try {
      const response = await fetch(`${endpoint}/radar/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discovery_key: discovery.key,
          action,
          confirmed: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail ?? payload.error ?? "Décision impossible.");
      }
      setRadar(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setDecisionKey("");
    }
  }

  async function analyzeDirect() {
    setDirectAnalyzing(true);
    setDirectConfirmed(false);
    setError("");
    try {
      const response = await fetch(`${endpoint}/direct/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season: directSeason, source_url: directUrl }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail ?? payload.error ?? "Analyse directe impossible.");
      }
      setDirect(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setDirectAnalyzing(false);
    }
  }

  async function importDirect() {
    const preview = direct?.lastPreview;
    if (!preview || !directConfirmed || preview.status === "BLOCKED") return;
    if (!window.confirm(
      `Importer « ${preview.title} » comme tournoi amical séparé ?\n\n` +
      "Cette action ne modifiera ni le classement officiel, ni les points, ni l’ELO.",
    )) return;
    setDirectImporting(true);
    setError("");
    try {
      const response = await fetch(`${endpoint}/direct/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot_hash: preview.snapshotHash,
          confirmed: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail ?? payload.error ?? "Import impossible.");
      }
      setDirect(payload);
      setDirectConfirmed(false);
      await loadRadar();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setDirectImporting(false);
    }
  }

  function openIdentityEditor(player: DirectParticipant) {
    setIdentityEditor({ sourceId: player.sourceId, aliasName: player.name });
    setIdentityQuery(player.name.split(/\s+/)[0] ?? player.name);
    setIdentityCandidates([]);
    setSelectedIdentity(null);
    setIdentityNotice("");
  }

  function closeIdentityEditor() {
    setIdentityEditor(null);
    setIdentityQuery("");
    setIdentityCandidates([]);
    setSelectedIdentity(null);
    setIdentityNotice("");
  }

  async function searchIdentities() {
    const query = identityQuery.trim();
    if (!query) return;
    setIdentitySearching(true);
    setIdentityNotice("");
    try {
      const response = await fetch(
        `${endpoint}/identity-candidates?query=${encodeURIComponent(query)}`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail ?? payload.error ?? "Recherche impossible.");
      }
      setIdentityCandidates(Array.isArray(payload) ? payload : []);
      if (!Array.isArray(payload) || payload.length === 0) {
        setIdentityNotice("Aucun joueur 974 trouvé. Essaie son prénom ou son nom court.");
      }
    } catch (reason) {
      setIdentityNotice(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIdentitySearching(false);
    }
  }

  async function confirmIdentityAlias() {
    if (!identityEditor || !selectedIdentity || !directPreview) return;
    const canonicalPlayerId =
      selectedIdentity.canonical_player_id ?? selectedIdentity.player_id;
    const canonicalName =
      selectedIdentity.canonical_display_name ?? selectedIdentity.display_name;
    if (!window.confirm(
      `Confirmer cette association ?\n\n${identityEditor.aliasName} (Nakka) → ${canonicalName} (974)\n\n` +
      "L’alias sera mémorisé pour les prochains imports. Aucune statistique du championnat ni aucun ELO ne sera modifié.",
    )) return;

    setIdentitySaving(true);
    setIdentityNotice("");
    try {
      const mergeResponse = await fetch(
        "/api/admin/backend/api/v1/identities/merge-aliases",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            canonical_player_id: canonicalPlayerId,
            source_player_ids: [],
            alias_names: [identityEditor.aliasName],
            notes: `Alias Nakka confirmé depuis ${directPreview.title} (${directPreview.sourceId}).`,
          }),
        },
      );
      const mergePayload = await mergeResponse.json();
      if (!mergeResponse.ok) {
        throw new Error(mergePayload.detail ?? mergePayload.error ?? "Association impossible.");
      }

      const wasImported = Boolean(directPreview.imported);
      const analyzeResponse = await fetch(`${endpoint}/direct/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season: directSeason, source_url: directUrl }),
      });
      const analyzed = await analyzeResponse.json();
      if (!analyzeResponse.ok) {
        throw new Error(analyzed.detail ?? analyzed.error ?? "Réanalyse impossible.");
      }

      if (wasImported && analyzed.lastPreview?.snapshotHash) {
        const importResponse = await fetch(`${endpoint}/direct/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            snapshot_hash: analyzed.lastPreview.snapshotHash,
            confirmed: true,
          }),
        });
        const imported = await importResponse.json();
        if (!importResponse.ok) {
          throw new Error(imported.detail ?? imported.error ?? "Actualisation du tournoi impossible.");
        }
        setDirect(imported);
      } else {
        setDirect(analyzed);
      }
      closeIdentityEditor();
    } catch (reason) {
      setIdentityNotice(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIdentitySaving(false);
    }
  }

  const last = state?.lastRun ?? null;
  const comparison = last?.comparison ?? null;
  const badge = useMemo(() => {
    if (!last) return "Jamais exécuté";
    if (last.status === "READY") return "Prêt";
    if (last.status === "CHECK") return "À vérifier";
    return "Bloqué";
  }, [last]);
  const radarDiscoveries = radar?.lastScan?.discoveries ?? [];
  const ignoredDiscoveries = radarDiscoveries.filter(
    (discovery) => discovery.decision.action === "IGNORE",
  );
  const visibleRadarDiscoveries = showIgnored
    ? radarDiscoveries
    : radarDiscoveries.filter((discovery) => discovery.decision.action !== "IGNORE");
  const directPreview = direct?.lastPreview ?? null;

  return (
    <main className="nakka-agent">
      <header className="nakka-hero">
        <div className="nakka-icon"><Bot size={32} /></div>
        <div>
          <span>AGENT NAKKA · SYNCHRONISATION OFFICIELLE</span>
          <h1>Agent Nakka</h1>
          <p>
            Inventorie les rencontres du championnat, détecte les changements et
            bloque les anomalies avant toute mise à jour.
          </p>
        </div>
        <aside><ShieldCheck size={17} /> Publication protégée</aside>
      </header>

      <section className="nakka-grid">
        <article className="nakka-card nakka-controls">
          <div className="nakka-title"><Database size={19} /><h2>Source officielle</h2></div>
          <label>
            Saison
            <input type="number" min={2020} max={2100} value={season}
              onChange={(event) => setSeason(Number(event.target.value))} />
          </label>
          <label>
            URL du portail Nakka
            <input value={url} onChange={(event) => setUrl(event.target.value)} />
          </label>
          <label className="nakka-check">
            <input type="checkbox" checked={deep}
              onChange={(event) => setDeep(event.target.checked)} />
            Contrôle approfondi des 12 premières rencontres
          </label>
          <button type="button" onClick={() => void run()} disabled={running}>
            <RefreshCw size={17} className={running ? "nakka-spin" : ""} />
            {running ? "Collecte Nakka en cours…" : "Lancer le contrôle"}
          </button>
          <small>
            Pour 2027, remplace simplement cette URL par celle du nouveau portail Nakka.
          </small>
        </article>

        <article className={`nakka-card nakka-status ${last?.status?.toLowerCase() ?? ""}`}>
          <div className="nakka-title">
            {last?.status === "BLOCKED" ? <AlertTriangle size={19} /> : <CheckCircle2 size={19} />}
            <h2>Dernier contrôle</h2>
          </div>
          <strong className="nakka-badge">{badge}</strong>
          <dl>
            <div><dt>Rencontres détectées</dt><dd>{last?.eventCount ?? "—"}</dd></div>
            <div><dt>Dernière collecte</dt><dd>{last ? new Date(last.collectedAt).toLocaleString("fr-FR") : "—"}</dd></div>
            <div>
              <dt>Écart avec la référence</dt>
              <dd>
                {!comparison
                  ? "Relancer le contrôle"
                  : comparison.hasChanges
                    ? "Oui"
                    : "Aucun"}
              </dd>
            </div>
          </dl>
          <p>{last?.publication.reason ?? "Aucune donnée n’a encore été collectée."}</p>
        </article>
      </section>

      {error && <div className="nakka-error">{error}</div>}

      <section className="nakka-card nakka-watch">
        <div className="nakka-radar-heading">
          <div className="nakka-title"><CalendarClock size={21} /><div><span>SURVEILLANCE AUTOMATIQUE</span><h2>Événements Nakka programmés</h2></div></div>
          <strong className="nakka-direct-protection"><ShieldCheck size={16} /> Validation humaine obligatoire</strong>
        </div>
        <p className="nakka-preview-note">L’Agent contrôle seul la page avant, pendant et après l’événement. Il ne publie jamais les joueurs ni les résultats sans ta confirmation.</p>
        <div className="nakka-watch-form">
          <label>Nom<input value={watchTitle} onChange={(e) => setWatchTitle(e.target.value)} /></label>
          <label>Date<input type="date" value={watchDate} onChange={(e) => setWatchDate(e.target.value)} /></label>
          <label>Heure prévue<input type="time" value={watchTime} onChange={(e) => setWatchTime(e.target.value)} /></label>
          <label className="nakka-watch-url">URL Nakka<input value={watchUrl} onChange={(e) => setWatchUrl(e.target.value)} /></label>
          <button type="button" disabled={!!watchBusy} onClick={() => void watchRequest("upsert", { title: watchTitle, season: Number(watchDate.slice(0, 4)), source_url: watchUrl, event_date: watchDate, event_time: watchTime, active: true })}><PlusCircle size={17} /> Programmer la surveillance</button>
        </div>
        <div className="nakka-watch-list">
          {(watch?.watches ?? []).map((item) => <article key={item.id} data-attention={item.attentionRequired}>
            <div><strong>{item.attentionRequired && <BellRing size={16} />} {item.title}</strong><span>{new Date(`${item.eventDate}T${item.eventTime}:00`).toLocaleString("fr-FR")}</span><small>Prochain contrôle : {item.nextCheckAt ? new Date(item.nextCheckAt).toLocaleString("fr-FR") : "terminé"}</small></div>
            <div className="nakka-watch-stats"><span>{item.lastSummary?.participants ?? 0} joueurs</span><span>{item.lastSummary?.matches ?? 0} matchs</span><b>{item.attentionRequired ? "À VÉRIFIER" : item.status}</b></div>
            <div className="nakka-watch-actions"><button disabled={!!watchBusy} onClick={() => void watchRequest("run", { id: item.id })}>Contrôler maintenant</button>{item.attentionRequired && <button onClick={() => void watchRequest("acknowledge", { id: item.id })}>Vu</button>}<button className="nakka-ignore" onClick={() => window.confirm("Supprimer cette surveillance ?") && void watchRequest("delete", { id: item.id, confirmed: true })}>Supprimer</button></div>
          </article>)}
          {!watch?.watches.length && <div className="nakka-no-change"><CalendarClock size={20} /><span>Aucune surveillance programmée.</span></div>}
        </div>
      </section>

      <section className="nakka-card nakka-direct">
        <div className="nakka-radar-heading">
          <div className="nakka-title">
            <FileCheck2 size={21} />
            <div>
              <span>IMPORT DIRECT · LIEN NAKKA</span>
              <h2>Importer un tournoi Nakka</h2>
            </div>
          </div>
          <strong className="nakka-direct-protection">
            <ShieldCheck size={16} /> Tournoi amical séparé
          </strong>
        </div>

        <p className="nakka-preview-note">
          Colle ici la page exacte du tournoi. Ce mode contourne seulement les
          filtres de découverte par titre ; le contrôle des résultats et la
          validation administrateur restent obligatoires.
        </p>

        <div className="nakka-direct-controls">
          <label>
            Saison
            <input
              type="number"
              min={2020}
              max={2100}
              value={directSeason}
              onChange={(event) => setDirectSeason(Number(event.target.value))}
            />
          </label>
          <label>
            URL directe du tournoi Nakka
            <input
              value={directUrl}
              onChange={(event) => setDirectUrl(event.target.value)}
              placeholder="https://n01darts.com/n01/league/season.php?id=t_..."
            />
          </label>
          <button
            type="button"
            onClick={() => void analyzeDirect()}
            disabled={directAnalyzing}
          >
            <Search size={17} className={directAnalyzing ? "nakka-spin" : ""} />
            {directAnalyzing ? "Analyse du tournoi…" : "Analyser le lien"}
          </button>
        </div>

        {directPreview && (
          <div className="nakka-direct-preview">
            <header>
              <div>
                <span>{directPreview.sourceId}</span>
                <h3>{directPreview.title}</h3>
                <p>{directPreview.dateLabel ?? "Date Nakka non renseignée"}</p>
              </div>
              <strong data-status={directPreview.status.toLowerCase()}>
                {directPreview.imported
                  ? `Importé · ${directPreview.importedTournamentCode}`
                  : directPreview.status === "BLOCKED"
                    ? "Import bloqué"
                    : directPreview.status === "REVIEW"
                      ? "Identités à confirmer"
                      : "Prêt à valider"}
              </strong>
            </header>

            <div className="nakka-direct-summary">
              <article><span>Joueurs</span><strong>{directPreview.summary.participants}</strong></article>
              <article><span>Poules</span><strong>{directPreview.summary.poolMatches ?? directPreview.summary.matches}</strong></article>
              <article><span>Élimination</span><strong>{directPreview.summary.knockoutMatches ?? 0}</strong></article>
              <article><span>Résultats complets</span><strong>{directPreview.summary.completeMatches}</strong></article>
              <article><span>Legs</span><strong>{directPreview.summary.legs}</strong></article>
              <article><span>180</span><strong>{directPreview.summary.scores180}</strong></article>
            </div>

            <div className="nakka-direct-table-wrap">
              <table className="nakka-direct-table">
                <thead>
                  <tr>
                    <th>Joueur Nakka</th><th>Identité 974</th><th>Matchs</th>
                    <th>Legs G/J</th><th>Moy.</th><th>First 9</th>
                    <th>Finish</th><th>180</th>
                  </tr>
                </thead>
                <tbody>
                  {directPreview.participants.map((player) => (
                    <Fragment key={player.sourceId}>
                      <tr>
                        <td><strong>{player.name}</strong></td>
                        <td>
                          <div className="nakka-identity-cell">
                            <span data-identity={player.identity.status.toLowerCase()}>
                              {player.identity.status === "EXACT"
                                ? player.identity.canonicalName
                                : "À confirmer"}
                            </span>
                            {player.identity.status !== "EXACT" && (
                              <button
                                type="button"
                                onClick={() => openIdentityEditor(player)}
                              >
                                Associer
                              </button>
                            )}
                          </div>
                        </td>
                        <td>{player.matchesWon}/{player.matchesPlayed}</td>
                        <td>{player.legsWon}/{player.legsPlayed}</td>
                        <td>{player.average3Darts?.toFixed(2) ?? "—"}</td>
                        <td>{player.first9?.toFixed(2) ?? "—"}</td>
                        <td>{player.bestFinish ?? "—"}</td>
                        <td>{player.scores180}</td>
                      </tr>
                      {identityEditor?.sourceId === player.sourceId && (
                        <tr className="nakka-identity-editor-row">
                          <td colSpan={8}>
                            <div className="nakka-identity-editor">
                              <div className="nakka-identity-editor-heading">
                                <div>
                                  <strong>Associer « {identityEditor.aliasName} »</strong>
                                  <p>Recherche un joueur 974, vérifie l’aperçu puis confirme.</p>
                                </div>
                                <button type="button" onClick={closeIdentityEditor}>Fermer</button>
                              </div>

                              <div className="nakka-identity-search">
                                <input
                                  value={identityQuery}
                                  onChange={(event) => setIdentityQuery(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") void searchIdentities();
                                  }}
                                  placeholder="Prénom ou nom du joueur 974"
                                />
                                <button
                                  type="button"
                                  onClick={() => void searchIdentities()}
                                  disabled={identitySearching || !identityQuery.trim()}
                                >
                                  <Search size={15} />
                                  {identitySearching ? "Recherche…" : "Rechercher"}
                                </button>
                              </div>

                              {!!identityCandidates.length && (
                                <div className="nakka-identity-candidates">
                                  {identityCandidates.map((candidate) => {
                                    const candidateId =
                                      candidate.canonical_player_id ?? candidate.player_id;
                                    const selectedId = selectedIdentity
                                      ? selectedIdentity.canonical_player_id ?? selectedIdentity.player_id
                                      : null;
                                    return (
                                      <button
                                        type="button"
                                        key={`${candidate.player_id}-${candidateId}`}
                                        data-selected={selectedId === candidateId}
                                        onClick={() => setSelectedIdentity(candidate)}
                                      >
                                        <strong>{candidate.canonical_display_name ?? candidate.display_name}</strong>
                                        {candidate.canonical_display_name &&
                                          candidate.canonical_display_name !== candidate.display_name && (
                                            <small>Profil actuel : {candidate.display_name}</small>
                                          )}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}

                              {selectedIdentity && (
                                <div className="nakka-identity-preview">
                                  <span>{identityEditor.aliasName} <small>Nakka</small></span>
                                  <b>→</b>
                                  <span>
                                    {selectedIdentity.canonical_display_name ?? selectedIdentity.display_name}
                                    {" "}<small>Joueur 974</small>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => void confirmIdentityAlias()}
                                    disabled={identitySaving}
                                  >
                                    <ShieldCheck size={15} />
                                    {identitySaving ? "Association…" : "Confirmer l’association"}
                                  </button>
                                </div>
                              )}

                              {identityNotice && <p className="nakka-identity-notice">{identityNotice}</p>}
                              <div className="nakka-identity-alternatives">
                                <button type="button" onClick={closeIdentityEditor}>Laisser à confirmer</button>
                                <a href="/admin/player-identities">
                                  Aucun profil ? Ouvrir le référentiel joueurs →
                                </a>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {!!directPreview.blockingReasons.length && (
              <div className="nakka-blocked-reason">
                <AlertTriangle size={18} /> {directPreview.blockingReasons.join(" · ")}
              </div>
            )}

            {!directPreview.imported && directPreview.status !== "BLOCKED" && (
              <div className="nakka-direct-validation">
                <label>
                  <input
                    type="checkbox"
                    checked={directConfirmed}
                    onChange={(event) => setDirectConfirmed(event.target.checked)}
                  />
                  Je confirme les joueurs et résultats affichés. Les identités
                  non reconnues resteront propres à ce tournoi amical.
                </label>
                <button
                  type="button"
                  onClick={() => void importDirect()}
                  disabled={!directConfirmed || directImporting}
                >
                  <ShieldCheck size={17} />
                  {directImporting ? "Import sécurisé…" : "Importer comme tournoi amical"}
                </button>
              </div>
            )}

            {directPreview.imported && directPreview.importedTournamentCode && (
              <a
                className="nakka-direct-open"
                href={`/tournaments/${directPreview.importedTournamentCode.toLowerCase()}`}
              >
                Ouvrir le tournoi {directPreview.importedTournamentCode} →
              </a>
            )}

            <div className="nakka-radar-safety">
              <ShieldCheck size={18} /> Aucun point, classement officiel ou ELO
              n’est modifié par cet import.
            </div>
          </div>
        )}
      </section>

      <section className="nakka-card nakka-radar">
        <div className="nakka-radar-heading">
          <div className="nakka-title">
            <Radar size={21} />
            <div>
              <span>VEILLE RÉUNION & CLUBS 974</span>
              <h2>Radar Nakka</h2>
            </div>
          </div>
          <a
            href={radar?.sourceHome ?? "https://n01darts.com/n01/"}
            target="_blank"
            rel="noreferrer"
          >
            <Globe2 size={16} /> Page d’accueil Nakka
          </a>
        </div>

        <p className="nakka-preview-note">
          Recherche les compétitions League et Tournament dont le titre cite
          La Réunion, le 974, Tampon Dart Club, PDC St-Leu, 3BC St-Paul,
          Kazadarts Saint-Pierre ou une équipe connue. Les tournois déjà
          enregistrés sont reconnus automatiquement.
        </p>

        <div className="nakka-radar-teams">
          {(radar?.teams ?? []).map((team) => (
            <span key={team.id}>{team.name}</span>
          ))}
        </div>

        <div className="nakka-radar-controls">
          <label>
            Saison
            <input
              type="number"
              min={2020}
              max={2100}
              value={radarSeason}
              onChange={(event) => setRadarSeason(Number(event.target.value))}
            />
          </label>
          <label>
            Filtre de titre facultatif
            <input
              value={radarKeyword}
              placeholder="Ex. Réunion, 974, Papangue…"
              onChange={(event) => setRadarKeyword(event.target.value)}
            />
          </label>
          <label>
            Fenêtre par source
            <select
              value={radarMaxItems}
              onChange={(event) => setRadarMaxItems(Number(event.target.value))}
            >
              <option value={15}>15 · contrôle rapide</option>
              <option value={30}>30 · recommandé</option>
              <option value={60}>60 · contrôle large</option>
              <option value={120}>120 · contrôle maximal</option>
            </select>
          </label>
          <div className="nakka-radar-sources">
            <label>
              <input
                type="checkbox"
                checked={scanLeague}
                onChange={(event) => setScanLeague(event.target.checked)}
              />
              League
            </label>
            <label>
              <input
                type="checkbox"
                checked={scanTournament}
                onChange={(event) => setScanTournament(event.target.checked)}
              />
              Tournament
            </label>
          </div>
          <button type="button" onClick={() => void runRadar()} disabled={radarRunning}>
            <Search size={17} className={radarRunning ? "nakka-spin" : ""} />
            {radarRunning ? "Recherche officielle en cours…" : "Rechercher les compétitions"}
          </button>
        </div>

        {radar?.lastScan && (
          <>
            <div className="nakka-radar-summary">
              <article>
                <span>Portails League</span>
                <strong>{radar.lastScan.scanned.leaguePortals}</strong>
              </article>
              <article>
                <span>Épreuves League</span>
                <strong>{radar.lastScan.scanned.leagueEvents}</strong>
              </article>
              <article>
                <span>Tournois inspectés</span>
                <strong>{radar.lastScan.scanned.tournaments}</strong>
              </article>
              <article>
                <span>Compétitions 974</span>
                <strong>{radarDiscoveries.length}</strong>
              </article>
            </div>

            <div className="nakka-radar-list-heading">
              <p>
                {visibleRadarDiscoveries.length} compétition(s) affichée(s)
                {ignoredDiscoveries.length > 0 && !showIgnored
                  ? ` · ${ignoredDiscoveries.length} ignorée(s) masquée(s)`
                  : ""}
              </p>
              {ignoredDiscoveries.length > 0 && (
                <button type="button" onClick={() => setShowIgnored((value) => !value)}>
                  {showIgnored
                    ? "Masquer les ignorées"
                    : `Afficher les ignorées (${ignoredDiscoveries.length})`}
                </button>
              )}
            </div>

            <div className="nakka-radar-results">
              {visibleRadarDiscoveries.map((discovery) => (
                <article
                  key={discovery.key}
                  data-decision={discovery.decision.action.toLowerCase()}
                >
                  <div className="nakka-radar-source">
                    <span>{discovery.sourceType}</span>
                    <strong>
                      {discovery.alreadyTracked ? "SUIVIE" : `${discovery.confidence}%`}
                    </strong>
                  </div>
                  <div className="nakka-radar-main">
                    <div>
                      <h3>{discovery.title}</h3>
                      <p>
                        {discovery.parentTitle}
                        {discovery.sourceType === "LEAGUE"
                          ? ` · ${discovery.eventCount} rencontres connues`
                          : discovery.alreadyTracked && discovery.eventCount > 1
                            ? ` · ${discovery.eventCount} matchs enregistrés`
                            : ""}
                      </p>
                    </div>
                    <div className="nakka-radar-matches">
                      {discovery.matchedTeams.map((team) => (
                        <span key={`${discovery.key}-${team.id}`}>{team.name}</span>
                      ))}
                    </div>
                    <small>
                      {discovery.matchedTeams
                        .flatMap((team) => team.evidence)
                        .slice(0, 2)
                        .map((item) => `${item.location} : ${item.value}`)
                        .join(" · ")}
                    </small>
                    {discovery.events.length > 0 && (
                      <details className="nakka-radar-events">
                        <summary>
                          Voir les {discovery.eventCount} rencontres détectées
                        </summary>
                        <ul>
                          {discovery.events.map((event) => (
                            <li key={event.id}>
                              <a href={event.url} target="_blank" rel="noreferrer">
                                {event.title}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                  <div className="nakka-radar-actions">
                    <a href={discovery.url} target="_blank" rel="noreferrer">
                      Vérifier sur Nakka
                    </a>
                    {discovery.alreadyTracked ? (
                      <span className="nakka-already-tracked">
                        <ShieldCheck size={15} /> Déjà suivie · aucune action requise
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => void decideRadar(discovery, "FOLLOW")}
                          disabled={decisionKey === discovery.key}
                        >
                          {discovery.decision.action === "FOLLOW" ? "Suivie ✓" : "Suivre"}
                        </button>
                        <button
                          type="button"
                          className="nakka-ignore"
                          onClick={() => void decideRadar(discovery, "IGNORE")}
                          disabled={decisionKey === discovery.key}
                        >
                          {discovery.decision.action === "IGNORE" ? "Ignorée ✓" : "Ignorer"}
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
              {!visibleRadarDiscoveries.length && (
                <div className="nakka-no-change">
                  <CheckCircle2 size={20} />
                  {ignoredDiscoveries.length
                    ? "Toutes les découvertes de cette recherche sont ignorées."
                    : "Aucun rapprochement d’équipe dans la fenêtre contrôlée."}
                </div>
              )}
            </div>

            {!!radar.lastScan.issues.length && (
              <div className="nakka-issues">
                {radar.lastScan.issues.map((issue, index) => (
                  <article key={`${issue.code}-${index}`} data-level={issue.level}>
                    <span>{issue.level}</span>
                    <div><strong>{issue.code}</strong><p>{issue.message}</p></div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}

        <div className="nakka-radar-safety">
          <ShieldCheck size={18} />
          Lecture seule : le championnat 2026 et les tournois déjà enregistrés
          ne demandent aucune action. Suivre prépare uniquement la veille d’une
          nouvelle compétition. Aucune ligne Excel, donnée Supabase ou
          statistique publique n’est modifiée.
        </div>
      </section>

      <section className="nakka-card nakka-preview">
        <div className="nakka-preview-heading">
          <div className="nakka-title">
            <FileCheck2 size={19} />
            <h2>Aperçu avant mise à jour</h2>
          </div>
          <span className={`nakka-review-badge ${comparison?.status?.toLowerCase() ?? ""}`}>
            {!comparison
              ? "Contrôle requis"
              : comparison.status === "UNCHANGED"
                ? "Référence à jour"
                : comparison.status === "BLOCKED"
                  ? "Suppression bloquée"
                  : "Validation requise"}
          </span>
        </div>

        <p className="nakka-preview-note">
          Comparaison avec la dernière référence validée. Aucune donnée du site,
          d’Excel ou de Supabase n’est modifiée depuis cet écran.
        </p>

        <div className="nakka-diff-summary">
          <article data-tone="added">
            <PlusCircle size={18} />
            <span>Ajoutées</span>
            <strong>{comparison?.addedCount ?? "—"}</strong>
          </article>
          <article data-tone="modified">
            <RefreshCw size={18} />
            <span>Modifiées</span>
            <strong>{comparison?.modifiedCount ?? "—"}</strong>
          </article>
          <article data-tone="removed">
            <AlertTriangle size={18} />
            <span>Disparues</span>
            <strong>{comparison?.removedCount ?? "—"}</strong>
          </article>
          <article data-tone="same">
            <CheckCircle2 size={18} />
            <span>Inchangées</span>
            <strong>{comparison?.unchangedCount ?? "—"}</strong>
          </article>
        </div>

        {comparison?.referenceAcceptedAt && (
          <p className="nakka-reference-date">
            Référence validée le{" "}
            <strong>
              {new Date(comparison.referenceAcceptedAt).toLocaleString("fr-FR")}
            </strong>
          </p>
        )}

        {!!comparison?.added.length && (
          <div className="nakka-diff-group" data-tone="added">
            <h3>Rencontres ajoutées</h3>
            {comparison.added.map((event) => (
              <article key={`added-${event.id}`}>
                <div><strong>{event.label}</strong><code>{event.id}</code></div>
                <span>Nouvelle rencontre</span>
              </article>
            ))}
          </div>
        )}

        {!!comparison?.modified.length && (
          <div className="nakka-diff-group" data-tone="modified">
            <h3>Rencontres modifiées</h3>
            {comparison.modified.map((event) => (
              <article key={`modified-${event.id}`}>
                <div><strong>{event.label}</strong><code>{event.id}</code></div>
                <span>{event.changedFields.join(", ")}</span>
              </article>
            ))}
          </div>
        )}

        {!!comparison?.removed.length && (
          <div className="nakka-diff-group" data-tone="removed">
            <h3>Rencontres disparues — action bloquée</h3>
            {comparison.removed.map((event) => (
              <article key={`removed-${event.id}`}>
                <div><strong>{event.label}</strong><code>{event.id}</code></div>
                <span>Vérification manuelle obligatoire</span>
              </article>
            ))}
          </div>
        )}

        {comparison && !comparison.hasChanges && (
          <div className="nakka-no-change">
            <CheckCircle2 size={20} />
            Aucun changement détecté depuis la référence validée.
          </div>
        )}

        {comparison?.acceptBlocked && (
          <div className="nakka-blocked-reason">
            <AlertTriangle size={18} />
            {comparison.acceptBlockedReason}
          </div>
        )}

        <div className="nakka-validation">
          <div>
            <strong>Validation administrateur</strong>
            <p>
              Cette validation actualise uniquement le point de comparaison.
              Elle ne publie pas les résultats sur le site.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void acceptReference()}
            disabled={
              accepting ||
              !comparison ||
              comparison.acceptBlocked ||
              !comparison.hasChanges
            }
          >
            <ShieldCheck size={17} />
            {accepting
              ? "Validation…"
              : comparison?.referenceAvailable
                ? "Valider comme référence"
                : "Créer la référence initiale"}
          </button>
        </div>
      </section>

      <section className="nakka-card">
        <div className="nakka-title"><AlertTriangle size={19} /><h2>Anomalies et protections</h2></div>
        {!last?.issues?.length && <p>Aucune anomalie signalée.</p>}
        <div className="nakka-issues">
          {(last?.issues ?? []).map((issue, index) => (
            <article key={`${issue.code}-${issue.event_id ?? index}`} data-level={issue.level}>
              <span>{issue.level}</span>
              <div><strong>{issue.code}</strong><p>{issue.message}</p></div>
              <code>{issue.event_id ?? ""}</code>
            </article>
          ))}
        </div>
      </section>

      <section className="nakka-card">
        <div className="nakka-title"><RefreshCw size={19} /><h2>Historique des contrôles</h2></div>
        <div className="nakka-history">
          {(state?.history ?? []).map((item) => (
            <div key={`${item.collectedAt}-${item.snapshotHash}`}>
              <time>{new Date(item.collectedAt).toLocaleString("fr-FR")}</time>
              <strong>{item.eventCount} rencontres</strong>
              <span>{item.status}</span>
            </div>
          ))}
          {!state?.history?.length && <p>Aucun contrôle enregistré.</p>}
        </div>
      </section>
    </main>
  );
}
