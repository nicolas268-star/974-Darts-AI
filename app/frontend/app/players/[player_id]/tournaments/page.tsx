import Link from "next/link";
import { ArrowLeft, Trophy } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import "../../../competitions/competition-hub.css";
import "../player-premium.css";

type Participation = {
  code: string; name: string | null; event_name: string | null;
  date_label: string | null; season: string | null; href: string;
  statistics: { name: string; team?: string; legs_played: number; legs_won: number; average_3_darts: number | null; best_finish: number | null; scores_180: number; scores_140: number; scores_100: number };
};
type Payload = { player: { player_id: string; name: string; team?: string }; participation_count: number; participations: Participation[] };

const backend = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";
async function loadPerformances(playerId: string): Promise<Payload | null> {
  try {
    const response = await fetch(`${backend}/api/v1/players/${playerId}/tournaments`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    return response.ok ? response.json() : null;
  } catch { return null; }
}
const decimal = (value: number | null) => value == null ? "—" : value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function PlayerTournamentPage({ params }: { params: Promise<{ player_id: string }> }) {
  const { player_id } = await params;
  const data = await loadPerformances(player_id);
  return <div className="dashboard"><Sidebar/><main className="main competition-page tournament-theme player-tournament-page">
    <Link href={`/players/${player_id}`} className="hub-back"><ArrowLeft size={16}/> Retour au profil</Link>
    <header className="competition-hero">
      <div><span className="competition-eyebrow">PALMARÈS EN TOURNOIS</span><h1>{data?.player.name ?? "Joueur"}</h1><p>Performances observées dans les tournois amicaux enregistrés sur 974 Darts.</p></div>
      <div className="competition-active-year"><Trophy size={22}/><strong>{data?.participation_count ?? 0}</strong><small>participation(s)</small></div>
    </header>
    {!data ? <div className="notice">Les performances en tournois sont momentanément indisponibles.</div> : data.participations.length === 0 ? <div className="notice">Aucune participation à un tournoi enregistrée pour ce joueur.</div> : <section className="hub-panel">
      <div className="hub-table-scroll"><table className="hub-table"><thead><tr><th>Tournoi</th><th>Date</th><th>Équipe / duo</th><th>Legs G/J</th><th>Moy. 3 fl.</th><th>Finish</th><th>180</th><th>140+</th><th>100+</th></tr></thead><tbody>
        {data.participations.map((item) => <tr key={item.code}><td><Link href={item.href}><strong>{item.event_name || item.name || item.code}</strong></Link></td><td>{item.date_label || "—"}</td><td>{item.statistics.team || "—"}</td><td>{item.statistics.legs_won}/{item.statistics.legs_played}</td><td>{decimal(item.statistics.average_3_darts)}</td><td>{item.statistics.best_finish ?? "—"}</td><td>{item.statistics.scores_180}</td><td>{item.statistics.scores_140}</td><td>{item.statistics.scores_100}</td></tr>)}
      </tbody></table></div>
      <p className="nakka-rule">Ces données proviennent uniquement des tournois importés et validés. Elles restent séparées du championnat officiel et de l’ELO.</p>
    </section>}
  </main></div>;
}
