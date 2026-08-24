import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, MapPinned, Target, Trophy } from "lucide-react";
import "./reunion-seo.css";

export const metadata: Metadata = {
  title: "Fléchettes à La Réunion — clubs, championnat et tournois",
  description: "Découvrez les clubs, résultats, classements, tournois et événements de fléchettes à La Réunion (974).",
  alternates: { canonical: "/flechettes-la-reunion" },
};

export default function ReunionDartsPage() {
  return <main className="reunion-seo"><section className="reunion-seo-hero"><span>La communauté darts du 974</span><h1>Les fléchettes à La Réunion</h1><p>974 Darts rassemble au même endroit le championnat, les clubs réunionnais, les résultats Nakka, les tournois amicaux et les grands moments des joueurs.</p><div><Link href="/dashboard">Voir le classement</Link><Link href="/calendar">Consulter le calendrier</Link></div></section><section className="reunion-seo-grid"><article><Trophy/><h2>Championnat 974</h2><p>Classement officiel, rencontres, équipes et performances de la saison.</p><Link href="/competitions">Découvrir les compétitions →</Link></article><article><Target/><h2>Clubs et joueurs</h2><p>Kazadarts, PDC Fournaise, PDC Neige, TDC, 3BDC et les acteurs des fléchettes réunionnaises.</p><Link href="/teams">Voir les équipes →</Link></article><article><CalendarDays/><h2>Tournois et événements</h2><p>Retrouvez les rendez-vous, lieux et résultats des tournois amicaux de l’île.</p><Link href="/calendar">Ouvrir l’agenda →</Link></article><article><MapPinned/><h2>Une scène locale vivante</h2><p>Un portail créé à La Réunion pour rendre les darts locaux plus visibles et accessibles.</p><Link href="/records/180">Voir les records →</Link></article></section></main>;
}
