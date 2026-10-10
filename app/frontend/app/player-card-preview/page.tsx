import { notFound } from "next/navigation";
import PlayerCardStudio from "@/components/player-card/PlayerCardStudio";
import { playerCardPreviewEnabled } from "@/lib/player-card/feature";
import { DEMO_CARD } from "@/lib/player-card/fixture";
import type { CardPayload } from "@/lib/player-card/types";
import "@/components/player-card/player-card.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "Démonstration Player Card", robots: { index: false, follow: false } };
export default async function CardPreview({ searchParams }: { searchParams: Promise<{ view?: string; partial?: string; long?: string }> }) {
  if (!playerCardPreviewEnabled()) notFound();
  const query = await searchParams;
  if (query.view === "profile") return <main className="pc-fixture-profile"><p>PROFIL DE DÉMONSTRATION</p><h1>NICO</h1><h2>DataMan</h2><p>Papangue Dart Club · PDC La Fournaise</p><p>Historique partagé — période à préciser</p><div className="pc-fixture-stats"><div>Moyenne<strong>43,14</strong></div><div>Finish<strong>104</strong></div><div>Legs gagnés<strong>46,0 %</strong>40 / 87</div></div><a href="/player-card-preview">Créer ma carte</a><p>Statistiques de démonstration — à actualiser</p></main>;
  const data = structuredClone(DEMO_CARD);
  if (query.partial === "1") { data.team = null; data.club = null; data.nickname = null; data.stats = { ...data.stats, average: null, won: 0, played: 0, first9: null, bestAverage: null, scores100: 0, scores140: null }; }
  if (query.long === "1") { data.name = "Jean-François Éléonore de Saint-Pierre"; data.club = "Association sportive des passionnés de fléchettes traditionnelles de La Réunion"; data.team = "Les joueurs de la côte ouest — Équipe première"; }
  const initial: CardPayload = { data, theme: "fournaise", selectedSeason: "demo", seasons: [{ value: "demo", label: data.period }] };
  return <PlayerCardStudio initial={initial}/>;
}
