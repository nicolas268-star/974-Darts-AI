"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarCheck2,
  CheckCircle2,
  GitBranch,
  RefreshCw,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import styles from "./control.module.css";

type Fixture = {
  resultId: string;
  round: string;
  home: string;
  away: string;
  playedOn: string | null;
  source: "DATABASE" | "NAKKA_OFFICIAL" | "UNCONFIRMED";
  nakkaEventId: string | null;
};

type SeasonReport = {
  year: number;
  status: "PASS" | "CHECK" | "PREPARED";
  catalogState: string;
  note: string;
  teams: { expected: number; observed: number; names: string[]; missing: string[]; unexpected: string[] };
  clubs: { expected: number; observed: number; names: string[] };
  encounters: { expected: number | null; observed: number };
  dates: { expected: number | null; confirmed: number; missing: number; timezone: string; fixtures: Fixture[] };
};

type QualityReport = {
  generatedAt: string;
  mode: "READ_ONLY";
  overallStatus: "PASS" | "CHECK";
  blockers: string[];
  seasons: SeasonReport[];
  teams: { duplicateCanonicalGroups: Array<{ canonical: string; records: Array<{ id: string; name: string }> }>; fournaiseConsolidated: boolean };
  identities: {
    players: number;
    active: number;
    merged: number;
    confirmedAliases: number;
    unresolvedPlayers: Array<{ id: string; name: string }>;
    conflictingAliases: unknown[];
    invalidMerges: unknown[];
    rule: string;
  };
  routes: Array<{ template: string; example: string; declared: boolean }>;
  seo: { canonicalOrigin: string; language: string; robots: string };
};

function dateFr(value: string | null) {
  if (!value) return "À confirmer";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function statusLabel(status: SeasonReport["status"]) {
  if (status === "PASS") return "Conforme";
  if (status === "PREPARED") return "Préparée";
  return "À contrôler";
}

export default function ControlQualityPage() {
  const [report, setReport] = useState<QualityReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/backend/api/v1/control/quality", {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setReport((await response.json()) as QualityReport);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Contrôle indisponible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>DMAIC · PHASE CONTROL</p>
          <h1>Contrôle des données</h1>
          <p>Une vérification en lecture seule avant toute publication : saisons, équipes, identités, dates et liens.</p>
        </div>
        <div className={styles.heroActions}>
          <span className={report?.overallStatus === "PASS" ? styles.good : styles.warn}>
            <ShieldCheck size={16} /> {report?.overallStatus === "PASS" ? "Contrôles conformes" : loading ? "Vérification…" : "Action requise"}
          </span>
          <button type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={17} className={loading ? styles.spinning : ""} /> Actualiser
          </button>
        </div>
      </header>

      {error ? <div className={styles.error}>Le backend de contrôle ne répond pas : {error}</div> : null}
      {report?.blockers.length ? (
        <section className={styles.blockers}>
          <strong>Points bloquants</strong>
          {report.blockers.map((item) => <p key={item}>{item}</p>)}
        </section>
      ) : null}

      <section className={styles.seasons} aria-label="Saisons contrôlées">
        {(report?.seasons ?? []).map((season) => (
          <article className={styles.seasonCard} key={season.year}>
            <div className={styles.cardHead}>
              <div><span>Saison</span><h2>{season.year}</h2></div>
              <strong className={season.status === "PASS" ? styles.good : season.status === "PREPARED" ? styles.prepared : styles.warn}>
                {statusLabel(season.status)}
              </strong>
            </div>
            <p>{season.note}</p>
            <div className={styles.metrics}>
              <div><UsersRound size={18} /><span>Équipes</span><strong>{season.teams.observed || season.teams.expected}/{season.teams.expected}</strong></div>
              <div><ShieldCheck size={18} /><span>Clubs</span><strong>{season.clubs.observed || season.clubs.expected}/{season.clubs.expected}</strong></div>
              <div><GitBranch size={18} /><span>Rencontres</span><strong>{season.encounters.observed}{season.encounters.expected !== null ? `/${season.encounters.expected}` : ""}</strong></div>
              <div><CalendarCheck2 size={18} /><span>Dates confirmées</span><strong>{season.dates.confirmed}{season.dates.expected !== null ? `/${season.dates.expected}` : ""}</strong></div>
            </div>
            <div className={styles.chips}>{season.teams.names.map((name) => <span key={name}>{name}</span>)}</div>
            {season.teams.missing.length ? <small>Manquantes : {season.teams.missing.join(", ")}</small> : null}
          </article>
        ))}
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <div className={styles.panelTitle}><UsersRound /><div><p>IDENTITÉS</p><h2>Un joueur, un identifiant</h2></div></div>
          <div className={styles.row}><span>Joueurs sources</span><strong>{report?.identities.players ?? "—"}</strong></div>
          <div className={styles.row}><span>Identités actives</span><strong>{report?.identities.active ?? "—"}</strong></div>
          <div className={styles.row}><span>Alias confirmés</span><strong>{report?.identities.confirmedAliases ?? "—"}</strong></div>
          <div className={styles.row}><span>Joueurs non rattachés</span><strong>{report?.identities.unresolvedPlayers.length ?? "—"}</strong></div>
          <p className={styles.note}>{report?.identities.rule}</p>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelTitle}><GitBranch /><div><p>ROUTES</p><h2>Liens dynamiques</h2></div></div>
          {(report?.routes ?? []).map((route) => (
            <div className={styles.route} key={route.template}>
              <CheckCircle2 size={15} /> <code>{route.template}</code>
            </div>
          ))}
          <p className={styles.note}>Ces routes sont aussi contrôlées dans le build avant déploiement.</p>
        </article>
      </section>

      {report?.seasons.find((season) => season.year === 2026)?.dates.fixtures.length ? (
        <section className={styles.panel}>
          <div className={styles.panelTitle}><CalendarCheck2 /><div><p>CALENDRIER OFFICIEL</p><h2>Les 30 rencontres 2026</h2></div></div>
          <div className={styles.fixtureTable}>
            <div className={styles.fixtureHeader}><span>Journée</span><span>Affiche</span><span>Date</span><span>Provenance</span></div>
            {report.seasons.find((season) => season.year === 2026)!.dates.fixtures.map((fixture) => (
              <div className={styles.fixtureRow} key={fixture.resultId}>
                <strong>{fixture.round}</strong>
                <span>{fixture.home} – {fixture.away}</span>
                <span>{dateFr(fixture.playedOn)}</span>
                <small>{fixture.source === "NAKKA_OFFICIAL" ? "Nakka officiel" : fixture.source === "DATABASE" ? "Base de données" : "À confirmer"}</small>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
