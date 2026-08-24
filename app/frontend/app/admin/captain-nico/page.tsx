import type { PlayerOverview } from "@/lib/types/sprint4";
import type { DuoApiResponse } from "@/lib/duo/types";
import CaptainNico from "./CaptainNico";
import styles from "./CaptainNico.module.css";

async function loadData() {
  const base = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";
  const empty: { players: PlayerOverview[]; duos: DuoApiResponse["duos"] } = { players: [], duos: [] };
  try {
    const [playersResponse, duosResponse] = await Promise.all([
      fetch(`${base}/api/v1/players`, { cache: "no-store", signal: AbortSignal.timeout(7000) }),
      fetch(`${base}/api/v1/duos`, { cache: "no-store", signal: AbortSignal.timeout(7000) }),
    ]);
    if (!playersResponse.ok) return empty;
    const playersPayload = await playersResponse.json();
    const duosPayload = duosResponse.ok ? await duosResponse.json() : { duos: [] };
    return { players: playersPayload.players ?? [], duos: duosPayload.duos ?? [] };
  } catch { return empty; }
}

export default async function CaptainNicoPage() {
  const data = await loadData();
  return <main className={styles.shell}><CaptainNico players={data.players} duos={data.duos} /></main>;
}
