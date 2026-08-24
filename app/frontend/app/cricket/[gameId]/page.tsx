import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock3, Database, Trophy } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { cricketTestMatches, findCricketMatch } from "@/lib/cricket/test-match";
import { CricketAnalysis } from "./CricketAnalysis";
import "../cricket.css";
import "../cricket-lab.css";

export function generateStaticParams() { return cricketTestMatches.map((match) => ({ gameId: match.gameId })); }

export async function generateMetadata({ params }: { params: Promise<{ gameId: string }> }): Promise<Metadata> {
  const match = findCricketMatch((await params).gameId);
  return { title: match ? `Cricket · ${match.players[0].name} vs ${match.players[1].name}` : "Partie Cricket" };
}

export default async function CricketMatchPage({ params }: { params: Promise<{ gameId: string }> }) {
  const match = findCricketMatch((await params).gameId);
  if (!match) notFound();
  const winner = match.players.find((player) => player.winner)!;
  const opponent = match.players.find((player) => !player.winner)!;
  const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Indian/Reunion" }).format(new Date(match.date));
  return <div className="dashboard"><Sidebar /><main className="main cricket-page cricket-detail-page">
    <Link href="/cricket" className="cricket-back">← Retour à la liste Cricket</Link>
    <section className="cricket-detail-head"><div><span>Working in progress · Partie expérimentale</span><h1>Statistiques de jeu</h1></div><div className="cricket-detail-summary"><b>{match.format}</b><span>{date}</span><span><Clock3 /> {Math.floor(match.durationSeconds / 60)} min {match.durationSeconds % 60} s</span><span><Database /> {match.board}</span></div><div className="cricket-detail-score"><small>Résultat</small><strong>{winner.name} {winner.legs}–{opponent.legs} {opponent.name}</strong><span><Trophy /> {winner.name}</span></div></section>
    <CricketAnalysis match={match} />
    <aside className="cricket-wip-note"><Database /><div><strong>Analyse issue des coordonnées Scolia</strong><p>Chaque point de chaleur correspond à une fléchette réellement détectée. Cette page reste isolée des statistiques officielles de 974 Darts.</p></div></aside>
  </main></div>;
}
