"use client";

import { BadgeCheck, BriefcaseBusiness, History, Layers3, ShieldCheck, Users } from "lucide-react";
import type { PlayerCareerResponse } from "@/lib/player/identity-types";

const number = (value: number | null | undefined, digits = 1) =>
  value == null ? "—" : new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

export function PlayerCareer({ data }: { data: PlayerCareerResponse }) {
  return <section className="player-career-section">
    <div className="section-heading">
      <div>
        <span className="eyebrow"><History size={14}/> Carrière multi-équipe</span>
        <h3>{data.identity.canonical_display_name}</h3>
        <p>Une identité unique, tous les alias et toutes les équipes historiques.</p>
      </div>
      <span className="chart-chip">Données vérifiées</span>
    </div>

    <div className="career-kpi-grid">
      <article className="card"><span>Moyenne carrière</span><strong>{number(data.career.average_3_darts, 2)}</strong><small>{data.career.legs_played} legs compilés</small></article>
      <article className="card"><span>Taux de victoire</span><strong>{number(data.career.win_rate)} %</strong><small>{data.career.legs_won} legs gagnés</small></article>
      <article className="card"><span>Meilleur finish</span><strong>{data.career.best_finish ?? "—"}</strong><small>Toutes équipes confondues</small></article>
      <article className="card"><span>Identifiants reliés</span><strong>{data.source_player_ids.length}</strong><small>{data.aliases.length} alias confirmés</small></article>
    </div>

    <div className="career-layout">
      <article className="card career-panel">
        <div className="career-panel-title"><Layers3 size={19}/><div><span className="eyebrow">Équipes</span><h4>Performance par équipe</h4></div></div>
        <div className="career-team-list">
          {data.by_team.map((team) => <div className="career-team-row" key={team.team_id}>
            <div><strong>{team.team}</strong><small>{team.legs_played} legs</small></div>
            <span><small>Moyenne</small><strong>{number(team.average_3_darts, 2)}</strong></span>
            <span><small>Win rate</small><strong>{number(team.win_rate)} %</strong></span>
            <span><small>Best finish</small><strong>{team.best_finish ?? "—"}</strong></span>
          </div>)}
        </div>
      </article>

      <article className="card career-panel">
        <div className="career-panel-title"><Users size={19}/><div><span className="eyebrow">Identité</span><h4>Alias confirmés</h4></div></div>
        <div className="career-alias-list">
          {data.aliases.map((alias) => <span key={alias.id}><BadgeCheck size={14}/>{alias.alias_name}<small>{alias.source}</small></span>)}
        </div>
      </article>
    </div>

    <article className="card career-panel">
      <div className="career-panel-title"><BriefcaseBusiness size={19}/><div><span className="eyebrow">Historique</span><h4>Appartenances aux équipes</h4></div></div>
      <div className="career-membership-list">
        {data.memberships.map((membership) => <div key={membership.id}>
          <span className={membership.is_current ? "is-current" : ""}>{membership.is_current ? "Actuelle" : "Historique"}</span>
          <strong>{membership.team ?? "Équipe inconnue"}</strong>
          <small>{membership.season ?? "Toutes saisons"} · {membership.valid_from ?? "début inconnu"} → {membership.valid_to ?? "en cours"}</small>
        </div>)}
      </div>
    </article>

    <div className="career-safety"><ShieldCheck size={17}/><span>Les statistiques historiques restent rattachées au team_id réellement enregistré dans player_leg_stats. Aucun ancien résultat n’est réécrit lors d’un changement d’équipe.</span></div>
  </section>;
}
