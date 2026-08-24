import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import { requireUser } from "@/lib/auth/session";
import { X01Game } from "./X01Game";
import "./x01.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Jouer au 501",
  description: "Compteur X01 974 Darts AI avec saisie rapide ou flèche par flèche.",
  robots: { index: false, follow: false },
};

export default async function Play501Page() {
  const auth = await requireUser();

  return (
    <div className="dashboard">
      <Sidebar />
      <main className="main x01-page">
        <X01Game
          currentPlayerId={auth.profile?.player_id ?? null}
          currentDisplayName={auth.profile?.display_name ?? auth.user?.email ?? "Joueur 1"}
        />
      </main>
    </div>
  );
}
