import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Beaker, Clock3, FlaskConical, Target } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { cricketTestMatches } from "@/lib/cricket/test-match";
import "./cricket.css";
import "./cricket-lab.css";

export const metadata: Metadata = {
  title: "Laboratoire Cricket",
  description: "Zone expérimentale Cricket alimentée par les données Scolia.",
};

const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Indian/Reunion" });

function duration(seconds: number) {
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
}

export default function CricketPage() {
  return <div className="dashboard"><Sidebar /><main className="main cricket-page">
    <section className="cricket-lab-hero">
      <div className="cricket-lab-icon"><FlaskConical /></div>
      <div><span>Zone expérimentale · Working in progress</span><h1>Laboratoire Cricket</h1><p>Les parties et tournois Scolia sont regroupés ici, sans incidence sur le championnat, les points ou l’ELO.</p></div>
      <b>WIP</b>
    </section>

    <section className="cricket-library">
      <header><div><span>Historique Scolia</span><h2>Matchs et tournois</h2></div><p>{cricketTestMatches.length} partie{cricketTestMatches.length > 1 ? "s" : ""} disponible{cricketTestMatches.length > 1 ? "s" : ""}</p></header>
      <div className="cricket-match-list">
        {cricketTestMatches.map((match) => {
          const winner = match.players.find((player) => player.winner)!;
          const opponent = match.players.find((player) => !player.winner)!;
          return <Link className="cricket-match-row" href={`/cricket/${match.gameId}`} key={match.gameId}>
            <div className="cricket-match-date"><strong>{new Date(match.date).toLocaleDateString("fr-FR", { day: "2-digit", timeZone: "Indian/Reunion" })}</strong><span>{new Date(match.date).toLocaleDateString("fr-FR", { month: "short", timeZone: "Indian/Reunion" })}</span></div>
            <div className="cricket-match-main"><div><span>Match Cricket</span><small>{match.status}</small></div><h2>{winner.name} <b>{winner.legs}–{opponent.legs}</b> {opponent.name}</h2><p>{match.format}</p></div>
            <div className="cricket-match-meta"><span><Clock3 /> {duration(match.durationSeconds)}</span><span><Target /> {match.board}</span><small>{date.format(new Date(match.date))}</small></div>
            <strong className="cricket-open">Analyser <ArrowRight /></strong>
          </Link>;
        })}
      </div>
    </section>

    <aside className="cricket-wip-note"><Beaker /><div><strong>Fonction en construction</strong><p>Cette rubrique est volontairement placée en dernier et séparée des statistiques officielles. Les prochains imports Scolia enrichiront cette liste.</p></div></aside>
  </main></div>;
}
