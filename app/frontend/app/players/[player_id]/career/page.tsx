import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { PlayerCareer } from "@/components/player/PlayerCareer";
import type { PlayerCareerResponse } from "@/lib/player/identity-types";
import "./player-career.css";

const backend = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";

async function getCareer(playerId: string): Promise<PlayerCareerResponse | null> {
  try {
    const response = await fetch(`${backend}/api/v1/identities/${playerId}/career`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
}

export default async function CareerPage({ params }: { params: Promise<{ player_id: string }> }) {
  const { player_id } = await params;
  const data = await getCareer(player_id);
  if (!data) notFound();

  return <div className="dashboard"><Sidebar/><main className="main">
    <Link href={`/players/${player_id}`} className="back-link"><ArrowLeft size={17}/> Retour à la fiche joueur</Link>
    <PlayerCareer data={data}/>
  </main></div>;
}
