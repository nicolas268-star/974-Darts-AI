"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Crown,
  Flame,
  Network,
  ShieldAlert,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import type {
  PlayerNetworkResponse,
  PlayerRelationship,
} from "@/lib/player/network-types";

type ViewKey = "best" | "difficult" | "favorites" | "toughest";

const views: Array<{
  key: ViewKey;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: typeof Users;
}> = [
  {
    key: "best",
    label: "Meilleurs partenaires",
    eyebrow: "Synergies",
    title: "Meilleurs partenaires de duo",
    description: "Classement basé sur l’indice relationnel interne et la fiabilité Wilson.",
    icon: Crown,
  },
  {
    key: "difficult",
    label: "Partenaires difficiles",
    eyebrow: "Associations",
    title: "Duos les moins performants",
    description: "Associations observées avec les indices relationnels les plus faibles.",
    icon: AlertTriangle,
  },
  {
    key: "favorites",
    label: "Adversaires favoris",
    eyebrow: "Confrontations",
    title: "Adversaires les plus favorables",
    description: "Joueurs contre lesquels les résultats observés sont les plus solides.",
    icon: Target,
  },
  {
    key: "toughest",
    label: "Bêtes noires",
    eyebrow: "Difficulté",
    title: "Adversaires les plus difficiles",
    description: "Joueurs ayant posé le plus de difficultés dans les legs observés.",
    icon: ShieldAlert,
  },
];

const number = (value: number, digits = 1) =>
  new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

const sampleLabel = (status: PlayerRelationship["sample_status"]) => {
  if (status === "reliable") return "Échantillon fiable";
  if (status === "limited") return "Échantillon limité";
  return "À confirmer";
};

function RelationshipRow({
  item,
  playerId,
  isPartner,
}: {
  item: PlayerRelationship;
  playerId: string;
  isPartner: boolean;
}) {
  const href = isPartner
    ? `/duos/${playerId}/${item.player_id}`
    : `/players/${item.player_id}`;

  return (
    <Link
      href={href}
      className={`network-row network-tier-${item.tier}`}
      title={`${item.name} · ${item.matches_played} matchs · ${item.legs_won}/${item.legs_played} legs · ${number(item.win_rate)} % · Wilson ${number(item.wilson_lower_bound, 2)}`}
    >
      <span className="network-rank">#{item.rank}</span>
      <span className="network-avatar">{initials(item.name)}</span>
      <span className="network-person">
        <strong>{item.name}</strong>
        <small>{item.team ?? "Équipe non renseignée"}</small>
      </span>
      <span className="network-bar-zone">
        <span className="network-bar-track">
          <i
            className={`network-bar network-color-${item.color}`}
            style={{ width: `${Math.max(4, item.relationship_index)}%` }}
          />
        </span>
        <span className="network-bar-meta">
          <small>{item.matches_played} match{item.matches_played > 1 ? "s" : ""}</small>
          <small>{item.legs_won}/{item.legs_played} legs</small>
          <small>Wilson {number(item.wilson_lower_bound, 2)}</small>
        </span>
      </span>
      <span className="network-score">
        <strong>{number(item.relationship_index)}</strong>
        <small>indice</small>
      </span>
      <span className={`network-badge network-badge-${item.tier}`}>{item.badge}</span>
    </Link>
  );
}

function HighlightCard({
  title,
  item,
  icon: Icon,
  playerId,
  partner,
}: {
  title: string;
  item: PlayerRelationship | null;
  icon: typeof Crown;
  playerId: string;
  partner: boolean;
}) {
  if (!item) {
    return (
      <article className="network-highlight is-empty">
        <Icon size={19}/>
        <span>{title}</span>
        <strong>Non disponible</strong>
        <small>Données insuffisantes</small>
      </article>
    );
  }

  const href = partner
    ? `/duos/${playerId}/${item.player_id}`
    : `/players/${item.player_id}`;

  return (
    <Link href={href} className={`network-highlight network-highlight-${item.tier}`}>
      <Icon size={19}/>
      <span>{title}</span>
      <strong>{item.name}</strong>
      <small>{number(item.relationship_index)} · {item.badge}</small>
    </Link>
  );
}

export function PlayerNetwork({ data }: { data: PlayerNetworkResponse }) {
  const [activeView, setActiveView] = useState<ViewKey>("best");
  const [minimumLegs, setMinimumLegs] = useState(0);

  const source = useMemo(() => {
    if (activeView === "best") return data.best_partners;
    if (activeView === "difficult") return data.worst_partners;
    if (activeView === "favorites") return data.favorite_opponents;
    return data.toughest_opponents;
  }, [activeView, data]);

  const displayed = useMemo(
    () => source.filter((item) => item.legs_played >= minimumLegs).slice(0, 10),
    [source, minimumLegs],
  );

  const config = views.find((view) => view.key === activeView) ?? views[0];
  const ViewIcon = config.icon;
  const isPartner = activeView === "best" || activeView === "difficult";

  return (
    <section className="player-network-section">
      <div className="section-heading player-network-heading">
        <div>
          <span className="eyebrow"><Network size={14}/> Player Network</span>
          <h3>Réseau sportif du joueur</h3>
          <p>Relations calculées uniquement à partir des legs réellement observés.</p>
        </div>
        <span className="chart-chip">
          Données vérifiées
        </span>
      </div>

      <div className="network-highlight-grid">
        <HighlightCard
          title="Meilleur partenaire"
          item={data.highlights.best_partner}
          icon={Crown}
          playerId={data.player.id}
          partner
        />
        <HighlightCard
          title="Partenaire difficile"
          item={data.highlights.difficult_partner}
          icon={AlertTriangle}
          playerId={data.player.id}
          partner
        />
        <HighlightCard
          title="Adversaire favori"
          item={data.highlights.favorite_opponent}
          icon={Sparkles}
          playerId={data.player.id}
          partner={false}
        />
        <HighlightCard
          title="Bête noire"
          item={data.highlights.toughest_opponent}
          icon={Flame}
          playerId={data.player.id}
          partner={false}
        />
      </div>

      <article className="card network-chart-card">
        <div className="network-toolbar">
          <div className="network-tabs" role="tablist" aria-label="Vues du réseau joueur">
            {views.map((view) => (
              <button
                key={view.key}
                type="button"
                className={activeView === view.key ? "active" : ""}
                onClick={() => setActiveView(view.key)}
              >
                {view.label}
              </button>
            ))}
          </div>

          <label className="network-filter">
            <span>Minimum</span>
            <select
              value={minimumLegs}
              onChange={(event) => setMinimumLegs(Number(event.target.value))}
            >
              <option value={0}>Tous les échantillons</option>
              <option value={3}>3 legs minimum</option>
              <option value={5}>5 legs minimum</option>
              <option value={8}>8 legs minimum</option>
            </select>
          </label>
        </div>

        <div className="network-chart-title">
          <span className="network-title-icon"><ViewIcon size={21}/></span>
          <div>
            <span className="eyebrow">{config.eyebrow}</span>
            <h4>{config.title}</h4>
            <p>{config.description}</p>
          </div>
        </div>

        <div className="network-list">
          {displayed.length ? (
            displayed.map((item) => (
              <RelationshipRow
                key={`${activeView}-${item.player_id}`}
                item={item}
                playerId={data.player.id}
                isPartner={isPartner}
              />
            ))
          ) : (
            <div className="network-empty">
              <Users size={26}/>
              <strong>Aucune relation disponible</strong>
              <span>Réduis le seuil minimum ou attends davantage de matchs analysés.</span>
            </div>
          )}
        </div>

        <div className="network-methodology">
          <span>Indice interne 974 Darts AI</span>
          <small>
            Wilson, taux de victoire, volume observé et moyenne 3 fléchettes disponible.
            Les couleurs et percentiles sont des aides de lecture, pas des statistiques officielles.
          </small>
        </div>
      </article>
    </section>
  );
}
