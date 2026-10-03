import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import { requireUser } from "@/lib/auth/session";
import { DartChessGame } from "./DartChessGame";
import "../play-game-shared.css";
import "./dart-chess.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dart Chess · Battle", description: "Échecs et fléchettes : deux joueurs, des captures à gagner et un King Checkout.", robots: { index: false, follow: false } };
export default async function DartChessPage() {
  const auth = await requireUser("/play/dart-chess");
  return <div className="dashboard"><Sidebar /><main className="main dc-page"><DartChessGame key={auth.user!.id} userId={auth.user!.id} currentDisplayName={auth.profile?.display_name ?? "Blancs"} /></main></div>;
}
