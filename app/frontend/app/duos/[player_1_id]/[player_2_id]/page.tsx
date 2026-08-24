import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { DuoDetailDashboard } from "@/components/duo/DuoDetailDashboard";
import type { DuoDashboardResponse } from "@/lib/duo/types";

const backend = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";

async function getDuo(player1: string, player2: string): Promise<DuoDashboardResponse | null> {
  try {
    const response = await fetch(`${backend}/api/v1/duos/${encodeURIComponent(player1)}/${encodeURIComponent(player2)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`API duo: ${response.status}`);
    return await response.json() as DuoDashboardResponse;
  } catch (error) {
    console.error("Impossible de charger la fiche duo", error);
    return null;
  }
}

export default async function DuoDetailPage({ params }: { params: Promise<{ player_1_id: string; player_2_id: string }> }) {
  const { player_1_id, player_2_id } = await params;
  const data = await getDuo(player_1_id, player_2_id);
  if (!data) notFound();

  return <div className="dashboard"><Sidebar/><main className="main duo-detail-page duo-synergy-theme">
    <Link href="/duos" className="back-link"><ArrowLeft size={17}/> Retour au classement des duos</Link>
    <DuoDetailDashboard data={data}/>
  </main></div>;
}
