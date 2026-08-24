import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import { requireUser } from "@/lib/auth/session";
import { TicTacToeGame } from "./TicTacToeGame";
import "../play-game-shared.css";
import "./tictactoe.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tic Tac Toe Darts",
  description: "Tic Tac Toe 974 Darts AI en mode Normal ou Hard.",
  robots: { index: false, follow: false },
};

export default async function TicTacToePage() {
  const auth = await requireUser();
  return (
    <div className="dashboard">
      <Sidebar />
      <main className="main ttt-page">
        <TicTacToeGame currentDisplayName={auth.profile?.display_name ?? auth.user?.email ?? "Joueur 1"} />
      </main>
    </div>
  );
}
