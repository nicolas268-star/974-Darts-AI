import { BDC_RESULTS, BDC_ROUNDS, BDC_ROUND_REPORTS, BDC_ROUND_TWO_POINTS_NOTE, BDC_URL, bdcDate, bdcPoints, bdcStandings } from "@/lib/bdc";
import roundOne from "@/lib/bdc-round-one-details.json";
import roundTwo from "@/lib/bdc-round-two.json";
import type { BdcVisibilityOption } from "@/lib/visibility-summary";

/** Build compact drafts on the server from the same audited data as the public BDC page. */
export function buildBdcVisibilityOptions(): BdcVisibilityOption[] {
  return BDC_RESULTS.filter(result => BDC_ROUND_REPORTS[result.round] && [1, 2].includes(result.round))
    .map(result => {
      const round = BDC_ROUNDS.find(item => item.number === result.round)!;
      const isSecond = result.round === 2;
      const matches = isSecond ? roundTwo.quality.matches : roundOne.quality.totalMatches;
      const legs = isSecond ? roundTwo.quality.recordedLegs : roundOne.matches.reduce((sum, match) => sum + match.recordedLegs, 0);
      const players = result.teams.length * 2;
      const url = `https://974darts.re${BDC_URL}#resultats-manche-${result.round}`;
      const heading = `🎯 Blind Draw Championship · Manche ${result.round}\n${bdcDate(round.date)} · ${round.location}`;
      const volume = `${result.teams.length} doublettes · ${players} joueurs · ${matches} matchs · ${legs} legs${isSecond ? " vérifiés" : " enregistrés"}.`;
      const podium = [...result.teams].filter(team => team.place !== null && team.place <= 3).sort((a, b) => a.place! - b.place!)
        .map(team => `${["🥇", "🥈", "🥉"][team.place! - 1]} ${team.players.map(player => player.name).join(" / ")} — ${bdcPoints(team.place!, team.poolWins!, result.teamCount)} pts par joueur.`).join("\n");
      const countedRounds = BDC_RESULTS.filter(item => item.round <= result.round);
      const standings = bdcStandings(countedRounds);
      const ranking = `📊 Classement cumulé après ${countedRounds.map(item => `M${item.round}`).join(" + ")}${result.provisional ? " · provisoire" : ""}\n` +
        standings.filter(player => player.rank <= 3).map(player => `${player.rank}. ${player.name} — ${player.total} pts`).join("\n");
      const reservation = result.provisional ? `⚠️ ${BDC_ROUND_TWO_POINTS_NOTE} Les points M2 et les totaux qui les incluent sont provisoires.` : "";
      const coverage = isSecond ? "" : "Statistiques partielles — incident Nakka : certaines manches ont été terminées hors application. Les legs manquants ne sont pas reconstitués.";
      let final = "";
      let highlights = "";
      if (isSecond) {
        const match = roundTwo.matches.find(item => item.phase === "Finale")!;
        const [winner, runnerUp] = match.teamA.score > match.teamB.score ? [match.teamA, match.teamB] : [match.teamB, match.teamA];
        final = `Finale : ${winner.name} s’imposent ${winner.score}–${runnerUp.score} face à ${runnerUp.name}.`;
        const bestAverage = [...roundTwo.playerStats].sort((a, b) => b.average3 - a.average3)[0];
        const bestFinish = [...roundTwo.playerStats].sort((a, b) => (b.bestFinish ?? 0) - (a.bestFinish ?? 0))[0];
        highlights = `🎯 Performances de la manche\n• Meilleure moyenne 3 darts : ${bestAverage.name}, ${bestAverage.average3.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} sur ${bestAverage.legs} legs.\n• Plus haut finish : ${bestFinish.name}, ${bestFinish.bestFinish}.`;
      }
      const sections = [heading, volume, podium, final];
      return {
        id: `bdc-manche-${result.round}`,
        label: `BDC · Manche ${result.round} · ${bdcDate(round.date)}`,
        summary: {
          whatsapp: [...sections, highlights, ranking, reservation, coverage, `Résultats, statistiques et classement complet : ${url}`].filter(Boolean).join("\n\n"),
          facebook: [...sections, ranking, reservation, coverage, `📊 Résultats et statistiques : ${url}`, "#974Darts #BDC #FlechettesReunion #LaReunion"].filter(Boolean).join("\n\n"),
          mode: "statistics" as const,
          note: ["Résumé préparé à partir des résultats BDC publiés sur le site.", reservation.replace("⚠️ ", ""), coverage].filter(Boolean).join(" "),
          ai_available: false,
          evening: { url, matches, legs, players, legsLabel: isSecond ? "legs vérifiés" : "legs enregistrés" },
          fingerprint: `bdc-manche-${result.round}-${result.provisional ? "provisional" : "published"}`,
        },
      };
    }).reverse();
}
