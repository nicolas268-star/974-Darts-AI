import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, BookOpen, Info, Target } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import type { PlayerDashboard } from "@/lib/player/dashboard-types";
import { GUIDE_PLAYERS, KPI_GUIDE, guideSeason, publicGuideDashboard } from "@/lib/player/kpi-guide";
import "./kpi-guide.css";

export const metadata: Metadata = {
  title: "Comprendre les KPI du joueur",
  description: "Moyenne, First 9, finishes, scoring, ADN, réseau et Coach : définitions, calculs et exemples pour lire les statistiques d’un joueur.",
};

const number = (value: number | null | undefined, digits = 2) => value == null ? "—" : new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const periodLabel = (season: string) => season === "all" ? "Toute la carrière" : `Saison ${season}`;

async function loadExample(playerId: string, season: string): Promise<PlayerDashboard | null> {
  try {
    const backend = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";
    const response = await fetch(`${backend}/api/v1/players/${playerId}/dashboard?season_id=${encodeURIComponent(season)}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    return response.ok ? publicGuideDashboard(await response.json(), playerId, season) : null;
  } catch { return null; }
}

function Example({ player, data, season }: { player: (typeof GUIDE_PLAYERS)[number]; data: PlayerDashboard | null; season: string }) {
  const hasData = data?.meta.has_data === true && data.kpis.legs_played > 0;
  const kpis = hasData ? data.kpis : null;
  const openingDelta = kpis?.first_9 != null && kpis.average_3_darts != null ? kpis.first_9 - kpis.average_3_darts : null;
  return <article className="card kpi-example" data-example={player.id}>
    <header><span className="eyebrow">Cas concret · {player.label}</span><h3>{player.name}</h3><p>{periodLabel(season)}{hasData && data.player.team ? ` · ${data.player.team}` : ""}</p></header>
    {kpis && data ? <>
      <dl className="kpi-example-values">
        <div><dt>Moyenne 3 fléchettes</dt><dd>{number(kpis.average_3_darts)}</dd></div>
        <div><dt>First 9</dt><dd>{number(kpis.first_9)}</dd></div>
        <div><dt>Taux de legs gagnés</dt><dd>{number(kpis.win_rate, 1)} %</dd></div>
        <div><dt>Legs gagnés / joués</dt><dd>{kpis.legs_won} / {kpis.legs_played}</dd></div>
        <div><dt>Meilleur finish</dt><dd>{kpis.best_finish ?? "—"}</dd></div>
        <div><dt>Finish moyen</dt><dd>{number(kpis.average_finish, 1)}</dd></div>
      </dl>
      <div className="kpi-example-reading">
        <p><strong>Lire les résultats.</strong> {kpis.legs_won} ÷ {kpis.legs_played} × 100 = {number(kpis.win_rate, 1)} % de legs gagnés. C’est le taux en manches, pas en matchs.</p>
        <p><strong>Lire le démarrage.</strong> {openingDelta != null ? <>First 9 − moyenne = {openingDelta >= 0 ? "+" : ""}{number(openingDelta)} points. {openingDelta > 0 ? "Le début de leg est plus productif que la moyenne globale." : openingDelta < 0 ? "Le début de leg est moins productif que la moyenne globale." : "Les deux moyennes sont identiques à la précision affichée."} L’écart ne mesure pas les doubles.</> : "La comparaison First 9 / moyenne reste indisponible tant que les deux valeurs ne sont pas publiées."}</p>
        <p><strong>Lire les gros scores.</strong> {data.scoring.scores_100_plus} volées 100+, {data.scoring.scores_140_plus} volées 140+ et {data.scoring.scores_180} fois 180 pour {kpis.legs_played} legs observés. Les volumes doivent se lire avec ce nombre de legs et la couverture des imports.</p>
      </div>
    </> : <p className="kpi-example-empty">{data ? "Aucun leg exploitable publié pour cette période." : "Statistiques publiques indisponibles pour cette période. Réessayez plus tard ou choisissez une autre saison."} Les définitions du guide restent disponibles.</p>}
    <Link href={`/players/${player.id}?season=${season}`}>Ouvrir la fiche · {periodLabel(season)} <ArrowUpRight size={15} /></Link>
  </article>;
}

export default async function PlayerKpiGuidePage({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  const season = guideSeason((await searchParams).season);
  const examples = await Promise.all(GUIDE_PLAYERS.map(player => loadExample(player.id, season)));
  const [nico, alex] = examples;
  const comparison = nico?.meta.has_data && alex?.meta.has_data && nico.kpis.legs_played > 0 && alex.kpis.legs_played > 0 && nico.kpis.average_3_darts != null && alex.kpis.average_3_darts != null ? nico.kpis.average_3_darts - alex.kpis.average_3_darts : null;

  return <div className="dashboard"><Sidebar /><main className="stats-responsive main kpi-guide-page">
    <Link className="kpi-guide-back" href={`/players${season === "all" ? "" : `?season=${season}`}`}><ArrowLeft size={16} /> Retour aux joueurs</Link>
    <header className="card kpi-guide-hero">
      <span className="eyebrow"><BookOpen size={16} /> Le guide des statistiques</span>
      <h1>Comprendre les KPI<br /><span>de votre fiche joueur.</span></h1>
      <p>Que raconte votre moyenne ? Pourquoi deux indices ne donnent-ils pas le même score ? Les définitions, les calculs et les bons réflexes pour lire vos performances.</p>
      <div className="kpi-guide-pills"><span>Chiffres observés</span><span>Indices expliqués</span><a href="#exemples">Nico & Alex en pratique <ArrowUpRight size={14} /></a></div>
    </header>
    <aside className="kpi-guide-notice"><Info size={20} /><p><strong>Le bon réflexe : période → volume → chiffre.</strong> Comparez la même saison et regardez les legs joués. « — » signifie indisponible ; zéro signifie une valeur renvoyée, dont il faut vérifier la couverture. Les indices sur 100 sont des repères internes.</p></aside>

    <nav className="card kpi-guide-toc" aria-label="Sommaire du guide KPI">
      <h2>Que voulez-vous comprendre ?</h2>
      <div>{KPI_GUIDE.map((section, i) => <a key={section.id} href={`#${section.id}`}><span>{String(i + 1).padStart(2, "0")}</span>{section.title}</a>)}<a href="#exemples"><span>08</span>Les cas de Nico et Alex</a></div>
    </nav>

    {KPI_GUIDE.map((section, i) => <section className="kpi-guide-section" id={section.id} key={section.id} aria-labelledby={`heading-${section.id}`}>
      <header><span className="eyebrow">{String(i + 1).padStart(2, "0")} · Comprendre sa fiche</span><h2 id={`heading-${section.id}`}>{section.title}</h2><p>{section.intro}</p></header>
      <div className="kpi-guide-entry-grid">{section.entries.map(entry => <article className="card kpi-guide-entry" key={entry.title}>
        <h3>{entry.title}</h3><p>{entry.meaning}</p>
        <div className="kpi-guide-reading"><span>Comment le lire</span><p>{entry.reading}</p></div>
        {entry.limit && <p className="kpi-guide-limit"><strong>À garder en tête.</strong> {entry.limit}</p>}
        {entry.formula && <details><summary>Voir le calcul</summary><p>{entry.formula}</p></details>}
      </article>)}</div>
    </section>)}

    <section className="kpi-guide-section" id="exemples" aria-labelledby="heading-exemples">
      <header><span className="eyebrow">08 · À vous de lire les chiffres</span><h2 id="heading-exemples">Nico et Alex, en pratique</h2><p>Deux profils publics, la même période. Les valeurs viennent des statistiques publiées ; l’équipe indiquée correspond aux données de cette période. La saison 2026 est proposée au départ pour illustrer une saison passée, sans la mélanger avec 2027.</p></header>
      <nav className="kpi-example-seasons" aria-label="Période des exemples">{["2026", "2027", "2028", "2029", "all"].map(value => <Link aria-current={season === value ? "page" : undefined} href={`/players/kpi?season=${value}#exemples`} key={value}>{periodLabel(value)}</Link>)}</nav>
      <div className="kpi-example-grid">{GUIDE_PLAYERS.map((player, i) => <Example key={player.id} player={player} data={examples[i]} season={season} />)}</div>
      {comparison != null && <aside className="kpi-guide-notice"><Target size={20} /><p><strong>Comparer sans raccourci.</strong> Écart de moyenne Nico − Alex : {comparison >= 0 ? "+" : ""}{number(comparison)} points sur {periodLabel(season).toLowerCase()}. Nico a {nico!.kpis.legs_played} legs observés et Alex {alex!.kpis.legs_played}. Cet écart ne prédit pas le résultat d’un duel ; l’historique, les adversaires et le volume comptent aussi.</p></aside>}
    </section>

    <section className="card kpi-guide-bottom">
      <BookOpen size={25} /><div><h2>Un chiffre, puis une question utile.</h2><p>Moyenne : comment je produis ? Résultats : combien de legs je gagne ? Tendances : comment cela évolue ? Indices et Coach : quelle piste de travail regarder ?</p><p>Les données de finish sont des totaux de volée Nakka. Aucune route de checkout, tentative de double ou précision aux doubles n’est déduite sans donnée source.</p></div>
    </section>
  </main></div>;
}
