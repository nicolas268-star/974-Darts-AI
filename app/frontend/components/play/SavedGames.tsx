"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LOCAL_GAMES, describeGame, isFinished, readRecord, type LocalKind, type ReadResult } from "@/lib/play/local-sessions";
import { browserStorage } from "./useLocalGame";

const kinds = Object.keys(LOCAL_GAMES) as LocalKind[];
const timestamp = (value: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
export function SavedGames({ userId }: { userId: string }) {
  const [records, setRecords] = useState<{kind: LocalKind; result: ReadResult}[] | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => { if (active) setRecords(kinds.map((kind) => ({ kind, result: readRecord(browserStorage, userId, kind) }))); };
    Promise.resolve().then(refresh);
    const changed = (event: StorageEvent) => { if (event.key === null || event.key.startsWith("974darts:play:v1:")) refresh(); };
    window.addEventListener("storage", changed);
    window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("storage", changed); window.removeEventListener("focus", refresh); };
  }, [userId]);
  const sessions = records?.flatMap(({kind,result}) => result.ok && result.record.current ? [{kind,session:result.record.current}] : []).sort((a,b) => b.session.updatedAt.localeCompare(a.session.updatedAt)) ?? [];
  const completed = records?.flatMap(({kind,result}) => result.ok ? result.record.completed.map((entry) => ({kind,...entry})) : []).sort((a,b) => b.endedAt.localeCompare(a.endedAt)).slice(0,20) ?? [];
  const problems = records?.filter(({result}) => !result.ok) ?? [];
  return <section id="parties" className="play-saved" aria-label="Mes parties sur cet appareil">
    <header><div><small>REPRENDRE ET RETROUVER</small><h2>Mes parties sur cet appareil</h2></div><Link href="/play/501#sessions">Sessions X01 →</Link></header>
    <p>Une partie sauvegardée par jeu, liée à votre compte sur ce navigateur. Les scores et les corrections restent disponibles après rechargement. Pour retrouver ces parties, utilisez ce même navigateur.</p>
    {!records ? <p role="status">Chargement des sauvegardes…</p> : null}
    {problems.length ? <p className="play-save-warning" role="status">Certaines sauvegardes sont indisponibles ou incompatibles : {problems.map(({kind}) => LOCAL_GAMES[kind].title).join(", ")}. Ouvrez le jeu concerné pour les vérifier.</p> : null}
    <div className="play-saved-grid">{sessions.map(({kind,session}) => <article key={kind} className="play-saved-card">
      <small>{isFinished(session.game) ? "PARTIE TERMINÉE" : "PARTIE EN COURS"}</small>
      <h3>{LOCAL_GAMES[kind].title}</h3><p>{session.game.participants.map((p) => p.name).join(" · ")}</p>
      <p>{describeGame(session.game)}</p><time dateTime={session.updatedAt}>{timestamp(session.updatedAt)}</time>
      <Link href={LOCAL_GAMES[kind].href}>{isFinished(session.game) ? "Revoir" : "Reprendre"} {LOCAL_GAMES[kind].title} →</Link>
    </article>)}</div>
    {records && !sessions.length && !problems.length ? <p>Aucune partie locale à reprendre pour le moment.</p> : null}
    <details className="play-saved-history" open={completed.length > 0}><summary>Historique local · {completed.length} résultat{completed.length > 1 ? "s" : ""}</summary>
      <p>Les dix dernières parties terminées de chaque jeu sont conservées. Les vingt résultats les plus récents sont affichés ici. Ces résultats restent personnels.</p>
      {completed.length ? <ol>{completed.map((entry) => <li key={entry.kind + entry.id}><div><strong>{LOCAL_GAMES[entry.kind].title}</strong><time dateTime={entry.endedAt}>{timestamp(entry.endedAt)}</time></div><b>{entry.outcome}</b><span>{entry.players.join(" · ")}</span></li>)}</ol> : <p>Aucune partie terminée enregistrée.</p>}
    </details>
  </section>;
}
