import type { TournamentCard, TournamentHub, TournamentParticipant } from "@/lib/types/sprint14";
import bdcRoundOneDetails from "@/lib/bdc-round-one-details.json";

const backend = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";

export type TournamentRecord = TournamentParticipant & {
  code: string;
  competition: string;
  date: string | null;
};

export function normalizedPlayerName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]/g, "");
}

const historicalTournamentAliases: Record<string, Record<string, string>> = {
  T1: { yohan: "Yoann" },
  T2: { coco: "Corentin" },
  T4: { vincenttdc: "Vincent G" },
};

const bdcCanonicalNames: Record<string, string> = {
  vincenttdc: "Vincent G",
  abroussetdc: "Stéphane A",
  kevintdc: "Kevin",
  supermariotdc: "Mario",
  fabienpdc: "Fabien",
  guillaumetdc: "Guillaume",
  pierretdc: "Pierre",
  yoannkaz: "Yoann",
  benjamintdc: "Benjamin",
  nicolaspdc: "Nico",
  garytdc: "Gary",
  beverleytdc: "Beverley",
  franpdc: "Fran",
};

function getBdcRoundOneRecords(): TournamentRecord[] {
  const legsByPlayer = new Map<string, number>();

  for (const match of bdcRoundOneDetails.matches) {
    const matchLegs = match.officialLegs ?? match.recordedLegs ?? 0;
    for (const team of [match.teamA, match.teamB]) {
      for (const player of team.players ?? []) {
        const key = normalizedPlayerName(player.name);
        legsByPlayer.set(key, (legsByPlayer.get(key) ?? 0) + matchLegs);
      }
    }
  }

  return bdcRoundOneDetails.playerStats.flatMap((player) => {
    const sourceName = normalizedPlayerName(player.name);
    const canonicalName = bdcCanonicalNames[sourceName];
    if (!canonicalName) return [];

    return [{
      name: canonicalName,
      team: "Blind Draw Championship",
      teams: ["Blind Draw Championship"],
      legs_played: legsByPlayer.get(sourceName) ?? 0,
      legs_won: player.finishes.length,
      average_3_darts: player.average3,
      first_9: player.first9,
      best_finish: player.bestFinish,
      scores_180: player.visits180,
      scores_140: player.visits140,
      scores_100: player.visits100,
      no_score: player.zeroVisits,
      matches_played: player.matches,
      code: "BDC-M1",
      competition: "Blind Draw Championship — Manche 1",
      date: "2026-09-11",
    }];
  });
}

export async function getTournamentRecords(): Promise<TournamentRecord[]> {
  try {
    const catalogResponse = await fetch(`${backend}/api/v1/competitions/tournaments`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!catalogResponse.ok) return [];
    const catalog = (await catalogResponse.json()) as { tournaments?: TournamentCard[] };
    const cards = (catalog.tournaments ?? []).filter((item) => item.status === "AVAILABLE");
    const tournaments = await Promise.all(
      cards.map(async (card) => {
        try {
          const response = await fetch(
            `${backend}/api/v1/competitions/tournaments/${encodeURIComponent(card.code)}`,
            { cache: "no-store", signal: AbortSignal.timeout(5000) },
          );
          return response.ok ? ((await response.json()) as TournamentHub) : null;
        } catch {
          return null;
        }
      }),
    );
    const tournamentRows = tournaments.flatMap((tournament) =>
      tournament
        ? tournament.players.map((player) => {
            const alias =
              historicalTournamentAliases[tournament.code]?.[
                normalizedPlayerName(player.name)
              ];
            return {
              ...player,
              name: alias ?? player.name,
              code: tournament.code,
              competition: tournament.event_name || tournament.date_label || tournament.name,
              date: tournament.date,
            };
          })
        : [],
    );
    return [...tournamentRows, ...getBdcRoundOneRecords()];
  } catch {
    return [];
  }
}
