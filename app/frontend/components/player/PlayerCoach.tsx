"use client";
import Link from "next/link";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Dumbbell,
  Info,
  Lightbulb,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import type { CoachItem, PlayerCoachResponse } from "@/lib/player/coach-types";
const priorityLabel = {
  high: "Priorité haute",
  medium: "Priorité moyenne",
  low: "Priorité basse",
};
const evidenceValue = (value: string | number | null) =>
  value == null
    ? "—"
    : typeof value === "number"
      ? new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(
          value,
        )
      : value;
function CoachCard({
  item,
  type,
}: {
  item: CoachItem;
  type: "strength" | "development" | "recommendation";
}) {
  const Icon =
    type === "strength"
      ? CheckCircle2
      : type === "development"
        ? TrendingUp
        : Lightbulb;
  return (
    <article
      className={`coach-item coach-item-${type} coach-priority-${item.priority}`}
    >
      <div className="coach-item-icon">
        <Icon size={18} />
      </div>
      <div className="coach-item-body">
        <div className="coach-item-title-row">
          <strong>{item.title}</strong>
          <span>{priorityLabel[item.priority]}</span>
        </div>
        <p>{item.explanation}</p>
        <div className="coach-evidence">
          {item.evidence.map((e, i) => (
            <span key={`${item.key}-${i}`}>
              <small>{e.metric}</small>
              <strong>
                {evidenceValue(e.value)} {e.unit}
              </strong>
            </span>
          ))}
        </div>
      </div>
      <div className="coach-item-score">
        <strong>{item.score}</strong>
        <small>/100</small>
      </div>
    </article>
  );
}
export function PlayerCoach({ data }: { data: PlayerCoachResponse }) {
  return (
    <section className="player-coach-section">
      <div className="section-heading player-coach-heading">
        <div>
          <span className="eyebrow">
            <BrainCircuit size={14} /> IA Coach
          </span>
          <h3>Analyse explicable et recommandations</h3>
          <p>
            Interprétation interne fondée uniquement sur les données réellement
            observées.
          </p>
        </div>
        <span className="chart-chip">Données vérifiées</span>
      </div>
      <article className="card player-coach-hero">
        <div className="coach-orb">
          <BrainCircuit size={30} />
        </div>
        <div className="coach-hero-copy">
          <div className="coach-hero-badges">
            <span>
              <Sparkles size={13} /> {data.headline.style.label}
            </span>
            <span>
              <Target size={13} /> Domination {data.headline.dominance.score}
              /100
            </span>
            <span>
              <ShieldCheck size={13} /> {data.confidence.label}
            </span>
          </div>
          <h4>{data.player.name} — lecture du coach</h4>
          <p>{data.summary}</p>
        </div>
        <div className="coach-confidence">
          <span>Confiance</span>
          <strong>{data.confidence.score}</strong>
          <small>/100</small>
          <div>
            <i style={{ width: `${data.confidence.score}%` }} />
          </div>
        </div>
      </article>
      <div className="coach-columns">
        <article className="card coach-panel">
          <div className="coach-panel-title">
            <span className="coach-panel-icon is-strength">
              <CheckCircle2 size={18} />
            </span>
            <div>
              <span className="eyebrow">Forces</span>
              <h4>Ce qui fonctionne</h4>
            </div>
          </div>
          <div className="coach-item-list">
            {data.strengths.length ? (
              data.strengths.map((i) => (
                <CoachCard key={i.key} item={i} type="strength" />
              ))
            ) : (
              <div className="coach-empty">
                <Info size={20} />
                <span>Aucune force ne se détache encore nettement.</span>
              </div>
            )}
          </div>
        </article>
        <article className="card coach-panel">
          <div className="coach-panel-title">
            <span className="coach-panel-icon is-development">
              <TrendingUp size={18} />
            </span>
            <div>
              <span className="eyebrow">Progression</span>
              <h4>Axes à travailler</h4>
            </div>
          </div>
          <div className="coach-item-list">
            {data.development_areas.length ? (
              data.development_areas.map((i) => (
                <CoachCard key={i.key} item={i} type="development" />
              ))
            ) : (
              <div className="coach-empty">
                <CheckCircle2 size={20} />
                <span>Aucun axe prioritaire majeur détecté.</span>
              </div>
            )}
          </div>
        </article>
      </div>
      <div className="coach-bottom-grid">
        <article className="card coach-panel coach-recommendations">
          <div className="coach-panel-title">
            <span className="coach-panel-icon is-recommendation">
              <Dumbbell size={18} />
            </span>
            <div>
              <span className="eyebrow">Plan d’action</span>
              <h4>Conseils personnalisés</h4>
            </div>
          </div>
          <div className="coach-item-list">
            {data.recommendations.length ? (
              data.recommendations.map((i) => (
                <CoachCard key={i.key} item={i} type="recommendation" />
              ))
            ) : (
              <div className="coach-empty">
                <Lightbulb size={20} />
                <span>
                  Le volume actuel ne permet pas encore de proposer une priorité
                  fiable.
                </span>
              </div>
            )}
          </div>
        </article>
        <article className="card coach-relationships">
          <div className="coach-panel-title">
            <span className="coach-panel-icon is-network">
              <Users size={18} />
            </span>
            <div>
              <span className="eyebrow">Réseau</span>
              <h4>Conseils relationnels</h4>
            </div>
          </div>
          <div className="coach-relationship-list">
            {data.relationships.length ? (
              data.relationships.map((r) => {
                const href =
                  r.type !== "toughest_opponent"
                    ? `/duos/${data.player.id}/${r.player_id}`
                    : `/players/${r.player_id}`;
                return (
                  <Link
                    href={href}
                    key={`${r.type}-${r.player_id}`}
                    className="coach-relationship"
                  >
                    <div>
                      <span>{r.title}</span>
                      <strong>{r.name}</strong>
                      <p>{r.message}</p>
                      <small>
                        {r.legs_played} legs · Wilson {r.wilson_lower_bound}
                      </small>
                    </div>
                    <div className="coach-relationship-score">
                      <strong>{r.relationship_index}</strong>
                      <ChevronRight size={17} />
                    </div>
                  </Link>
                );
              })
            ) : (
              <div className="coach-empty">
                <Users size={20} />
                <span>Aucune relation exploitable avec le volume actuel.</span>
              </div>
            )}
          </div>
        </article>
      </div>
      <article className="coach-transparency">
        <AlertTriangle size={17} />
        <div>
          <strong>Coach explicable, sans données inventées</strong>
          <span>
            Ce moteur est déterministe et n’utilise pas de modèle externe. Il ne
            déduit aucune route de checkout, tentative de double ou précision
            aux doubles absente de Nakka.
          </span>
        </div>
      </article>
    </section>
  );
}
