import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import { requireUser } from "@/lib/auth/session";
import { X01Game } from "./X01Game";
import "./x01.css";
import "../play-game-shared.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Jouer au 501",
  description: "Compteur X01 974 Darts AI avec saisie rapide ou flèche par flèche.",
  robots: { index: false, follow: false },
};

export default async function Play501Page({ searchParams }: { searchParams: Promise<{ session?: string; view?: string }> }) {
  const params = await searchParams;
  const code = typeof params.session === "string" ? params.session.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) : "";
  const returnTo = "/play/501" + (code.length === 6 ? "?session=" + code + (params.view === "screen" ? "&view=screen" : "") : "");
  const auth = await requireUser(returnTo);

  return (
    <div className="dashboard">
      <Sidebar />
      <main className="main x01-page">
        <X01Game
          currentUserId={auth.user!.id}
          currentPlayerId={auth.profile?.player_id ?? null}
          currentDisplayName={auth.profile?.display_name ?? auth.user?.email ?? "Joueur 1"}
        />
      </main>
    </div>
  );
}
