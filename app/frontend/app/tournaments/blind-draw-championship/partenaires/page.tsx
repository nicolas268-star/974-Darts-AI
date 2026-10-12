import type { Metadata } from "next";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { BdcPartnerAnalysis } from "@/components/BdcPartnerAnalysis";
import { analyzeBdcPartners, getBdcPartnerData } from "@/lib/bdc-partners";
import type { BdcPartnerPhase } from "@/lib/bdc-partners/types";
import "../../../competitions/competition-hub.css";
import "../bdc.css";
import "./partners.css";

export const metadata: Metadata = {
  title: "BDC · Analyse des partenaires",
  description: "Comparer ses partenaires du Blind Draw Championship : résultats corrigés, performances individuelles, scoring collectif et couverture des données.",
  alternates: { canonical: "/tournaments/blind-draw-championship/partenaires" },
};

type Query = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";

export default async function BdcPartnersPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const data = getBdcPartnerData();
  const playerId = first(query.player);
  const seasonValue = first(query.season);
  const season = /^\d{4}$/.test(seasonValue) ? Number(seasonValue) : data.rounds[0]?.season ?? 2027;
  const phaseValue = first(query.phase);
  const phase: BdcPartnerPhase = phaseValue === "all" || phaseValue === "finals" ? phaseValue : "pool";
  const rawRounds = query.rounds === undefined ? data.rounds.filter(round => round.season === season).map(round => String(round.number)) : (Array.isArray(query.rounds) ? query.rounds : [query.rounds]).flatMap(value => value.split(","));
  const rounds = [...new Set(rawRounds.filter(value => /^\d+$/.test(value)).map(Number))].filter(round => data.rounds.some(source => source.season === season && source.number === round)).sort((a, b) => a - b);
  const analysis = analyzeBdcPartners(playerId, { season, rounds, phase }, data);
  return <div className="dashboard"><Sidebar /><main className="stats-responsive main competition-page tournament-theme bdc-page bdc-partners-page"><Link className="hub-back" href="/tournaments/blind-draw-championship">← Retour au Blind Draw Championship</Link><BdcPartnerAnalysis data={data} analysis={analysis} requestedPlayer={playerId} left={first(query.left)} right={first(query.right)} /></main></div>;
}
