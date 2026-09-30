import { checkoutSuggestions } from "@/lib/x01/engine";
import { conquestTargetLabel, conquestUltraAttempt, type ConquestState } from "@/lib/play/fun-engine";

export function ConquestUltraStatus({ game }: { game: ConquestState }) {
  if (game.campaign?.mode !== "ULTRA") return null;
  const attempt = conquestUltraAttempt(game);
  const remainingDarts = 3 - game.visitDarts.length;
  const routes = attempt && !game.visitClosed ? checkoutSuggestions(attempt.remaining, "DOUBLE_OUT").filter(route => route.split(" · ").length <= remainingDarts) : [];
  return <section className="conquest-ultra-status" aria-label="Tentative Ultra" aria-live="polite">
    {attempt ? <>
      <span>FINISH {conquestTargetLabel(attempt.target, true)} · {game.participants[game.activeParticipant].name}</span>
      <strong>{attempt.checkout ? "Conquis !" : attempt.bust ? "BUST" : attempt.remaining}<small>{attempt.checkout ? "Finish réussi en double" : attempt.bust ? "Tentative terminée" : game.visitClosed ? "Essai terminé · aucun reste conservé" : "à finir en double"}</small></strong>
      {!game.visitClosed ? <p>{remainingDarts} fléchette{remainingDarts > 1 ? "s" : ""} restante{remainingDarts > 1 ? "s" : ""}{game.visitDarts.length ? " · Territoire verrouillé pour cette volée" : " · Prêt à lancer"}</p> : <p>{game.winnerSide === null ? "Passez au joueur suivant pour une nouvelle tentative." : "Tous les territoires sont occupés."}</p>}
      {routes.length ? <p className="conquest-ultra-routes">Suggestions : {routes.join(" / ")}</p> : !game.visitClosed ? <p>Finish impossible avec les fléchettes restantes.</p> : null}
    </> : <><strong>Choisissez un territoire</strong><p>Examinez une région puis appuyez sur « Attaquer ce finish ». Réussissez son total en trois fléchettes maximum, avec un double final.</p></>}
  </section>;
}
