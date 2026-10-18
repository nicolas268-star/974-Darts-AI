import type { TournamentHub, TournamentStage } from "@/lib/types/sprint14";

/** A secondary knockout is a consolation unless the source proves double elimination. */
export function tournamentBrackets(data: Pick<TournamentHub, "bracket" | "format" | "has_double_elimination">) {
  const doubleElimination = data.has_double_elimination === true ||
    ["DOUBLE_ELIMINATION", "POOLS_AND_DOUBLE_ELIMINATION"].includes(data.format ?? "");
  const panels = {
    primary: [] as TournamentStage[],
    loser: [] as TournamentStage[],
    secondary: [] as TournamentStage[],
    finals: [] as TournamentStage[],
    thirdPlace: [] as TournamentStage[],
  };
  for (const stage of data.bracket ?? []) {
    const kind = stage.bracket_kind;
    if (kind === "GRAND_FINAL" || stage.code.startsWith("grand_final")) panels.finals.push(stage);
    else if (kind === "THIRD_PLACE" || stage.code.startsWith("third_place")) panels.thirdPlace.push(stage);
    else if (kind === "SECONDARY" || stage.code.startsWith("secondary_")) panels.secondary.push(stage);
    else if (kind === "LOSER" || stage.code.startsWith("loser_")) {
      (doubleElimination ? panels.loser : panels.secondary).push(stage);
    } else panels.primary.push(stage);
  }
  for (const stages of Object.values(panels)) stages.sort((a, b) => a.order - b.order);
  return { ...panels, doubleElimination };
}

export const tournamentMetric = (value: number | null | undefined) => value ?? "Non disponible";
