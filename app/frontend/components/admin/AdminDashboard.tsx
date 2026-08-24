"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./AdminDashboardPremium.module.css";

type JsonRecord = Record<string, unknown>;
type CheckState = "checking" | "online" | "degraded" | "offline" | "unknown" | "planned";

type DashboardMetrics = {
  identities: number | null;
  aliases: number | null;
  merges: number | null;
  suggestions: number | null;
  veryHighSuggestions: number | null;
};

type ApiCheck = {
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  payload: JsonRecord | null;
  checkedAt: Date;
};

type ServiceItem = {
  key: string;
  label: string;
  description: string;
  state: CheckState;
  detail: string;
  latencyMs?: number | null;
};

type ActivityItem = {
  id: string;
  label: string;
  detail: string;
  timestamp: Date;
  state: CheckState;
};

type ChampionshipMetric = {
  key: string;
  label: string;
  value: number | null;
  state: CheckState;
  detail: string;
  href?: string;
};

type ReadinessItem = {
  key: string;
  label: string;
  state: CheckState;
  detail: string;
};

type RecommendationItem = {
  key: string;
  title: string;
  detail: string;
  priority: "high" | "medium" | "info";
  href?: string;
};

type AlertItem = {
  key: string;
  title: string;
  detail: string;
  severity: "critical" | "warning" | "info";
  source: string;
  href?: string;
};

type QuickActionItem = {
  key: string;
  label: string;
  description: string;
  href?: string;
  state: CheckState;
};

const EMPTY_METRICS: DashboardMetrics = {
  identities: null,
  aliases: null,
  merges: null,
  suggestions: null,
  veryHighSuggestions: null,
};

const API_BASE = "/api/admin/backend";

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object")
    : [];
}

function numberFrom(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

async function checkJson(path: string): Promise<ApiCheck> {
  const startedAt = performance.now();

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      credentials: "include",
    });

    const latencyMs = Math.round(performance.now() - startedAt);
    const checkedAt = new Date();

    if (!response.ok) {
      return { ok: false, status: response.status, latencyMs, payload: null, checkedAt };
    }

    const data: unknown = await response.json();

    return {
      ok: true,
      status: response.status,
      latencyMs,
      payload: data && typeof data === "object" ? (data as JsonRecord) : null,
      checkedAt,
    };
  } catch {
    return {
      ok: false,
      status: null,
      latencyMs: Math.round(performance.now() - startedAt),
      payload: null,
      checkedAt: new Date(),
    };
  }
}

function extractIdentityMetrics(
  payload: JsonRecord | null,
): Pick<DashboardMetrics, "identities" | "aliases" | "merges"> {
  if (!payload) return { identities: null, aliases: null, merges: null };

  const meta = (payload.meta && typeof payload.meta === "object" ? payload.meta : {}) as JsonRecord;
  const stats = (payload.stats && typeof payload.stats === "object" ? payload.stats : {}) as JsonRecord;
  const kpis = (payload.kpis && typeof payload.kpis === "object" ? payload.kpis : {}) as JsonRecord;
  const identitiesList = asArray(payload.identities ?? payload.items ?? payload.data);

  return {
    identities: numberFrom(
      kpis.identities_total,
      payload.identities_count,
      payload.identity_count,
      stats.identities,
      meta.count,
      identitiesList.length || null,
    ),
    aliases: numberFrom(
      kpis.aliases_total,
      payload.aliases_count,
      payload.alias_count,
      stats.aliases,
      meta.aliases_count,
    ),
    merges: numberFrom(
      kpis.merges_total,
      payload.merges_count,
      payload.merge_count,
      stats.merges,
      meta.merges_count,
    ),
  };
}

function extractSuggestionMetrics(
  payload: JsonRecord | null,
): Pick<DashboardMetrics, "suggestions" | "veryHighSuggestions"> {
  if (!payload) return { suggestions: null, veryHighSuggestions: null };

  const suggestions = asArray(payload.suggestions ?? payload.items ?? payload.data);
  const meta = (payload.meta && typeof payload.meta === "object" ? payload.meta : {}) as JsonRecord;
  const veryHigh = suggestions.filter((item) => {
    const score = numberFrom(item.score) ?? 0;
    return item.level === "very_high" || score >= 95;
  }).length;

  return {
    suggestions: numberFrom(payload.count, meta.count, suggestions.length),
    veryHighSuggestions: numberFrom(payload.very_high_count, meta.very_high_count, veryHigh),
  };
}

function Metric({ label, value, hint }: { label: string; value: number | null; hint: string }) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
      <small>{hint}</small>
    </div>
  );
}

function stateLabel(state: CheckState) {
  if (state === "checking") return "Vérification";
  if (state === "online") return "En ligne";
  if (state === "degraded") return "Dégradé";
  if (state === "offline") return "Hors ligne";
  if (state === "planned") return "Planifié";
  return "Non vérifiable";
}

function ServiceCard({ service }: { service: ServiceItem }) {
  return (
    <article className={styles.serviceCard}>
      <div className={styles.serviceHeader}>
        <div>
          <span className={`${styles.serviceDot} ${styles[`dot_${service.state}`]}`} />
          <strong>{service.label}</strong>
        </div>
        <span className={`${styles.serviceState} ${styles[`state_${service.state}`]}`}>
          {stateLabel(service.state)}
        </span>
      </div>
      <p>{service.description}</p>
      <div className={styles.serviceFooter}>
        <small>{service.detail}</small>
        {typeof service.latencyMs === "number" ? <small>{service.latencyMs} ms</small> : null}
      </div>
    </article>
  );
}

function ChampionshipCard({ item }: { item: ChampionshipMetric }) {
  const content = (
    <>
      <div className={styles.championshipHeader}>
        <span className={`${styles.serviceDot} ${styles[`dot_${item.state}`]}`} />
        <strong>{item.label}</strong>
      </div>
      <div className={styles.championshipValue}>{item.value ?? "—"}</div>
      <p>{item.detail}</p>
      <span className={`${styles.serviceState} ${styles[`state_${item.state}`]}`}>
        {stateLabel(item.state)}
      </span>
    </>
  );

  if (item.href) {
    return (
      <Link className={styles.championshipCard} href={item.href}>
        {content}
      </Link>
    );
  }

  return <article className={styles.championshipCard}>{content}</article>;
}

function ReadinessCard({ item }: { item: ReadinessItem }) {
  return (
    <article className={styles.readinessCard}>
      <div className={styles.readinessHeader}>
        <span className={`${styles.serviceDot} ${styles[`dot_${item.state}`]}`} />
        <strong>{item.label}</strong>
      </div>
      <span className={`${styles.serviceState} ${styles[`state_${item.state}`]}`}>
        {stateLabel(item.state)}
      </span>
      <p>{item.detail}</p>
    </article>
  );
}

function RecommendationCard({ item }: { item: RecommendationItem }) {
  const content = (
    <>
      <div className={styles.recommendationHeader}>
        <span className={`${styles.priorityBadge} ${styles[`priority_${item.priority}`]}`}>
          {item.priority === "high" ? "Prioritaire" : item.priority === "medium" ? "À vérifier" : "Information"}
        </span>
        <strong>{item.title}</strong>
      </div>
      <p>{item.detail}</p>
      {item.href ? <span className={styles.recommendationAction}>Ouvrir →</span> : null}
    </>
  );

  if (item.href) {
    return (
      <Link className={styles.recommendationCard} href={item.href}>
        {content}
      </Link>
    );
  }

  return <article className={styles.recommendationCard}>{content}</article>;
}

function AlertCard({ item }: { item: AlertItem }) {
  const content = (
    <>
      <div className={styles.alertHeader}>
        <span className={`${styles.alertBadge} ${styles[`alert_${item.severity}`]}`}>
          {item.severity === "critical" ? "Critique" : item.severity === "warning" ? "Attention" : "Information"}
        </span>
        <strong>{item.title}</strong>
      </div>
      <p>{item.detail}</p>
      <div className={styles.alertFooter}>
        <small>Source : {item.source}</small>
        {item.href ? <span>Ouvrir →</span> : null}
      </div>
    </>
  );

  if (item.href) {
    return (
      <Link className={styles.alertCard} href={item.href}>
        {content}
      </Link>
    );
  }

  return <article className={styles.alertCard}>{content}</article>;
}

function QuickActionCard({ item }: { item: QuickActionItem }) {
  const content = (
    <>
      <div className={styles.quickActionTop}>
        <strong>{item.label}</strong>
        <span className={`${styles.serviceState} ${styles[`state_${item.state}`]}`}>
          {stateLabel(item.state)}
        </span>
      </div>
      <p>{item.description}</p>
      <span className={styles.quickActionLink}>
        {item.href ? "Ouvrir →" : "Indisponible"}
      </span>
    </>
  );

  if (item.href) {
    return (
      <Link className={styles.quickActionCard} href={item.href}>
        {content}
      </Link>
    );
  }

  return <article className={`${styles.quickActionCard} ${styles.quickActionDisabled}`}>{content}</article>;
}

function ModuleCard({
  eyebrow,
  title,
  description,
  href,
  action,
  status,
  disabled = false,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  href?: string;
  action: string;
  status: string;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <article className={`${styles.moduleCard} ${disabled ? styles.disabledCard : ""}`}>
      <div className={styles.cardTop}>
        <div>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <span className={styles.cardStatus}>{status}</span>
      </div>
      <p className={styles.description}>{description}</p>
      {children ? <div className={styles.metrics}>{children}</div> : null}
      {disabled || !href ? (
        <div className={styles.cardActionDisabled} aria-disabled="true">
          {action}<span aria-hidden="true">—</span>
        </div>
      ) : (
        <Link className={styles.cardAction} href={href}>
          {action}<span aria-hidden="true">→</span>
        </Link>
      )}
    </article>
  );
}

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics>(EMPTY_METRICS);
  const [identityCheck, setIdentityCheck] = useState<ApiCheck | null>(null);
  const [suggestionCheck, setSuggestionCheck] = useState<ApiCheck | null>(null);
  const [nakkaCheck, setNakkaCheck] = useState<ApiCheck | null>(null);
  const [checking, setChecking] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const loadDashboard = useCallback(async () => {
    setChecking(true);

    const [identitiesResult, suggestionsResult, nakkaResult] = await Promise.all([
      checkJson("/api/v1/identities/hub-quality/dashboard"),
      checkJson("/api/v1/identities/suggestions/list"),
      checkJson("/api/v1/nakka-sync/status"),
    ]);

    setIdentityCheck(identitiesResult);
    setSuggestionCheck(suggestionsResult);
    setNakkaCheck(nakkaResult);

    setMetrics({
      ...EMPTY_METRICS,
      ...extractIdentityMetrics(identitiesResult.payload),
      ...extractSuggestionMetrics(suggestionsResult.payload),
    });

    const now = new Date();
    setLastRefresh(now);
    setActivity((current): ActivityItem[] =>
      [
        {
          id: `identity-${identitiesResult.checkedAt.getTime()}`,
          label: "Contrôle API Identity",
          detail: identitiesResult.ok
            ? `Réponse HTTP ${identitiesResult.status ?? 200} en ${identitiesResult.latencyMs ?? "—"} ms`
            : identitiesResult.status
              ? `Échec HTTP ${identitiesResult.status}`
              : "Connexion impossible",
          timestamp: identitiesResult.checkedAt,
          state: (identitiesResult.ok ? "online" : "offline") as CheckState,
        },
        {
          id: `assistant-${suggestionsResult.checkedAt.getTime()}`,
          label: "Contrôle Assistant IA",
          detail: suggestionsResult.ok
            ? `Réponse HTTP ${suggestionsResult.status ?? 200} en ${suggestionsResult.latencyMs ?? "—"} ms`
            : suggestionsResult.status
              ? `Échec HTTP ${suggestionsResult.status}`
              : "Connexion impossible",
          timestamp: suggestionsResult.checkedAt,
          state: (suggestionsResult.ok ? "online" : "offline") as CheckState,
        },
        {
          id: `nakka-${nakkaResult.checkedAt.getTime()}`,
          label: "Contrôle Agent Nakka",
          detail: nakkaResult.ok
            ? `Réponse HTTP ${nakkaResult.status ?? 200} en ${nakkaResult.latencyMs ?? "—"} ms`
            : nakkaResult.status
              ? `Échec HTTP ${nakkaResult.status}`
              : "Connexion impossible",
          timestamp: nakkaResult.checkedAt,
          state: (nakkaResult.ok ? "online" : "offline") as CheckState,
        },
        {
          id: `refresh-${now.getTime()}`,
          label: "Cockpit actualisé",
          detail: "Les indicateurs visibles ont été recalculés à partir des API existantes.",
          timestamp: now,
          state: (
            identitiesResult.ok || suggestionsResult.ok || nakkaResult.ok
              ? "online"
              : "degraded"
          ) as CheckState,
        },
        ...current,
      ].slice(0, 8),
    );

    setChecking(false);
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const backendOnline = Boolean(identityCheck?.ok || suggestionCheck?.ok || nakkaCheck?.ok);
  const backendState: CheckState = checking
    ? "checking"
    : identityCheck?.ok && suggestionCheck?.ok && nakkaCheck?.ok
      ? "online"
      : backendOnline
        ? "degraded"
        : "offline";

  const refreshLabel = useMemo(() => {
    if (!lastRefresh) return "Pas encore actualisé";
    return `Actualisé à ${lastRefresh.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }, [lastRefresh]);

  const services: ServiceItem[] = [
    {
      key: "backend",
      label: "Backend FastAPI",
      description: "Disponibilité vérifiée sur les API Identity, Suggestions et Agent Nakka.",
      state: backendState,
      detail:
        backendState === "online"
          ? "Les trois API répondent."
          : backendState === "degraded"
            ? "Au moins une API répond."
            : backendState === "checking"
              ? "Tests en cours."
              : "Aucune des trois API ne répond.",
      latencyMs:
        Math.max(
          identityCheck?.latencyMs ?? 0,
          suggestionCheck?.latencyMs ?? 0,
          nakkaCheck?.latencyMs ?? 0,
        ) || null,
    },
    {
      key: "identity",
      label: "API Identity",
      description: "Référentiel des identités canoniques, alias et fusions.",
      state: checking ? "checking" : identityCheck?.ok ? "online" : "offline",
      detail: identityCheck?.ok
        ? `HTTP ${identityCheck.status ?? 200}`
        : identityCheck?.status
          ? `HTTP ${identityCheck.status}`
          : "Connexion impossible",
      latencyMs: identityCheck?.latencyMs ?? null,
    },
    {
      key: "assistant",
      label: "Assistant IA",
      description: "Suggestions de rapprochement soumises à validation humaine.",
      state: checking ? "checking" : suggestionCheck?.ok ? "online" : "offline",
      detail: suggestionCheck?.ok
        ? `HTTP ${suggestionCheck.status ?? 200}`
        : suggestionCheck?.status
          ? `HTTP ${suggestionCheck.status}`
          : "Connexion impossible",
      latencyMs: suggestionCheck?.latencyMs ?? null,
    },
    {
      key: "supabase",
      label: "Base Supabase",
      description: "Aucun endpoint de diagnostic dédié n’est exposé au frontend.",
      state: "unknown",
      detail: "Statut non déduit pour éviter un faux positif.",
    },
    {
      key: "auth",
      label: "Authentification",
      description: "Aucun contrôle de session fiable n’est disponible dans ce module.",
      state: "unknown",
      detail: "Contrôle différé au module Droits & accès.",
    },
    {
      key: "nakka",
      label: "Agent Nakka",
      description: "Collecte et contrôle sécurisé du portail officiel Nakka.",
      state: checking ? "checking" : nakkaCheck?.ok ? "online" : "offline",
      detail: nakkaCheck?.ok
        ? `HTTP ${nakkaCheck.status ?? 200}`
        : nakkaCheck?.status
          ? `HTTP ${nakkaCheck.status}`
          : "Connexion impossible",
      latencyMs: nakkaCheck?.latencyMs ?? null,
    },
  ];

  const championshipMetrics: ChampionshipMetric[] = [
    {
      key: "players",
      label: "Joueurs",
      value: null,
      state: "unknown",
      detail: "Aucun endpoint de comptage joueur n’est encore raccordé au cockpit.",
      href: "/players",
    },
    {
      key: "teams",
      label: "Équipes",
      value: null,
      state: "unknown",
      detail: "La route frontend existe, mais aucun total fiable n’est déduit ici.",
      href: "/teams",
    },
    {
      key: "duos",
      label: "Duos",
      value: null,
      state: "unknown",
      detail: "Le module Duos est accessible sans comptage global exposé.",
      href: "/duos",
    },
    {
      key: "seasons",
      label: "Saisons",
      value: null,
      state: "unknown",
      detail: "Aucune API dédiée ne fournit encore le nombre de saisons.",
    },
    {
      key: "ranking",
      label: "Classement",
      value: null,
      state: "online",
      detail: "La page publique de classement est disponible.",
      href: "/",
    },
    {
      key: "identity-quality",
      label: "Qualité identité",
      value: metrics.identities,
      state: identityCheck?.ok ? "online" : "offline",
      detail: identityCheck?.ok
        ? "Référentiel identité accessible."
        : "Backend Identity requis.",
      href: "/admin/identities",
    },
  ];

  const readinessItems: ReadinessItem[] = [
    {
      key: "identity",
      label: "Identity Hub",
      state: identityCheck?.ok ? "online" : "offline",
      detail: identityCheck?.ok
        ? "Le référentiel identité répond."
        : "L’API Identity est indisponible.",
    },
    {
      key: "assistant",
      label: "Assistant IA",
      state: suggestionCheck?.ok ? "online" : "offline",
      detail: suggestionCheck?.ok
        ? `${metrics.suggestions ?? 0} suggestion(s) visible(s).`
        : "L’API Suggestions est indisponible.",
    },
    {
      key: "championship",
      label: "Championnat",
      state: "degraded",
      detail: "Les routes existent, mais plusieurs totaux restent non vérifiables.",
    },
    {
      key: "nakka-agent",
      label: "Agent Nakka",
      state: nakkaCheck?.ok ? "online" : "offline",
      detail: nakkaCheck?.ok
        ? "L’agent de collecte et de contrôle est disponible."
        : "L’API de l’Agent Nakka ne répond pas.",
    },
    {
      key: "control",
      label: "Contrôle qualité",
      state: "online",
      detail: "Les contrôles des saisons, identités, dates et routes sont disponibles.",
    },
    {
      key: "rules",
      label: "Règles",
      state: "online",
      detail: "La page des règles est disponible.",
    },
  ];

  const recommendations: RecommendationItem[] = [];

  if (!identityCheck?.ok) {
    recommendations.push({
      key: "identity-offline",
      title: "Rétablir l’API Identity",
      detail: "Le cockpit ne peut pas consolider les identités, alias et fusions tant que cette API ne répond pas.",
      priority: "high",
      href: "/admin/identities",
    });
  } else {
    recommendations.push({
      key: "identity-ready",
      title: "Référentiel identité disponible",
      detail: "L’Identity Hub est accessible et peut être utilisé pour les contrôles de consolidation.",
      priority: "info",
      href: "/admin/identities",
    });
  }

  if ((metrics.suggestions ?? 0) > 0) {
    recommendations.push({
      key: "review-suggestions",
      title: "Examiner les suggestions restantes",
      detail: `${metrics.suggestions ?? 0} suggestion(s) sont actuellement visibles, dont ${metrics.veryHighSuggestions ?? 0} à forte confiance.`,
      priority: (metrics.veryHighSuggestions ?? 0) > 0 ? "high" : "medium",
      href: "/admin/player-identities",
    });
  } else if (suggestionCheck?.ok) {
    recommendations.push({
      key: "no-suggestions",
      title: "Aucune suggestion en attente",
      detail: "L’Assistant IA répond mais ne retourne actuellement aucune suggestion à traiter.",
      priority: "info",
      href: "/admin/player-identities",
    });
  } else {
    recommendations.push({
      key: "assistant-offline",
      title: "Vérifier l’Assistant IA",
      detail: "L’API Suggestions ne répond pas au cockpit.",
      priority: "high",
      href: "/admin/player-identities",
    });
  }

  recommendations.push({
    key: "nakka-agent",
    title: nakkaCheck?.ok ? "Agent Nakka opérationnel" : "Vérifier l’Agent Nakka",
    detail: nakkaCheck?.ok
      ? "Le contrôle rapide ou approfondi du portail officiel peut être lancé."
      : "La route de contrôle Nakka ne répond pas au cockpit.",
    priority: nakkaCheck?.ok ? "info" : "high",
    href: "/admin/nakka-sync",
  });

  recommendations.push({
    key: "publication-center-ready",
    title: "Centre Publication installé",
    detail: "Le point d’entrée /admin/publication est disponible. Les fonctions Import, Contrôle, Prévisualisation et Publication seront raccordées dans les modules suivants.",
    priority: "info",
    href: "/admin/publication",
  });

  recommendations.push({
    key: "rules-available",
    title: "Règles de compétition disponibles",
    detail: "La gouvernance du championnat peut être consultée depuis le module Règles.",
    priority: "info",
    href: "/admin/rules",
  });

  const alerts: AlertItem[] = [];

  if (!identityCheck?.ok) {
    alerts.push({
      key: "identity-api-down",
      title: "API Identity indisponible",
      detail: identityCheck?.status
        ? `La route Identity répond avec le statut HTTP ${identityCheck.status}.`
        : "Le cockpit ne parvient pas à joindre la route Identity.",
      severity: "critical",
      source: "Contrôle API Identity",
      href: "/admin/identities",
    });
  }

  if (!suggestionCheck?.ok) {
    alerts.push({
      key: "assistant-api-down",
      title: "Assistant IA indisponible",
      detail: suggestionCheck?.status
        ? `La route Suggestions répond avec le statut HTTP ${suggestionCheck.status}.`
        : "Le cockpit ne parvient pas à joindre la route Suggestions.",
      severity: "critical",
      source: "Contrôle Assistant IA",
      href: "/admin/player-identities",
    });
  }

  if (!nakkaCheck?.ok) {
    alerts.push({
      key: "nakka-api-down",
      title: "Agent Nakka indisponible",
      detail: nakkaCheck?.status
        ? `La route de l’Agent Nakka répond avec le statut HTTP ${nakkaCheck.status}.`
        : "Le cockpit ne parvient pas à joindre la route de l’Agent Nakka.",
      severity: "critical",
      source: "Contrôle Agent Nakka",
      href: "/admin/nakka-sync",
    });
  }

  if ((metrics.veryHighSuggestions ?? 0) > 0) {
    alerts.push({
      key: "very-high-suggestions",
      title: "Suggestions à très forte confiance",
      detail: `${metrics.veryHighSuggestions ?? 0} suggestion(s) prioritaire(s) nécessitent une validation humaine.`,
      severity: "warning",
      source: "Assistant IA",
      href: "/admin/player-identities",
    });
  }

  if ((metrics.suggestions ?? 0) > 0 && (metrics.veryHighSuggestions ?? 0) === 0) {
    alerts.push({
      key: "pending-suggestions",
      title: "Suggestions en attente",
      detail: `${metrics.suggestions ?? 0} suggestion(s) restent à examiner.`,
      severity: "warning",
      source: "Assistant IA",
      href: "/admin/player-identities",
    });
  }

  alerts.push({
    key: "publication-center-ready",
    title: "Centre Publication installé",
    detail: "Le centre est accessible. Les opérations métier seront activées progressivement.",
    severity: "info",
    source: "Centre Publication",
    href: "/admin/publication",
  });

  alerts.push({
    key: "championship-partial",
    title: "Vue Championnat partielle",
    detail: "Les totaux Joueurs, Équipes, Duos et Saisons restent non vérifiables dans le cockpit.",
    severity: "info",
    source: "Championnat",
  });

  const criticalAlerts = alerts.filter((item) => item.severity === "critical").length;
  const warningAlerts = alerts.filter((item) => item.severity === "warning").length;
  const infoAlerts = alerts.filter((item) => item.severity === "info").length;

  const quickActions: QuickActionItem[] = [
    {
      key: "admin",
      label: "Dashboard Admin",
      description: "Revenir au cockpit administrateur.",
      href: "/admin",
      state: "online",
    },
    {
      key: "identity",
      label: "Identity Hub",
      description: "Consulter les identités, alias et fusions.",
      href: "/admin/identities",
      state: identityCheck?.ok ? "online" : "offline",
    },
    {
      key: "assistant",
      label: "Assistant IA",
      description: "Examiner les suggestions de rapprochement.",
      href: "/admin/player-identities",
      state: suggestionCheck?.ok ? "online" : "offline",
    },
    {
      key: "rules",
      label: "Règles",
      description: "Consulter les règles de compétition.",
      href: "/admin/rules",
      state: "online",
    },
    {
      key: "ranking",
      label: "Classement",
      description: "Ouvrir le classement public.",
      href: "/",
      state: "online",
    },
    {
      key: "players",
      label: "Joueurs",
      description: "Ouvrir la liste publique des joueurs.",
      href: "/players",
      state: "online",
    },
    {
      key: "teams",
      label: "Équipes",
      description: "Ouvrir la liste publique des équipes.",
      href: "/teams",
      state: "online",
    },
    {
      key: "duos",
      label: "Duos",
      description: "Ouvrir le module Duos.",
      href: "/duos",
      state: "online",
    },
    {
      key: "nakka-agent",
      label: "Agent Nakka",
      description: "Contrôler automatiquement le portail officiel Nakka.",
      href: "/admin/nakka-sync",
      state: nakkaCheck?.ok ? "online" : "offline",
    },
    {
      key: "publication",
      label: "Publication Nakka",
      description: "Ouvrir l’import Excel et la publication manuelle.",
      href: "/admin/publication",
      state: "online",
    },
  ];

  const installedModules = 10;
  const plannedModules = 0;
  const activeServices = [identityCheck?.ok, suggestionCheck?.ok, nakkaCheck?.ok, true].filter(Boolean).length;
  const availableApis = [identityCheck?.ok, suggestionCheck?.ok, nakkaCheck?.ok].filter(Boolean).length;

  return (
    <main className={styles.shell}>
      <nav className={styles.breadcrumb} aria-label="Fil d’Ariane">
        <span>974 Darts AI</span><span aria-hidden="true">/</span><strong>Administration</strong>
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroContent}>
          <p className={styles.kicker}>CENTRE DE CONTRÔLE</p>
          <h1>Cockpit Intelligent</h1>
          <p>Superviser la plateforme et accéder en un clic à tous les services disponibles.</p>
        </div>
        <div className={styles.heroAside}>
          <div className={`${styles.serviceBadge} ${styles[`badge_${backendState}`]}`}>
            <span className={styles.statusDot} />
            {stateLabel(backendState)}
          </div>
          <button className={styles.refreshButton} type="button" onClick={() => void loadDashboard()} disabled={checking}>
            {checking ? "Vérification…" : "Actualiser"}
          </button>
          <small>{refreshLabel}</small>
        </div>
      </header>

      <section className={styles.healthPanel} aria-labelledby="platform-health-title">
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>PLATEFORME</p><h2 id="platform-health-title">Santé de la plateforme</h2></div>
          <p>Les statuts proviennent uniquement de tests réellement exécutés.</p>
        </div>
        <div className={styles.serviceGrid}>
          {services.map((service) => <ServiceCard key={service.key} service={service} />)}
        </div>
      </section>

      <section className={styles.activityPanel} aria-labelledby="recent-activity-title">
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>ACTIVITÉ</p><h2 id="recent-activity-title">Activité récente</h2></div>
          <p>Journal de la session courante. Aucun événement métier historique n’est inventé.</p>
        </div>

        <div className={styles.activityLayout}>
          <div className={styles.timeline}>
            {activity.length ? (
              activity.map((item, index) => (
                <article className={styles.timelineItem} key={`${item.id}-${index}`}>
                  <span className={`${styles.timelineDot} ${styles[`dot_${item.state}`]}`} />
                  <div>
                    <div className={styles.timelineHeader}>
                      <strong>{item.label}</strong>
                      <time>{item.timestamp.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
                    </div>
                    <p>{item.detail}</p>
                  </div>
                </article>
              ))
            ) : (
              <div className={styles.emptyActivity}>Aucune activité observée dans cette session.</div>
            )}
          </div>

          <aside className={styles.businessActivity}>
            <p className={styles.eyebrow}>ACTIVITÉ MÉTIER</p>
            <h3>Historique non disponible</h3>
            <p>
              Les dernières fusions, créations d’identité, modifications de règles,
              imports et publications nécessitent des endpoints dédiés.
            </p>
            <span>Aucune donnée fictive affichée</span>
          </aside>
        </div>
      </section>

      <section className={styles.championshipPanel} aria-labelledby="championship-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>DONNÉES</p>
            <h2 id="championship-title">Vue Championnat</h2>
          </div>
          <p>
            Les cartes indiquent uniquement les informations réellement disponibles.
            Aucun total joueur, équipe, duo ou saison n’est inventé.
          </p>
        </div>

        <div className={styles.championshipSummary}>
          <span>Classement disponible</span>
          <span>Identité supervisée</span>
          <span>Joueurs non comptés</span>
          <span>Équipes non comptées</span>
          <span>Duos non comptés</span>
          <span>Saisons non comptées</span>
        </div>

        <div className={styles.championshipGrid}>
          {championshipMetrics.map((item) => (
            <ChampionshipCard key={item.key} item={item} />
          ))}
        </div>
      </section>

      <section className={styles.analysisPanel} aria-labelledby="analysis-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>IA & ANALYSE</p>
            <h2 id="analysis-title">IA & Analyse</h2>
          </div>
          <p>
            Les recommandations et états ci-dessous sont déduits uniquement des
            API déjà interrogées et des services réellement disponibles.
          </p>
        </div>

        <div className={styles.analysisLayout}>
          <div>
            <h3 className={styles.analysisSubTitle}>État des services</h3>
            <div className={styles.readinessGrid}>
              {readinessItems.map((item) => (
                <ReadinessCard key={item.key} item={item} />
              ))}
            </div>
          </div>

          <div>
            <h3 className={styles.analysisSubTitle}>Recommandations</h3>
            <div className={styles.recommendationList}>
              {recommendations.map((item) => (
                <RecommendationCard key={item.key} item={item} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.alertPanel} aria-labelledby="alerts-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>GOUVERNANCE</p>
            <h2 id="alerts-title">Alertes intelligentes</h2>
          </div>
          <p>
            Les alertes sont générées uniquement à partir d’états mesurés,
            d’API réellement interrogées et de services explicitement non disponibles.
          </p>
        </div>

        <div className={styles.alertSummary}>
          <div>
            <span>Critiques</span>
            <strong>{criticalAlerts}</strong>
          </div>
          <div>
            <span>Attention</span>
            <strong>{warningAlerts}</strong>
          </div>
          <div>
            <span>Information</span>
            <strong>{infoAlerts}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>{alerts.length}</strong>
          </div>
        </div>

        <div className={styles.alertGrid}>
          {alerts.map((item) => (
            <AlertCard key={item.key} item={item} />
          ))}
        </div>
      </section>

      <section className={styles.quickActionsPanel} aria-labelledby="quick-actions-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>RACCOURCIS</p>
            <h2 id="quick-actions-title">Actions rapides Premium</h2>
          </div>
          <p>
            Tous les raccourcis ci-dessous pointent uniquement vers des routes
            réellement présentes dans le frontend.
          </p>
        </div>

        <div className={styles.quickActionGrid}>
          {quickActions.map((item) => (
            <QuickActionCard key={item.key} item={item} />
          ))}
        </div>

        <div className={styles.cockpitSummary}>
          <div>
            <span>Services disponibles</span>
            <strong>{installedModules}</strong>
          </div>
          <div>
            <span>Services à venir</span>
            <strong>{plannedModules}</strong>
          </div>
          <div>
            <span>Services actifs</span>
            <strong>{activeServices}</strong>
          </div>
          <div>
            <span>API disponibles</span>
            <strong>{availableApis}/3</strong>
          </div>
          <div>
            <span>Mode de contrôle</span>
            <strong>Actif</strong>
          </div>
        </div>
      </section>

      <section className={styles.overview} aria-label="Vue d’ensemble">
        <Metric label="Identités" value={metrics.identities} hint="Identités canoniques" />
        <Metric label="Alias" value={metrics.aliases} hint="Variantes rattachées" />
        <Metric label="Fusions" value={metrics.merges} hint="Consolidations validées" />
        <Metric label="Suggestions" value={metrics.suggestions} hint="À examiner" />
        <Metric label="Très fiables" value={metrics.veryHighSuggestions} hint="Confiance élevée" />
      </section>

      <section className={styles.grid} aria-label="Services d’administration">
        <ModuleCard eyebrow="QUALITÉ" title="Contrôle des données" description="Vérifier automatiquement les équipes, clubs, identités, dates officielles et routes dynamiques." href="/admin/control" action="Ouvrir le contrôle" status="Disponible" />
        <ModuleCard eyebrow="AGENT" title="Agent Nakka" description="Collecter et contrôler automatiquement les rencontres du portail officiel Nakka." href="/admin/nakka-sync" action="Ouvrir l’agent" status={nakkaCheck?.ok ? "Disponible" : "Backend requis"} />
        <ModuleCard eyebrow="DONNÉES" title="Publication Nakka" description="Accéder au centre de publication et au pipeline de contrôle Nakka." href="/admin/publication" action="Ouvrir la publication" status="Disponible" />
        <ModuleCard eyebrow="IDENTITÉS" title="Identity Hub" description="Rechercher les identités canoniques, consulter les alias et suivre les fusions." href="/admin/identities" action="Ouvrir le Hub" status={identityCheck?.ok ? "Disponible" : "Backend requis"}>
          <Metric label="Identités" value={metrics.identities} hint="Référentiel" />
          <Metric label="Alias" value={metrics.aliases} hint="Rattachements" />
          <Metric label="Fusions" value={metrics.merges} hint="Historique" />
        </ModuleCard>
        <ModuleCard eyebrow="ASSISTANT" title="Assistant de fusion" description="Examiner les rapprochements proposés. Aucune fusion n’est automatique." href="/admin/player-identities" action="Ouvrir l’assistant" status={suggestionCheck?.ok ? "Disponible" : "Backend requis"}>
          <Metric label="Suggestions" value={metrics.suggestions} hint="À traiter" />
          <Metric label="Très fiables" value={metrics.veryHighSuggestions} hint="Prioritaires" />
        </ModuleCard>
        <ModuleCard eyebrow="GOUVERNANCE" title="Règles & méthodes" description="Consulter les règles de compétition et les méthodes analytiques." href="/admin/rules" action="Voir les règles" status="Disponible" />
      </section>

      <section className={styles.bottomGrid}>
        <article className={styles.infoPanel}><p className={styles.eyebrow}>MÉTHODE</p><h3>Pas de faux événement</h3><p>Le journal conserve uniquement les contrôles réalisés depuis l’ouverture du cockpit.</p></article>
        <article className={styles.infoPanel}><p className={styles.eyebrow}>SÉCURITÉ</p><h3>Données brutes protégées</h3><p>Le référentiel d’identité consolide les références sans supprimer les données sources.</p></article>
        <article className={styles.infoPanel}><p className={styles.eyebrow}>ACCÈS RAPIDES</p><div className={styles.quickLinks}><Link href="/admin/control">Contrôle qualité</Link><Link href="/admin/nakka-sync">Agent Nakka</Link><Link href="/admin/identities">Identity Hub</Link><Link href="/admin/player-identities">Assistant IA</Link><Link href="/admin/rules">Règles</Link></div></article>
      </section>
    </main>
  );
}
