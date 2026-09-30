"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cloudRequest, type CloudRow } from "@/lib/play/cloud-sessions";
import { LOCAL_GAMES, describeGame, isFinished } from "@/lib/play/local-sessions";

export function CloudSavedGames() {
  const [rows, setRows] = useState<CloudRow[]>([]), [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try { const result = await cloudRequest(); if (alive) { setRows(result.rows); setError(false); } }
      catch { if (alive) setError(true); }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    return () => { alive = false; window.removeEventListener("focus", refresh); };
  }, []);
  const completed = rows.flatMap((row) => row.record.completed.map((entry) => ({ kind: row.kind, ...entry }))).sort((a,b) => b.endedAt.localeCompare(a.endedAt)).slice(0,20);
  return <section className="play-saved play-cloud-saved" aria-label="Mes parties synchronisées">
    <header><div><small>PC + TÉLÉPHONE</small><h2>Mes parties synchronisées</h2></div></header>
    <p>Connectez-vous au même compte sur vos appareils. Ouvrez une partie pour suivre les scores, puis choisissez « Saisir sur cet appareil » pour prendre la main.</p>
    {error ? <p role="status">Synchronisation indisponible pour le moment. Les sauvegardes de ce navigateur restent ci-dessous.</p> : null}
    <div className="play-saved-grid">{rows.filter((row) => row.record.current).map((row) => {
      const session = row.record.current!;
      return <article key={row.kind} className="play-cloud-card play-saved-card">
        <small>{isFinished(session.game) ? "PARTIE TERMINÉE" : "SYNCHRONISÉE"}</small>
        <h3>{LOCAL_GAMES[row.kind].title}</h3><p>{session.game.participants.map((p) => p.name).join(" · ")}</p><p>{describeGame(session.game)}</p>
        <Link href={LOCAL_GAMES[row.kind].href + "?sync=1"}>Ouvrir {LOCAL_GAMES[row.kind].title} sur cet appareil →</Link>
      </article>;
    })}</div>
    {!error && rows.length === 0 ? <p>Dans un jeu, choisissez « Synchroniser PC / téléphone » pour partager la partie entre vos appareils.</p> : null}
    {completed.length ? <details className="play-saved-history"><summary>Historique synchronisé · {completed.length} résultat{completed.length > 1 ? "s" : ""}</summary>
      <ol>{completed.map((entry) => <li key={entry.kind + entry.id}><strong>{LOCAL_GAMES[entry.kind].title}</strong><b>{entry.outcome}</b><span>{entry.players.join(" · ")}</span></li>)}</ol>
    </details> : null}
  </section>;
}
