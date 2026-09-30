type Props = { darts: string[]; complete?: boolean; finished?: boolean };

export function VisitProgress({ darts, complete = darts.length >= 3, finished = false }: Props) {
  return <div className="play-visit" role="status" aria-live="polite" aria-atomic="true">
    <div className="play-visit-caption"><strong>{finished ? "Partie terminée" : complete ? "Volée terminée" : "Volée en cours"}</strong><span>{darts.length}/3 fléchettes jouées</span></div>
    <ol className="play-darts" aria-label="Fléchettes de la volée">
      {[0, 1, 2].map((index) => <li key={index} className={darts[index] ? "played" : complete || finished ? "unused" : ""}>
        <svg viewBox="0 0 40 40" aria-hidden="true"><path d="m8 32 16-16M20 20l-4-4 7-7 4 4m-3 3 4 4 7-7-4-4M8 32l-4 4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span>Fléchette {index + 1}</span><b>{darts[index] === "MISS" ? "Raté" : darts[index] ?? (complete || finished ? "Non jouée" : "À jouer")}</b>
      </li>)}
    </ol>
  </div>;
}
