import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PlayerCardStudio from "@/components/player-card/PlayerCardStudio";
import { playerCardEnabled } from "@/lib/player-card/feature";
import { parseSeason } from "@/lib/player-card/data";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ma carte joueur", robots: { index: false, follow: false } };
export default async function PlayerCardPage({ params, searchParams }: { params: Promise<{ player_id: string }>; searchParams: Promise<{ season?: string }> }) {
  if (!playerCardEnabled()) notFound();
  const { player_id } = await params;
  let season: string | undefined;
  try { season = parseSeason((await searchParams).season); } catch { notFound(); }
  const configuredLimit = Number(process.env.PLAYER_CARD_MAX_PHOTO_MB ?? 10);
  const maxPhotoBytes = (Number.isFinite(configuredLimit) && configuredLimit >= 1 && configuredLimit <= 20 ? configuredLimit : 10) * 1024 * 1024;
  return <PlayerCardStudio playerId={player_id} season={season} maxPhotoBytes={maxPhotoBytes}/>;
}
