import { TEAM_ROSTERS_2027, type TeamRoster2027 } from "./team-rosters-2027";

export async function getOfficialRosters(year?: number): Promise<TeamRoster2027[]> {
  if (!year) return [];
  try {
    const backend = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";
    const response = await fetch(`${backend}/api/v1/player-registrations/rosters?season_key=${year - 1}-${year}`, {
      cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    const payload = response.ok ? await response.json() : null;
    if (Array.isArray(payload?.rosters)) return payload.rosters;
  } catch { /* The original roster remains available during rolling deployment. */ }
  return year === 2027 ? TEAM_ROSTERS_2027 : [];
}
