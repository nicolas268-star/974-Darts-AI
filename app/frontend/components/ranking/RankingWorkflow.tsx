"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  FileCheck2,
  History,
  Plus,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  type Detail,
  type EditData,
  type Event,
  type Metadata,
  type Options,
  type Revision,
  type Role,
  emptyRecognition,
  kinds,
  labels,
  places,
} from "./types";
import styles from "./RankingWorkflow.module.css";

const API = "/api/ranking-workflow";
const formatLabels: Record<string, string> = {
  SINGLE_ELIMINATION: "Élimination directe",
  DOUBLE_ELIMINATION: "Double élimination",
  POOLS: "Poules",
  POOLS_AND_KNOCKOUT: "Poules et tableau final",
};
const date = (value: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    ...(value.includes("T") ? { timeStyle: "short" as const } : {}),
    timeZone: "Indian/Reunion",
  }).format(new Date(value));
const localTime = (value: string | null) =>
  value
    ? new Date(new Date(value).getTime() + 4 * 3600_000)
        .toISOString()
        .slice(0, 16)
    : "";
const cleanMeta = (meta: Metadata): Metadata => ({
  title: meta.title,
  event_date: meta.event_date,
  kind: meta.kind,
  organizer: meta.organizer,
  source_url: meta.source_url,
  season_key: meta.season_key,
});
const blank = (): EditData => ({
  metadata: {
    title: "",
    event_date: "",
    kind: "CLUB_SINGLE",
    organizer: "",
    source_url: "",
    season_key: "2026-2027",
  },
  recognition: { ...emptyRecognition },
  results: [],
  director_id: null,
  reason: "",
});
function editData(revision: Revision): EditData {
  return {
    metadata: cleanMeta(revision.snapshot.metadata),
    recognition: { ...emptyRecognition, ...revision.snapshot.recognition },
    director_id: revision.director_id,
    reason: "",
    results: revision.snapshot.results.map((r) => ({
      source_ref: r.source_ref,
      identity_id: r.identity_id,
      player_name: r.player_name,
      gender: r.gender,
      placement: r.placement,
      eligibility: r.eligibility,
      reason: r.reason ?? "",
    })),
  };
}
async function api<T>(path: string, payload?: unknown): Promise<T> {
  const response = await fetch(`${API}/${path}`, {
    cache: "no-store",
    ...(payload
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Service indisponible.");
  return data;
}

export default function RankingWorkflow({
  role,
  enabled,
}: {
  role: Role;
  enabled: boolean;
}) {
  const admin = role === "ADMIN";
  const [events, setEvents] = useState<Event[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [options, setOptions] = useState<Options>({
    directors: [],
    identities: [],
    clubs: [],
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EditData | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [comment, setComment] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [historical, setHistorical] = useState<Revision | null>(null);
  const keys = useRef(new Map<string, string>());
  const requestKey = (payload: unknown) => {
    const text = JSON.stringify(payload);
    if (!keys.current.has(text)) keys.current.set(text, crypto.randomUUID());
    return keys.current.get(text)!;
  };

  const refreshList = useCallback(async () => {
    const data = await api<{ events: Event[]; next_offset: number | null }>(
      "events",
    );
    setEvents(data.events);
    setNextOffset(data.next_offset);
  }, []);
  const open = useCallback(async (id: string) => {
    setLoading(true);
    setError("");
    setHistorical(null);
    setEditing(null);
    setConfirmed(false);
    setComment("");
    try {
      const data = await api<Detail>(`events/${id}`);
      setDetail(data);
      setSelected(id);
      const url = new URL(window.location.href);
      url.searchParams.set("competition", id);
      window.history.replaceState(null, "", url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    Promise.all([
      api<{ events: Event[]; next_offset: number | null }>("events"),
      admin ? api<Options>("options") : Promise.resolve(null),
    ])
      .then(([list, choices]) => {
        if (active) {
          setEvents(list.events);
          setNextOffset(list.next_offset);
          if (choices) setOptions(choices);
          const id = new URLSearchParams(window.location.search).get(
            "competition",
          );
          if (id && /^[a-zA-Z0-9_-]{1,100}$/.test(id)) void open(id);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [enabled, admin, open]);
  const hasJob = detail?.jobs?.some((j) =>
    ["QUEUED", "RUNNING"].includes(j.state),
  );
  useEffect(() => {
    if (!hasJob || !selected || editing) return;
    const timer = setInterval(() => {
      void api<Detail>(`events/${selected}`)
        .then(setDetail)
        .catch(() =>
          setError("Actualisation interrompue. Rechargez le dossier."),
        );
    }, 4000);
    return () => clearInterval(timer);
  }, [hasJob, selected, editing]);

  async function act(action: string, data?: EditData) {
    if (!detail || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    const body = {
      action,
      expected_revision: detail.revision.id,
      confirmed,
      reason: data?.reason ?? comment,
      ...(data ? { data } : {}),
    };
    try {
      await api(`events/${detail.event.id}/actions`, {
        ...body,
        key: requestKey(body),
      });
      await open(detail.event.id);
      await refreshList();
      setNotice(
        action === "PUBLISH"
          ? "Cette version est publiée. Le classement a été mis à jour."
          : action === "SAVE"
            ? "Nouvelle version enregistrée. Une nouvelle validation sportive est nécessaire."
            : action === "IMPORT"
              ? "Analyse ajoutée à la file de traitement."
              : "Action enregistrée.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      const response = await api<{ event_id: string }>("events", {
        data: editing,
        key: requestKey(editing),
      });
      setCreating(false);
      await refreshList();
      await open(response.event_id);
      setNotice("Compétition créée. Lancez son analyse Nakka.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function more() {
    if (nextOffset === null) return;
    setBusy(true);
    try {
      const list = await api<{ events: Event[]; next_offset: number | null }>(
        `events?offset=${nextOffset}`,
      );
      setEvents((old) => [
        ...old,
        ...list.events.filter((e) => !old.some((x) => x.id === e.id)),
      ]);
      setNextOffset(list.next_offset);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const revision = historical ?? detail?.revision;
  const snapshot = revision?.snapshot;
  const active =
    detail && revision?.id === detail.event.current_revision_id && !historical;
  const canAct = active && !editing && !busy;
  const status = revision?.status;
  const total =
    snapshot?.results.reduce((sum, r) => sum + (r.points ?? 0), 0) ?? 0;
  const filtered = events.filter(
    (e) =>
      filter === "ALL" ||
      (filter === "VALIDATED"
        ? ["DS_VALIDATED", "READY_TO_PUBLISH", "PUBLISHED"].includes(e.status)
        : e.status === filter),
  );

  function metadataForm(isNew: boolean) {
    if (!editing) return null;
    const change = (key: keyof Metadata, value: string) =>
      setEditing({
        ...editing,
        metadata: { ...editing.metadata, [key]: value },
      });
    return (
      <div className={styles.formGrid}>
        <label>
          Nom de la compétition
          <input
            required
            minLength={3}
            maxLength={160}
            value={editing.metadata.title}
            onChange={(e) => change("title", e.target.value)}
          />
        </label>
        <label>
          Date de la compétition
          <input
            required
            type="date"
            value={editing.metadata.event_date}
            onChange={(e) => change("event_date", e.target.value)}
          />
        </label>
        <label>
          Type et barème
          <select
            value={editing.metadata.kind}
            onChange={(e) => change("kind", e.target.value)}
          >
            {Object.entries(kinds)
              .filter(
                ([key]) =>
                  isNew ||
                  (key === "CLUB_DOUBLE") ===
                    (editing.metadata.kind === "CLUB_DOUBLE"),
              )
              .map(([key, text]) => (
                <option key={key} value={key}>
                  {text} ·{" "}
                  {key === "COMMITTEE_CUP"
                    ? "C"
                    : key === "COMMITTEE_OPEN"
                      ? "D"
                      : "E"}
                </option>
              ))}
          </select>
        </label>
        <label>
          Organisateur
          <input
            required
            list="ranking-clubs"
            value={editing.metadata.organizer}
            onChange={(e) => change("organizer", e.target.value)}
          />
          <datalist id="ranking-clubs">
            {options.clubs.map((club) => (
              <option key={club} value={club} />
            ))}
          </datalist>
        </label>
        <label className={styles.wide}>
          Lien Nakka
          <input
            required
            type="url"
            disabled={!isNew}
            placeholder="https://n01darts.com/n01/tournament/comp.php?id=…"
            value={editing.metadata.source_url}
            onChange={(e) => change("source_url", e.target.value)}
          />
        </label>
        <label>
          Directeur sportif assigné
          <select
            value={editing.director_id ?? ""}
            onChange={(e) =>
              setEditing({ ...editing, director_id: e.target.value || null })
            }
          >
            <option value="">À désigner</option>
            {options.directors.map((d) => (
              <option key={d.user_id} value={d.user_id}>
                {d.display_name || "Directeur sportif"}
              </option>
            ))}
          </select>
        </label>
        <p className={styles.hint}>
          Saison 2026–2027.{" "}
          {editing.metadata.kind === "CLUB_DOUBLE"
            ? "Double : 10 / 8 / 6 / 4 / 2 points à chaque joueur."
            : "Les points sont calculés à partir du barème de l’épreuve."}
        </p>
        {!options.directors.length && (
          <p className={styles.warning}>
            Aucun compte Directeur sportif actif. Le brouillon peut être préparé
            ; l’envoi attendra la désignation du DS.
          </p>
        )}
      </div>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>
            974 DARTS · CLASSEMENT INDIVIDUEL
          </span>
          <h1>
            {admin ? "Validation des compétitions" : "Espace Directeur sportif"}
          </h1>
          <p>
            {admin
              ? "Préparer les résultats, recueillir l’avis sportif, puis publier."
              : "Contrôlez les résultats et les points des compétitions qui vous sont confiées."}
          </p>
        </div>
        <div className={styles.seal}>
          <ShieldCheck size={30} />
          <span>
            Validation humaine<strong>Saison 2026–2027</strong>
          </span>
        </div>
      </header>
      {error && (
        <div className={styles.error} role="alert">
          <TriangleAlert size={20} />
          {error}
          <button
            onClick={() => {
              if (selected) void open(selected);
              else void refreshList().catch((e) => setError(e.message));
            }}
          >
            Recharger
          </button>
        </div>
      )}
      {notice && (
        <div className={styles.success} role="status">
          <CheckCircle2 size={20} />
          {notice}
        </div>
      )}
      {!enabled ? (
        <section className={styles.panel}>
          <h2>Activation en préparation</h2>
          <p>
            Le nouvel espace de validation sera disponible après la préparation
            de la base et du compte Directeur sportif.
          </p>
          <Link href="/competitions/classement-individuel">
            Consulter le classement publié →
          </Link>
        </section>
      ) : creating ? (
        <form className={styles.panel} onSubmit={create}>
          <h2>Nouvelle compétition</h2>
          {metadataForm(true)}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              Annuler
            </button>
            <button disabled={busy} className={styles.primary}>
              Créer le brouillon
            </button>
          </div>
        </form>
      ) : !selected ? (
        <>
          <section className={styles.metrics}>
            {[
              {
                label: "À valider par le DS",
                value: events.filter((e) => e.status === "PENDING_DS").length,
                icon: Clock3,
              },
              {
                label: "Corrections demandées",
                value: events.filter((e) => e.status === "CORRECTION_REQUESTED")
                  .length,
                icon: TriangleAlert,
              },
              {
                label: "Validées récemment",
                value: events.filter((e) =>
                  ["DS_VALIDATED", "READY_TO_PUBLISH", "PUBLISHED"].includes(
                    e.status,
                  ),
                ).length,
                icon: FileCheck2,
              },
            ].map(({ label, value, icon: Icon }) => (
              <article key={label}>
                <Icon />
                <strong>{value}</strong>
                <span>{label}</span>
              </article>
            ))}
          </section>
          <section className={styles.panel}>
            <div className={styles.heading}>
              <div>
                <span className={styles.eyebrow}>DOSSIERS SPORTIFS</span>
                <h2>
                  {admin ? "Toutes les compétitions" : "Mes compétitions"}
                </h2>
              </div>
              {admin && (
                <button
                  className={styles.primary}
                  onClick={() => {
                    setEditing(blank());
                    setCreating(true);
                  }}
                >
                  <Plus size={18} />
                  Nouvelle compétition
                </button>
              )}
            </div>
            <div className={styles.filters}>
              {[
                ["ALL", "Toutes"],
                ["PENDING_DS", "À valider"],
                ["CORRECTION_REQUESTED", "Corrections"],
                ["VALIDATED", "Validées"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {loading ? (
              <p role="status">Chargement des compétitions…</p>
            ) : filtered.length ? (
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Compétition</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Contrôle</th>
                      <th>Publication</th>
                      <th>
                        <span className={styles.srOnly}>Ouvrir</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <button className={styles.eventTitle} onClick={() => void open(e.id)}>{e.metadata.title}</button>
                          <small>
                            Version {e.number} · {e.metadata.organizer}
                          </small>
                        </td>
                        <td>{date(e.metadata.event_date)}</td>
                        <td>{kinds[e.metadata.kind]}</td>
                        <td>
                          <span className={styles.badge} data-state={e.status}>
                            {labels[e.status]}
                          </span>
                          {!!e.blockers && (
                            <small>{e.blockers} points à vérifier</small>
                          )}
                        </td>
                        <td>
                          {e.published_revision_id ? (
                            <span className={styles.live}>
                              Version publiée active
                            </span>
                          ) : (
                            "Non publié"
                          )}
                        </td>
                        <td>
                          <button
                            className={styles.secondary}
                            onClick={() => void open(e.id)}
                          >
                            Ouvrir →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.empty}>
                <FileCheck2 size={34} />
                <h3>
                  {filter === "ALL"
                    ? "Aucune compétition à afficher"
                    : "Aucune compétition dans cette catégorie"}
                </h3>
                <p>
                  {admin
                    ? "Créez une compétition pour préparer son analyse."
                    : "Les dossiers apparaîtront ici après leur envoi par l’administrateur."}
                </p>
              </div>
            )}
            {nextOffset !== null && (
              <button
                className={styles.secondary}
                disabled={busy}
                onClick={() => void more()}
              >
                Charger les suivantes
              </button>
            )}
          </section>
        </>
      ) : loading && !detail ? (
        <section className={styles.panel}>Chargement du dossier…</section>
      ) : detail && revision && snapshot ? (
        <>
          <div className={styles.heading}>
            <button
              className={styles.linkButton}
              onClick={() => {
                setSelected(null);
                setDetail(null);
                setEditing(null);
                setHistorical(null);
                const url = new URL(window.location.href);
                url.searchParams.delete("competition");
                window.history.replaceState(null, "", url);
                void refreshList();
              }}
            >
              <ArrowLeft size={17} />
              Compétitions
            </button>
            <button
              className={styles.secondary}
              disabled={busy || !!editing}
              onClick={() => void open(detail.event.id)}
            >
              <RefreshCw size={15} />
              Actualiser
            </button>
          </div>
          <section className={styles.panel}>
            <div className={styles.heading}>
              <div>
                <span className={styles.badge} data-state={status}>
                  {labels[status ?? ""]} · v{revision.number}
                </span>
                <h2>{snapshot.metadata.title}</h2>
                <p>
                  {date(snapshot.metadata.event_date)} ·{" "}
                  {kinds[snapshot.metadata.kind]} ·{" "}
                  {snapshot.metadata.organizer}
                </p>
              </div>
              <div className={styles.score}>
                <strong>{total}</strong>
                <span>
                  points {status === "PUBLISHED" ? "publiés" : "proposés"}
                </span>
                <small>{snapshot.results.length} joueurs</small>
              </div>
            </div>
            <a
              href={snapshot.metadata.source_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Consulter la source Nakka ↗
            </a>
            {detail.event.published_revision_id &&
              detail.event.published_revision_id !== revision.id && (
                <p className={styles.success}>
                  La version précédemment publiée reste visible jusqu’à la
                  publication de son remplacement.
                </p>
              )}
            {revision.historical && (
              <p className={styles.hint}>
                {snapshot.historical_attestation?.label}. Les points existants
                sont conservés. Une correction nécessite une nouvelle analyse et
                le circuit de validation complet.
              </p>
            )}
            {historical && (
              <p className={styles.warning}>
                Vous consultez une version d’archive.{" "}
                <button
                  className={styles.linkButton}
                  onClick={() => setHistorical(null)}
                >
                  Revenir au dossier actif
                </button>
              </p>
            )}
          </section>
          <ol className={styles.steps}>
            {[
              "Analyse",
              "Contrôle admin",
              "Validation DS",
              "Contrôle final",
              "Publication",
            ].map((text, index) => {
              const progress = [
                "DRAFT",
                "ANALYZED",
                "PENDING_DS",
                "DS_VALIDATED",
                "READY_TO_PUBLISH",
                "PUBLISHED",
              ].indexOf(status ?? "");
              return (
                <li key={text} data-done={progress > index}>
                  <span>
                    {progress > index ? <Check size={16} /> : index + 1}
                  </span>
                  {text}
                </li>
              );
            })}
          </ol>
          {admin && !historical && (
            <section className={styles.panel}>
              <div className={styles.heading}>
                <h2>Préparation du dossier</h2>
                <div className={styles.actions}>
                  <button
                    className={styles.secondary}
                    disabled={busy || !!editing || hasJob}
                    onClick={() => void act("IMPORT")}
                  >
                    {hasJob ? "Analyse en cours…" : "Analyser la source Nakka"}
                  </button>
                  <button
                    className={styles.secondary}
                    disabled={
                      busy || !!editing || revision.historical || hasJob
                    }
                    onClick={() => {
                      setEditing(editData(revision));
                      setConfirmed(false);
                    }}
                  >
                    Corriger / compléter
                  </button>
                </div>
              </div>
              {detail.jobs?.slice(0, 1).map((j) => (
                <p key={j.id} role="status">
                  Analyse : {labels[j.state]}
                  {j.error ? ` · ${j.error}` : ""}
                </p>
              ))}
              <p className={styles.hint}>
                Chaque analyse ou correction crée une nouvelle version et exige
                une nouvelle validation du DS.
              </p>
            </section>
          )}
          {editing && !creating && (
            <form
              className={styles.panel}
              onSubmit={(e) => {
                e.preventDefault();
                void act("SAVE", editing);
              }}
            >
              <h2>Contrôle de la nouvelle version</h2>
              {metadataForm(false)}
              <h3>Reconnaissance et pièces de contrôle</h3>
              <div className={styles.formGrid}>
                <label>
                  Déclaration au DS
                  <input
                    type="date"
                    value={editing.recognition.declared_on ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        recognition: {
                          ...editing.recognition,
                          declared_on: e.target.value || null,
                        },
                      })
                    }
                  />
                </label>
                {(
                  [
                    ["ended_at", "Fin de l’épreuve"],
                    ["received_at", "Réception des résultats par le DS"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label} · heure Réunion
                    <input
                      type="datetime-local"
                      value={localTime(editing.recognition[key])}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          recognition: {
                            ...editing.recognition,
                            [key]: e.target.value
                              ? `${e.target.value}:00+04:00`
                              : null,
                          },
                        })
                      }
                    />
                  </label>
                ))}
                <label className={styles.wide}>
                  Références des justificatifs
                  <textarea
                    maxLength={2000}
                    placeholder="Affiche, date de déclaration, réception des résultats…"
                    value={editing.recognition.evidence}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        recognition: {
                          ...editing.recognition,
                          evidence: e.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label className={styles.wide}>
                  Référence du classement sportif officiel
                  <textarea
                    maxLength={2000}
                    placeholder="Préciser le tableau et la référence utilisés, notamment pour une double élimination."
                    value={editing.recognition.classification_basis}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        recognition: {
                          ...editing.recognition,
                          classification_basis: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              </div>
              <div className={styles.checks}>
                {(
                  [
                    ["logo_confirmed", "Logo du Comité présent sur l’affiche"],
                    ["format_confirmed", "Format 501 Double Out confirmé"],
                    [
                      "eligibility_confirmed",
                      "Éligibilité contrôlée à la date de la compétition",
                    ],
                    [
                      "classification_confirmed",
                      "Classement final contrôlé avec sa référence",
                    ],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={editing.recognition[key]}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          recognition: {
                            ...editing.recognition,
                            [key]: e.target.checked,
                          },
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              <h3>Identités, classement et éligibilité</h3>
              <p className={styles.hint}>
                Un duo contient deux lignes. Chaque joueur reçoit ses propres
                points. Les points sont recalculés à l’enregistrement.
              </p>
              <div className={styles.tableWrap}>
                <table className={styles.editTable}>
                  <thead>
                    <tr>
                      <th>Source Nakka</th>
                      <th>Identité officielle</th>
                      <th>Catégorie</th>
                      <th>Résultat</th>
                      <th>Éligibilité</th>
                      <th>Motif</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editing.results.map((r, index) => {
                      const update = (change: Partial<typeof r>) =>
                        setEditing({
                          ...editing,
                          results: editing.results.map((row, i) =>
                            i === index ? { ...row, ...change } : row,
                          ),
                        });
                      return (
                        <tr key={r.source_ref}>
                          <td>
                            {
                              snapshot.results.find(
                                (row) => row.source_ref === r.source_ref,
                              )?.source_name
                            }
                            <small>{r.source_ref}</small>
                          </td>
                          <td>
                            <select
                              aria-label={`Identité ${r.source_ref}`}
                              value={r.identity_id ?? ""}
                              onChange={(e) =>
                                update({ identity_id: e.target.value || null })
                              }
                            >
                              <option value="">
                                À résoudre / non licencié
                              </option>
                              {options.identities.map((i) => (
                                <option key={i.id} value={i.id}>
                                  {i.canonical_display_name} ·{" "}
                                  {i.club || "Sans licence active"}
                                </option>
                              ))}
                            </select>
                            {!r.identity_id && (
                              <input
                                aria-label={`Nom ${r.source_ref}`}
                                placeholder="Nom du joueur"
                                value={r.player_name}
                                onChange={(e) =>
                                  update({ player_name: e.target.value })
                                }
                              />
                            )}
                          </td>
                          <td>
                            <select
                              aria-label={`Catégorie ${r.source_ref}`}
                              value={r.gender}
                              onChange={(e) =>
                                update({ gender: e.target.value })
                              }
                            >
                              <option value="X">Non précisée</option>
                              <option value="M">Homme</option>
                              <option value="F">Femme</option>
                            </select>
                          </td>
                          <td>
                            <select
                              aria-label={`Classement ${r.source_ref}`}
                              value={r.placement}
                              onChange={(e) =>
                                update({ placement: e.target.value })
                              }
                            >
                              {Object.entries(places).map(([key, label]) => (
                                <option key={key} value={key}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              aria-label={`Éligibilité ${r.source_ref}`}
                              value={r.eligibility}
                              onChange={(e) =>
                                update({ eligibility: e.target.value })
                              }
                            >
                              <option value="UNCONFIRMED">À confirmer</option>
                              <option value="ELIGIBLE">Éligible</option>
                              <option value="INELIGIBLE">
                                Non éligible · 0 pt
                              </option>
                            </select>
                          </td>
                          <td>
                            <input
                              aria-label={`Motif ${r.source_ref}`}
                              placeholder="Motif si non éligible"
                              value={r.reason}
                              maxLength={500}
                              onChange={(e) =>
                                update({ reason: e.target.value })
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <label className={styles.reason}>
                Motif de la modification
                <textarea
                  required
                  minLength={3}
                  maxLength={2000}
                  value={editing.reason}
                  onChange={(e) =>
                    setEditing({ ...editing, reason: e.target.value })
                  }
                />
              </label>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={busy}
                  onClick={() => setEditing(null)}
                >
                  Annuler les modifications
                </button>
                <button className={styles.primary} disabled={busy}>
                  Enregistrer une nouvelle version
                </button>
              </div>
            </form>
          )}
          {!editing && (
            <>
              <section className={styles.panel}>
                <div className={styles.heading}>
                  <h2>
                    Résultats et points{" "}
                    {status === "PUBLISHED" ? "publiés" : "proposés"}
                  </h2>
                  <span className={styles.hint}>
                    Barème {snapshot.metadata.category} ·{" "}
                    {(
                      snapshot.point_scale ??
                      (snapshot.metadata.category === "C"
                        ? [50, 38, 28, 18, 10]
                        : snapshot.metadata.category === "D"
                          ? [30, 24, 18, 12, 6]
                          : [10, 8, 6, 4, 2])
                    ).join(" / ")}
                  </span>
                </div>
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>Source Nakka</th>
                        <th>Identité retenue</th>
                        <th>Club</th>
                        <th>Classement</th>
                        <th>Éligibilité</th>
                        <th>Points / joueur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.results.map((r, i) => (
                        <tr key={r.source_ref ?? i}>
                          <td>
                            {r.source_name ?? r.player_name}
                            {r.duo_id && <small>Duo {r.duo_id}</small>}
                          </td>
                          <td>
                            <strong>
                              {r.player_name || "Identité à vérifier"}
                            </strong>
                            <small>
                              {r.identity_id
                                ? "Identité canonique"
                                : "Sans lien canonique"}
                            </small>
                          </td>
                          <td>{r.club || "—"}</td>
                          <td>{places[r.placement] ?? r.placement}</td>
                          <td>
                            {r.eligibility === "ELIGIBLE"
                              ? "Éligible"
                              : r.eligibility === "INELIGIBLE"
                                ? "Non éligible"
                                : revision.historical
                                  ? "Historique"
                                  : "À confirmer"}
                            {r.reason && <small>{r.reason}</small>}
                          </td>
                          <td>
                            <strong className={styles.points}>
                              {r.points ?? 0}
                            </strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!snapshot.results.length && (
                    <p className={styles.empty}>
                      L’analyse Nakka préparera les lignes de résultats.
                    </p>
                  )}
                </div>
              </section>
              <section className={styles.panel}>
                <h2>Contrôles du dossier</h2>
                {snapshot.blockers.length ? (
                  <div className={styles.warning}>
                    <TriangleAlert size={20} />
                    <div>
                      <strong>
                        {snapshot.blockers.length} points à résoudre avant
                        l’envoi
                      </strong>
                      <ul>
                        {snapshot.blockers.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <p className={styles.success}>
                    <CheckCircle2 size={20} />
                    Aucune anomalie bloquante enregistrée sur cette version.
                  </p>
                )}
                {snapshot.recognition && (
                  <div className={styles.evidence}>
                    <p>
                      <strong>Reconnaissance :</strong>{" "}
                      {snapshot.recognition.evidence || "À documenter"}
                    </p>
                    <p>
                      <strong>Déclaration :</strong>{" "}
                      {snapshot.recognition.declared_on
                        ? date(snapshot.recognition.declared_on)
                        : "À documenter"}{" "}
                      · <strong>Fin de l’épreuve :</strong>{" "}
                      {snapshot.recognition.ended_at
                        ? date(snapshot.recognition.ended_at)
                        : "À documenter"}{" "}
                      · <strong>Réception DS :</strong>{" "}
                      {snapshot.recognition.received_at
                        ? date(snapshot.recognition.received_at)
                        : "À documenter"}{" "}
                      (Réunion)
                    </p>
                    <p>
                      <strong>Classement officiel :</strong>{" "}
                      {snapshot.recognition.classification_basis ||
                        "À documenter"}
                    </p>
                    <p>
                      <strong>Éligibilité :</strong>{" "}
                      {snapshot.recognition.eligibility_confirmed
                        ? "Contrôlée"
                        : "À confirmer"}{" "}
                      · <strong>Format :</strong>{" "}
                      {snapshot.recognition.format_confirmed
                        ? "501 Double Out confirmé"
                        : "À confirmer"}
                    </p>
                  </div>
                )}
              </section>
              {snapshot.source && (
                <details className={styles.panel}>
                  <summary>
                    Données Nakka · {snapshot.source.summary?.matches ?? 0}{" "}
                    rencontres ·{" "}
                    {formatLabels[snapshot.source.format] ??
                      "Format à vérifier"}
                  </summary>
                  <p>
                    Collecte du {date(snapshot.source.collectedAt)}. Les
                    rencontres et statistiques servent au contrôle de la source.
                  </p>
                  <div className={styles.tableWrap}>
                    <table>
                      <thead>
                        <tr>
                          <th>Phase</th>
                          <th>Joueur / duo</th>
                          <th>Score</th>
                          <th>Joueur / duo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshot.source.matches.map((m) => (
                          <tr key={m.id}>
                            <td>{m.stage_label}</td>
                            <td>{m.home}</td>
                            <td>
                              {m.home_score}–{m.away_score}
                            </td>
                            <td>{m.away}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <details>
                    <summary>Participants et moyennes</summary>
                    <div className={styles.tableWrap}>
                      <table>
                        <thead>
                          <tr>
                            <th>Participant</th>
                            <th>Matchs</th>
                            <th>Victoires</th>
                            <th>Moyenne 3 fléchettes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {snapshot.source.participants.map((p) => (
                            <tr key={p.sourceId}>
                              <td>{p.name}</td>
                              <td>{p.matchesPlayed}</td>
                              <td>{p.matchesWon}</td>
                              <td>
                                {p.average3Darts?.toFixed(2) ?? "Indisponible"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </details>
              )}
              {admin && active && !!detail.impact?.length && (
                <details
                  className={styles.panel}
                  open={status === "READY_TO_PUBLISH"}
                >
                  <summary>
                    Impact sur le classement général · {detail.impact.length}{" "}
                    joueurs
                  </summary>
                  <div className={styles.tableWrap}>
                    <table>
                      <thead>
                        <tr>
                          <th>Joueur</th>
                          <th>Total actuel</th>
                          <th>Total proposé</th>
                          <th>Variation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.impact.map((i) => (
                          <tr key={i.player_name}>
                            <td>{i.player_name}</td>
                            <td>{i.before}</td>
                            <td>{i.after}</td>
                            <td>
                              {i.after - i.before > 0 ? "+" : ""}
                              {i.after - i.before}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className={styles.hint}>
                    La contribution de cette compétition remplace sa version
                    précédente.
                  </p>
                </details>
              )}
              {active &&
                (admin
                  ? ["ANALYZED", "DS_VALIDATED", "READY_TO_PUBLISH"].includes(
                      status ?? "",
                    )
                  : status === "PENDING_DS") && (
                  <section className={`${styles.panel} ${styles.approval}`}>
                    <span className={styles.eyebrow}>
                      {admin ? "DÉCISION ADMINISTRATEUR" : "DÉCISION SPORTIVE"}
                    </span>
                    <h2>
                      {!admin
                        ? "Confirmer les résultats de cette version"
                        : status === "ANALYZED"
                          ? "Transmettre au Directeur sportif"
                          : status === "DS_VALIDATED"
                            ? "Effectuer le contrôle final"
                            : "Publier les résultats"}
                    </h2>
                    <p>
                      Version {revision.number} · {snapshot.results.length}{" "}
                      joueurs · {total} points.{" "}
                      {status === "READY_TO_PUBLISH"
                        ? "Cette action mettra à jour le classement public."
                        : "Les points publics restent inchangés à cette étape."}
                    </p>
                    <label className={styles.reason}>
                      Commentaire{" "}
                      {admin
                        ? "(facultatif)"
                        : "(obligatoire pour une correction)"}
                      <textarea
                        maxLength={2000}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                      />
                    </label>
                    <label className={styles.confirm}>
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />
                      {admin
                        ? "Je confirme avoir contrôlé cette version et son impact sur le classement."
                        : "Je confirme avoir contrôlé les résultats et le classement de cette compétition."}
                    </label>
                    <div className={styles.actions}>
                      {!admin ? (
                        <>
                          <button
                            className={styles.secondary}
                            disabled={!canAct || comment.trim().length < 3}
                            onClick={() => void act("REQUEST_CORRECTION")}
                          >
                            Demander une correction
                          </button>
                          <button
                            className={styles.primary}
                            disabled={
                              !canAct ||
                              !confirmed ||
                              !!snapshot.blockers.length
                            }
                            onClick={() => void act("APPROVE_DS")}
                          >
                            Valider les résultats · v{revision.number}
                          </button>
                        </>
                      ) : (
                        <button
                          className={styles.primary}
                          disabled={
                            !canAct ||
                            !confirmed ||
                            !!snapshot.blockers.length ||
                            !revision.director_id
                          }
                          onClick={() =>
                            void act(
                              status === "ANALYZED"
                                ? "SUBMIT"
                                : status === "DS_VALIDATED"
                                  ? "APPROVE_ADMIN"
                                  : "PUBLISH",
                            )
                          }
                        >
                          {status === "ANALYZED"
                            ? "Envoyer au Directeur sportif"
                            : status === "DS_VALIDATED"
                              ? "Valider le contrôle final"
                              : "Publier et mettre à jour le classement"}
                        </button>
                      )}
                    </div>
                  </section>
                )}
            </>
          )}
          <section className={styles.panel}>
            <div className={styles.heading}>
              <h2>
                <History size={20} /> Historique des versions
              </h2>
              <span className={styles.hint}>Chaque décision est conservée</span>
            </div>
            <div className={styles.versions}>
              {detail.history.map((r) => (
                <button
                  key={r.id}
                  className={styles.secondary}
                  disabled={busy || !!editing}
                  onClick={() => {
                    void api<{ revision: Revision }>(
                      `events/${detail.event.id}/revisions/${r.id}`,
                    )
                      .then((d) => {
                        setHistorical(d.revision);
                        setConfirmed(false);
                      })
                      .catch((e) => setError(e.message));
                  }}
                >
                  v{r.number} · {labels[r.status]}
                  {detail.event.published_revision_id === r.id
                    ? " · publique"
                    : ""}
                </button>
              ))}
            </div>
            <ol className={styles.timeline}>
              {detail.decisions.map((d) => (
                <li key={d.id}>
                  <span>{date(d.created_at)}</span>
                  <div>
                    <strong>
                      {labels[d.action]} · {d.actor_name} · v
                      {
                        detail.history.find((r) => r.id === d.revision_id)
                          ?.number
                      }
                    </strong>
                    {d.comment && <p>{d.comment}</p>}
                  </div>
                </li>
              ))}
            </ol>
            {admin && (
              <details>
                <summary>Journal administratif</summary>
                {detail.audit?.map((entry, index) => (
                  <p key={index}>
                    {date(entry.created_at)} · {labels[entry.action]}
                    {entry.reason ? ` — ${entry.reason}` : ""}
                  </p>
                ))}
              </details>
            )}
          </section>
          {admin && !!detail.notifications?.length && (
            <details className={styles.panel}>
              <summary>Notifications email</summary>
              <p className={styles.hint}>
                Une acceptation par le serveur email ne prouve pas la réception
                ou la lecture.
              </p>
              {detail.notifications.map((n, index) => (
                <p key={index}>
                  {labels[n.template]} · <strong>{labels[n.state]}</strong> ·{" "}
                  {n.attempts} tentative(s)
                  {n.last_error ? ` — ${n.last_error}` : ""}
                </p>
              ))}
            </details>
          )}
        </>
      ) : null}
      <footer className={styles.footer}>
        <ShieldCheck size={16} />
        <span>
          Machine → Administrateur → Directeur sportif → Administrateur →
          Publication
        </span>
        <Link href="/competitions/classement-individuel">
          Voir le classement public ↗
        </Link>
      </footer>
    </main>
  );
}
