import { playerCardEnabled } from "@/lib/player-card/feature";
import { CardSourceError, loadCard } from "@/lib/player-card/server";
import { parseSeason } from "@/lib/player-card/data";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ player_id: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!playerCardEnabled()) return Response.json({ error: "Fonctionnalité indisponible." }, { status: 404, headers });
  const { player_id } = await params;
  let season: string | undefined;
  try { season = parseSeason(new URL(request.url).searchParams.get("season")); }
  catch { return Response.json({ error: "Période invalide." }, { status: 400, headers }); }
  try { return Response.json(await loadCard(player_id, season), { headers }); }
  catch (error) { return Response.json({ error: error instanceof CardSourceError ? error.message : "Statistiques indisponibles. Réessayez." }, { status: error instanceof CardSourceError ? error.status : 503, headers }); }
}
