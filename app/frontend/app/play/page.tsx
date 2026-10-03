import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { SavedGames } from "@/components/play/SavedGames";
import { ArrowUpRight, Crosshair, Gamepad2, Target, Trophy } from "lucide-react";
import "./play-hub.css";

export const metadata: Metadata = { title: "Univers Jeux", description: "Choisissez votre partie de fléchettes : X01, Cricket, jeux entre amis et entraînement." };

const universes = [
  { id: "competition", label: "01 · MATCHS", title: "Match & compétition", description: "Retrouvez vos repères de match : règles, scores et ordre de passage.", icon: Trophy, tone: "gold",
    games: [
      { href: "/play/501", name: "301 · 501 · 701", tag: "1–4 joueurs · 2 vs 2", text: "Total de la volée ou fléchette par fléchette. Double In / Out, legs et sessions à reprendre." },
      { href: "/play/cricket", name: "Cricket", tag: "1–4 joueurs · 2 vs 2", text: "Basic, Tactic ou Magic. Points Standard ou Cut Throat, trois fléchettes bien visibles." },
    ] },
  { id: "fun", label: "02 · ENTRE AMIS", title: "Jeux fun", description: "Une cible traditionnelle, des défis et le plaisir de jouer ensemble.", icon: Gamepad2, tone: "violet",
    games: [
      { href: "/play/dart-chess", name: "Dart Chess", tag: "Battle · 2 joueurs · même écran", text: "La stratégie des échecs, la précision des fléchettes. Gagnez vos captures puis terminez au King Checkout." },
      { href: "/play/connect4", name: "Puissance 4", tag: "1–4 joueurs · 2 vs 2", text: "Visez une colonne, posez votre pion et alignez-en quatre. Mode libre ou doubles uniquement." },
      { href: "/play/conquest", name: "Conquête", tag: "Monde stratégique · 1–4 joueurs", text: "20 territoires + Bull. Reliez et défendez vos conquêtes, ou jouez Ultra avec des finishes 501 de 2 à 78." },
      { href: "/play/bull500", name: "Bull 500", tag: "1–4 joueurs · 2 vs 2", text: "Débloquez le score au Bull à chaque volée, puis marquez sur le 20 ou le 19. Objectif : 500." },
      { href: "/play/tictactoe", name: "Morpion", tag: "1–4 joueurs · 2 vs 2", text: "Gagnez des cases et alignez-en trois. Grille renouvelée, mode Normal ou Hard." },
    ] },
  { id: "training", label: "03 · PROGRESSION", title: "Entraînement", description: "Travaillez votre précision en solo ou lancez un défi à plusieurs.", icon: Crosshair, tone: "mint",
    games: [
      { href: "/play/bob27", name: "Bob’s 27", tag: "Solo · jusqu’à 4 joueurs", text: "Trois fléchettes par double, de D1 à D20. Chaque réussite et chaque raté comptent." },
      { href: "/play/clock", name: "Tour de l’horloge", tag: "Simple · Double · Triple", text: "Progressez de 1 à 20 avec le niveau de précision de votre choix." },
    ] },
];

export default async function PlayHubPage() {
  const auth = await getCurrentUser();
  return <main className="play-hub">
    <section className="play-hub-hero">
      <div><span className="play-hub-kicker">974DARTS · À VOUS DE JOUER</span><h1>Univers <em>Jeux</em></h1><p>Un match sérieux, un défi entre amis ou une séance pour progresser. Choisissez votre terrain de jeu.</p>
        <div className="play-hub-actions"><Link className="play-hub-primary" href="/play/501"><Target size={18} />Jouer au 501</Link><Link href="#parties">Retrouver mes parties →</Link></div>
      </div>
      <div className="play-hub-roundel" aria-hidden="true"><Target /><b>3</b><span>FLÉCHETTES.<br />À VOUS DE JOUER.</span></div>
    </section>
    {auth.user ? <SavedGames key={auth.user.id} userId={auth.user.id} /> : <section id="parties" className="play-saved"><h2>Retrouver mes parties</h2><p><Link href="/login?next=%2Fplay">Connectez-vous</Link> pour jouer et retrouver vos parties sur ce navigateur.</p></section>}
    <nav className="play-universe-nav" aria-label="Choisir un univers">{universes.map((item) => <a key={item.id} href={"#" + item.id}><item.icon size={18} />{item.title}</a>)}</nav>
    <div className="play-universe-grid">{universes.map((universe) => <section id={universe.id} key={universe.id} className={"play-universe " + universe.tone}>
      <header><universe.icon aria-hidden="true" /><small>{universe.label}</small><h2>{universe.title}</h2><p>{universe.description}</p></header>
      <div className="play-universe-games">{universe.games.map((game) => <Link key={game.href} href={game.href} className="play-universe-game"><small>{game.tag}</small><h3>{game.name}<ArrowUpRight size={20} /></h3><p>{game.text}</p><span>Choisir les joueurs et jouer →</span></Link>)}</div>
    </section>)}</div>
    <section className="play-hub-guide" aria-label="Comment jouer"><div><b>01</b><span>Choisis ton jeu</span></div><div><b>02</b><span>Configure tes joueurs</span></div><div><b>03</b><span>Lance et saisis tes scores</span></div></section>
    <section className="play-tools-section"><div><small>ANALYSE</small><h2>Cricket Lab</h2><p>Explorez les données Cricket et les analyses de matchs.</p></div><Link href="/cricket">Ouvrir le laboratoire <ArrowUpRight size={18} /></Link></section>
  </main>;
}
