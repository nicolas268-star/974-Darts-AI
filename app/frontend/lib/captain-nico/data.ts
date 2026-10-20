import type { PlayerOverview } from "@/lib/types/sprint4";
import type { DuoOverview } from "@/lib/duo/types";
import { officialPlayerRoster2027 } from "@/lib/team-roster";

export type CaptainData = {
  players: PlayerOverview[];
  duos: DuoOverview[];
  seasonLabel: string;
  notice?: string;
  unavailable?: boolean;
};

type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue => value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const metric = (value: unknown) => value === null || (typeof value === "number" && Number.isFinite(value));
const nonnegative = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const empty = (notice: string, seasonLabel = "Saison indisponible"): CaptainData => ({ players: [], duos: [], seasonLabel, notice, unavailable: true });
const DUO_NOTICE = "Historique des doubles indisponible. Les estimations de doubles reposent sur les statistiques individuelles.";

function validPlayer(value: unknown, seasonId: string): value is PlayerOverview {
  return object(value) && nonempty(value.player_id) && nonempty(value.name) && typeof value.team === "string"
    && value.season_id === seasonId && metric(value.average_3_darts) && metric(value.first_9)
    && metric(value.legs_played) && metric(value.win_rate);
}

function validDuo(value: unknown): value is DuoOverview {
  if (!object(value) || !nonempty(value.duo_id) || !object(value.player_1) || !object(value.player_2)) return false;
  return nonempty(value.player_1.id) && nonempty(value.player_2.id) && value.player_1.id !== value.player_2.id
    && nonnegative(value.matches_played) && nonnegative(value.legs_played)
    && metric(value.average_3_darts) && metric(value.first_9) && nonnegative(value.win_rate);
}

/** Keep every canonical player, including newcomers, but never combine seasons. */
export async function loadCaptainData({
  baseUrl = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000",
  fetcher = fetch,
}: { baseUrl?: string; fetcher?: typeof fetch } = {}): Promise<CaptainData> {
  const base = baseUrl.replace(/\/$/, "");
  async function read(path: string): Promise<unknown> {
    try {
      const response = await fetcher(`${base}/api/v1/${path}`, { cache: "no-store", signal: AbortSignal.timeout(7000) });
      return response.ok ? await response.json() : null;
    } catch { return null; }
  }

  const catalog = await read("competitions");
  const active = object(catalog) ? catalog.active_championship : null;
  if (!object(active) || !nonempty(active.id) || !nonempty(active.name) || !Number.isInteger(active.year)) {
    return empty("La saison active est indisponible. Recharge la page pour récupérer les statistiques du championnat.");
  }
  const label = `Saison ${active.year}`;
  const query = `?season_id=${encodeURIComponent(active.id)}`;
  // Each read catches its own failure: a duo outage must not hide the players.
  const [playerPayload, duoPayload] = await Promise.all([read(`players${query}`), read(`duos${query}`)]);
  if (!object(playerPayload) || !Array.isArray(playerPayload.players) || !playerPayload.players.every(value => validPlayer(value, active.id as string))) {
    return empty("Les statistiques des joueurs de cette saison sont indisponibles. Recharge la page avant de lancer une analyse.", label);
  }
  const players = playerPayload.players as PlayerOverview[];
  if (new Set(players.map(player => player.player_id)).size !== players.length) {
    return empty("La liste des joueurs contient des identités incohérentes. Recharge la page avant de lancer une analyse.", label);
  }
  if (!players.length) return empty("Aucun joueur n’est encore disponible pour cette saison.", label);
  const affiliated = players.map(player => ({
    ...player,
    team: active.year === 2027 ? officialPlayerRoster2027(player.name)?.name ?? player.team : player.team,
  }));
  const validDuos = object(duoPayload) && object(duoPayload.season) && duoPayload.season.id === active.id
    && Array.isArray(duoPayload.duos) && duoPayload.duos.every(validDuo);
  return {
    players: affiliated,
    duos: validDuos ? duoPayload.duos as DuoOverview[] : [],
    seasonLabel: label,
    ...(validDuos ? {} : { notice: DUO_NOTICE }),
  };
}
