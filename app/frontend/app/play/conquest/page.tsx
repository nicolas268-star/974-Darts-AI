import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import { requireUser } from "@/lib/auth/session";
import { FunGame } from "@/components/play/FunGame";
import "../play-game-shared.css";
import "../fun-game.css";
import "./conquest.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Jouer à Conquête", description: "Conquérez un monde de 20 territoires + Bull et reliez vos positions pour gagner des points.", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ sync?: string }> }) {
  const sync = (await searchParams).sync === "1";
  const auth = await requireUser("/play/conquest" + (sync ? "?sync=1" : ""));
  return <div className="dashboard"><Sidebar /><main className="main fun-page"><FunGame key={auth.user!.id} userId={auth.user!.id} kind="conquest" currentDisplayName={auth.profile?.display_name ?? auth.user?.email ?? "Joueur 1"} /></main></div>;
}
