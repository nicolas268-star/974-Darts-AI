import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function PlayerPage() {
  const auth = await requireUser();

  // L'administrateur arrive dans son espace de gestion. Cette redirection ne
  // dépend d'aucun identifiant joueur et reste donc valide après une fusion.
  if (auth.profile?.role === "ADMIN") {
    redirect("/admin");
  }

  // Un joueur ou un capitaine est envoyé vers la fiche réellement associée à
  // son profil Supabase, jamais vers un UUID codé en dur.
  const playerId = auth.profile?.player_id?.trim();
  if (playerId) {
    redirect(`/players/${encodeURIComponent(playerId)}`);
  }

  // Un compte authentifié sans joueur lié conserve un accès sûr à l'annuaire.
  redirect("/players");
}
