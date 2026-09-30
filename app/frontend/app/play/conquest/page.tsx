import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import { requireUser } from "@/lib/auth/session";
import { FunGame } from "@/components/play/FunGame";
import "../play-game-shared.css";
import "../fun-game.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Jouer à Conquête", description: "Prenez et reprenez les territoires en solo ou entre amis.", robots: { index: false, follow: false } };

export default async function Page() {
  const auth = await requireUser();
  return <div className="dashboard"><Sidebar /><main className="main fun-page"><FunGame key={auth.user!.id} userId={auth.user!.id} kind="conquest" currentDisplayName={auth.profile?.display_name ?? auth.user?.email ?? "Joueur 1"} /></main></div>;
}
