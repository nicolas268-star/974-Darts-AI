import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import { requireUser } from "@/lib/auth/session";
import { CricketGame } from "./CricketGame";
import "../play-game-shared.css";
import "./cricket-game.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Jouer au Cricket",
  description: "Cricket 974 Darts AI : Basic, Cut Throat, Tactic et Magic.",
  robots: { index: false, follow: false },
};

export default async function PlayCricketPage() {
  const auth = await requireUser();
  return (
    <div className="dashboard">
      <Sidebar />
      <main className="main cricket-game-page">
        <CricketGame currentDisplayName={auth.profile?.display_name ?? auth.user?.email ?? "Joueur 1"} />
      </main>
    </div>
  );
}
