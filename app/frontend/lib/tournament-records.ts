import type { TournamentCard, TournamentHub, TournamentParticipant } from "@/lib/types/sprint14";

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
    return tournaments.flatMap((tournament) =>
      tournament
        ? tournament.players.map((player) => ({
            ...player,
            code: tournament.code,
            competition: tournament.event_name || tournament.date_label || tournament.name,
            date: tournament.date,
          }))
        : [],
    );
  } catch {
    return [];
  }
}
