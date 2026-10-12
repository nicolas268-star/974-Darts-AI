import Link from "next/link";
import { bdcSeasonAffiliation } from "@/lib/bdc-profile-links";
import type {
  BdcPartnerAnalysis as Analysis,
  BdcPartnerFilters,
  MetricCoverage,
  PartnerAnalysis,
  PartnerConclusion,
  PartnerData,
  PartnerPlayer,
  PartnerReference,
  PartnerStats,
} from "@/lib/bdc-partners/types";

const PATH = "/tournaments/blind-draw-championship/partenaires";
const PHASE_LABELS = { pool: "Matchs de poule", all: "Toutes les phases", finals: "Phase finale" } as const;
const number = (value: number | null | undefined, digits = 2) => value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits });
const count = (value: number | null | undefined) => number(value, 0);
const percent = (value: number | null | undefined) => value == null ? "—" : `${number(value, 1)} %`;
const date = (value: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
const coverageText = (coverage: MetricCoverage) => `${coverage.matches}/${coverage.totalMatches} matchs enregistrés · ${coverage.completeMatches} complets · ${coverage.recordedLegs} legs enregistrés`;
const roundsText = (rounds: number[]) => rounds.map(round => `M${round}`).join(" + ") || "Aucune manche";

type Props = { data: PartnerData; analysis: Analysis; requestedPlayer: string; left: string; right: string };

function FiltersHidden({ playerId, filters }: { playerId: string; filters: BdcPartnerFilters }) {
  return <>
    <input type="hidden" name="player" value={playerId} />
    <input type="hidden" name="season" value={filters.season} />
    <input type="hidden" name="phase" value={filters.phase} />
    <input type="hidden" name="rounds" value="" />
    {filters.rounds.map(round => <input type="hidden" name="rounds" value={round} key={round} />)}
  </>;
}

function partnerHref(playerId: string, filters: BdcPartnerFilters, left: string, right = "") {
  const query = new URLSearchParams({ player: playerId, season: String(filters.season), phase: filters.phase, rounds: filters.rounds.join(","), left });
  if (right) query.set("right", right);
  return `${PATH}?${query.toString()}#comparaison`;
}

function Affiliation({ player, season }: { player: PartnerPlayer; season: number }) {
  const affiliation = bdcSeasonAffiliation(player.id, season);
  return <span>{affiliation ? `${affiliation.club} · ${affiliation.team}` : "Club et équipe de saison non renseignés"}</span>;
}

function Metric({ label, value, definition, volume, coverage, metric }: { label: string; value: string; definition: string; volume?: string; coverage?: MetricCoverage; metric?: string }) {
  return <div className="bp-metric" data-metric={metric}>
    <details>
      <summary>{label} <span className="sr-only"> : définition et limites</span></summary>
      <p>{definition}</p>
      {coverage ? <p>{coverageText(coverage)}.{coverage.partial ? " Statistiques partielles : seuls les lancers enregistrés sont utilisés." : ""}</p> : null}
      {volume ? <p>{volume}.</p> : null}
      <p><Link href="/players/kpi#doublettes-bdc">Voir la méthode des doublettes →</Link></p>
    </details>
    <strong>{value}</strong>
    {coverage ? <small>{coverage.matches}/{coverage.totalMatches} matchs · {coverage.completeMatches} complets</small> : volume ? <small>{volume}</small> : null}
    {value === "—" ? <small>Donnée ou dénominateur indisponible.</small> : null}
  </div>;
}

function Conclusion({ conclusion, partners }: { conclusion: PartnerConclusion; partners: PartnerAnalysis[] }) {
  const winners = partners.filter(partner => conclusion.partnerIds.includes(partner.partner.id));
  return <article className="bp-conclusion" data-criterion={conclusion.criterion}>
    <span>{conclusion.title}</span>
    <strong>{conclusion.status === "single-partner" ? "Une seule association observée" : winners.length ? winners.map(item => item.partner.name).join(" / ") : "Données insuffisantes pour départager"}</strong>
    {conclusion.status === "available" ? winners.map(winner => <p key={winner.pairKey}>
      {winners.length > 1 ? `${winner.partner.name} : ` : ""}
      {conclusion.criterion === "results" ? conclusion.metric === "legWinRate" ? `${count(winner.result.legsWon)}/${count((winner.result.legsWon ?? 0) + (winner.result.legsLost ?? 0))} legs gagnés · ${percent(winner.result.legWinRate)} · ${winner.result.wins}/${winner.result.knownMatches} matchs gagnés (${percent(winner.result.winRate)})` : `${winner.result.wins}/${winner.result.knownMatches} matchs gagnés · ${percent(winner.result.winRate)} (critère matchs)` : `Moyenne 3 fléchettes : ${number(conclusion.value)}${conclusion.criterion === "individual" ? ` · First 9 : ${number(winner.playerStats.first9)}` : ""}`}.
      {conclusion.criterion === "individual" ? winner.playerReference.difference == null ? " Référence avec les autres partenaires indisponible." : ` Écart : ${winner.playerReference.difference > 0 ? "+" : ""}${number(winner.playerReference.difference)} points vs ${number(winner.playerReference.average3)} avec les autres (${winner.playerReference.matches} matchs, ${count(winner.playerReference.darts)} fléchettes).` : ""}
    </p>) : null}
    {winners.length > 1 ? <p>Ex æquo : aucun départage.</p> : null}
    <p>{conclusion.explanation}</p>
    {winners.length ? <p>{winners.map(item => `${item.partner.name} : ${item.evenings} soirée${item.evenings > 1 ? "s" : ""}, ${conclusion.criterion === "results" ? `${item.result.knownMatches}/${item.result.matches} résultats connus` : coverageText(conclusion.criterion === "collective" ? item.duoStats.coverage : item.playerStats.coverage.average3)}`).join(" ; ")}. <a href="#partenaires">Voir les volumes →</a></p> : null}
  </article>;
}

function Reference({ reference, current, label }: { reference: PartnerReference; current: PartnerStats; label: string }) {
  const difference = reference.difference;
  return <div className="bp-reference">
    <p><strong>{label}</strong></p>
    {reference.average3 == null || difference == null ? <p>Référence indisponible : aucune autre association avec des lancers exploitables sur ces filtres.</p> : <>
      <p>{number(current.average3)} avec ce partenaire ; {number(reference.average3)} avec les autres. Écart observé : {difference > 0 ? "+" : ""}{number(difference)} points.</p>
      <small>Association affichée : {current.coverage.average3.matches} matchs, {count(current.darts)} fléchettes. Autres associations : {reference.matches} matchs ({reference.completeMatches} complets), {count(reference.darts)} fléchettes, {reference.evenings} soirée{reference.evenings > 1 ? "s" : ""}. Même saison, mêmes manches et même phase ; paire actuelle exclue.</small>
    </>}
    <p className="bp-note">Un écart descriptif, sans isoler l’effet du partenaire.</p>
  </div>;
}

function IndividualStats({ stats, name, label, reference }: { stats: PartnerStats; name: string; label: string; reference: PartnerReference }) {
  return <section>
    <h4>{label} · {name}</h4>
    <div className="bp-metric-grid">
      <Metric metric="average3" label="Moyenne 3 fléchettes" value={number(stats.average3)} definition="3 × points réellement crédités / fléchettes comptabilisées. Les points et fléchettes sont additionnés avant le calcul, sans moyenner les moyennes des matchs." coverage={stats.coverage.average3} volume={`${count(stats.score)} points / ${count(stats.darts)} fléchettes`} />
      <Metric label="First 9 individuel" value={number(stats.first9)} definition="Moyenne pondérée des neuf premières fléchettes disponibles de ce joueur dans chaque leg. Ce n’est pas le First 9 brut Nakka du duo." coverage={stats.coverage.first9} volume={`${count(stats.first9Score)} points / ${count(stats.first9Darts)} fléchettes de début de leg`} />
    </div>
    <details className="bp-disclosure"><summary>Scoring, finishes et variabilité · {name}</summary><div>
      <div className="bp-metric-grid">
        <Metric label="Grosses volées 100+" value={count(stats.visits100Plus)} definition="Somme des catégories exclusives 100–139, 140–169, 170–179 et 180 ; aucune volée n’est comptée deux fois." coverage={stats.coverage.highVisits} volume={`${count(stats.visits)} volées réellement conservées`} />
        <Metric label="100+ pour 100 volées" value={number(stats.frequency100Plus)} definition="100 × volées 100+ / nombre réel de volées. Le nombre de volées n’est pas déduit des fléchettes / 3, car une dernière volée peut être incomplète." coverage={stats.coverage.frequency100Plus} />
        <Metric label="Finishes enregistrés" value={count(stats.finishCount)} definition="Nombre de sorties effectivement enregistrées et attribuées au joueur. Les sorties absentes des feuilles restent inconnues. La part des finishes n’est pas un taux de réussite aux doubles." coverage={stats.coverage.finishes} />
        <Metric label="Meilleur finish enregistré" value={count(stats.bestFinish)} definition="Plus grande valeur parmi les finishes enregistrés de cette association sur les filtres retenus. Aucun record n’est extrapolé aux legs manquants." coverage={stats.coverage.finishes} />
        <Metric label="Dispersion des moyennes par match" value={number(stats.dispersion.value)} definition="Écart type des moyennes par match, pondéré par les fléchettes. Disponible à partir de trois matchs statistiquement complets ; ne mesure pas la régularité volée par volée." coverage={stats.coverage.dispersion} volume={`${stats.dispersion.matches} matchs complets / ${count(stats.dispersion.darts)} fléchettes`} />
        <Metric label="Réussite aux doubles" value={percent(stats.checkoutPercent)} definition="Un vrai checkout % demande le nombre fiable de tentatives aux doubles. Sans ce dénominateur, la mesure reste indisponible." coverage={stats.coverage.checkoutPercent} />
      </div>
      <dl className="bp-metrics-list">
        <div><dt>100–139 / 140–169</dt><dd>{count(stats.visits100)} / {count(stats.visits140)}</dd></div>
        <div><dt>170–179 / 180</dt><dd>{count(stats.visits170)} / {count(stats.visits180)}</dd></div>
        <div><dt>Tours sans score enregistrés</dt><dd>{count(stats.zeroVisits)}</dd></div>
        <div><dt>Points / fléchettes enregistrés</dt><dd>{count(stats.score)} / {count(stats.darts)}</dd></div>
      </dl>
      <p>Un tour sans score ne prouve ni un bust, ni une tentative de double manquée.</p>
      <Reference reference={reference} current={stats} label="Avec mes autres partenaires BDC" />
      {stats.finishes.length ? <details className="bp-disclosure"><summary>Valeurs et provenance des finishes</summary><div><ul className="bp-list">{stats.finishes.map((finish, index) => <li key={`${finish.matchId}-${finish.leg}-${index}`}>{finish.value} · {finish.leg == null ? "leg non renseigné" : `leg ${finish.leg}`} · {finish.darts == null ? "fléchettes indisponibles" : `${finish.darts} fléchette${finish.darts > 1 ? "s" : ""}`} · <a href={`#bdc-match-${finish.matchId}`}>match {finish.matchId}</a></li>)}</ul></div></details> : <p>{stats.finishCount === 0 ? "Aucun finish dans les lancers enregistrés." : "Finishes indisponibles sur ce périmètre."}</p>}
    </div></details>
  </section>;
}

function Bars({ title, rows }: { title: string; rows: { name: string; value: number | null }[] }) {
  const max = Math.max(...rows.map(row => row.value ?? 0), 1);
  return <div className="bp-bars" role="group" aria-label={title}>
    {rows.map((row, index) => <div key={row.name} className={`bp-bar${index ? " is-partner" : ""}`}><span>{row.name}</span><div className="bp-bar-track" aria-hidden="true"><i style={{ width: `${row.value == null ? 0 : Math.min(100, row.value / max * 100)}%` }} /></div><b>{number(row.value)}</b></div>)}
  </div>;
}

function Split({ title, playerName, partnerName, player, partner }: { title: string; playerName: string; partnerName: string; player: number | null; partner: number | null }) {
  const total = player == null || partner == null ? null : player + partner;
  const share = total ? player! / total * 100 : null;
  return <div role="group" aria-label={title}>
    <h4>{title}</h4>
    {share == null ? <p className="bp-note">Répartition indisponible : données communes ou dénominateur manquants.</p> : <>
      <div className="bp-split" aria-hidden="true"><span style={{ width: `${share}%` }} /><span style={{ width: `${100 - share}%` }} /></div>
      <div className="bp-split-legend"><span>Moi · {playerName} : {count(player)} ({percent(share)})</span><span>Partenaire · {partnerName} : {count(partner)} ({percent(100 - share)})</span></div>
    </>}
  </div>;
}

function MatchEvolution({ partner }: { partner: PartnerAnalysis }) {
  if (!partner.chronological || partner.matches.length < 2 || partner.matches.some(item => item.match.startedAt == null)) return null;
  const ordered = [...partner.matches].sort((a, b) => a.match.startedAt! - b.match.startedAt!);
  const max = Math.max(...ordered.flatMap(item => [item.playerAverage3 ?? 0, item.partnerAverage3 ?? 0]), 1);
  return <details className="bp-disclosure"><summary>Évolution des moyennes · ordre des rencontres confirmé</summary><div>
    <p>Ordre issu des horaires de début conservés dans la source. Les barres comparent les moyennes de chaque rencontre ; elles ne mesurent pas une régularité volée par volée.</p>
    <div className="bp-match-evolution">{ordered.map((item, index) => <div key={item.match.id} className="bp-match-evolution-item">
      <a href={`#bdc-match-${item.match.id}`}>Rencontre {index + 1} · {item.opponents}</a>
      {[{ name: `Moi · ${partner.player.name}`, value: item.playerAverage3 }, { name: `Partenaire · ${partner.partner.name}`, value: item.partnerAverage3 }].map((row, rowIndex) => <div key={row.name} className={`bp-bar${rowIndex ? " is-partner" : ""}`}><span>{row.name}</span><div className="bp-bar-track" aria-hidden="true"><i style={{ width: `${row.value == null ? 0 : row.value / max * 100}%` }} /></div><b>{number(row.value)}</b></div>)}
    </div>)}</div>
  </div></details>;
}

function MatchDetails({ partner }: { partner: PartnerAnalysis }) {
  return <details className="bp-disclosure"><summary>{partner.matches.length} rencontres · résultats, lancers et sources</summary><div>
    <p>Résultats corrigés et lancers conservés sont distincts. {partner.chronological ? "L’ordre temporel est connu dans la source." : "L’ordre chronologique n’est pas confirmé pour tout ce périmètre : les rencontres sont identifiées sans courbe d’évolution."}</p>
    <div className="bp-match-list">{partner.matches.map(item => <article className="bp-match" id={`bdc-match-${item.match.id}`} key={item.match.id}>
      <div className="bp-match-head"><span>M{item.match.round} · {item.match.phaseLabel} · {item.opponents}</span><strong>{count(item.ownScore)} – {count(item.opponentScore)} {item.match.scoreUnit === "sets" ? "sets" : "legs"}</strong></div>
      <small>{item.result === "win" ? "Victoire" : item.result === "loss" ? "Défaite" : item.result === "draw" ? "Égalité" : "Résultat indisponible"} · {date(item.match.date)} · {item.match.recordedLegs} legs enregistrés{item.match.officialLegs == null ? " · total de legs officiel indisponible" : ` / ${item.match.officialLegs} officiels`} · {item.match.statisticsComplete ? "statistiques complètes" : "statistiques partielles ou indisponibles"}</small>
      <small>Moi : {number(item.playerAverage3)} · Partenaire : {number(item.partnerAverage3)} · Duo : {number(item.duoAverage3)} (moyennes 3 fléchettes).</small>
      <small>Points / fléchettes : moi {count(item.playerStats?.score)}/{count(item.playerStats?.darts)} ; partenaire {count(item.partnerStats?.score)}/{count(item.partnerStats?.darts)}.</small>
      <small>Match {item.match.id} · {item.match.sourceStatus} · <a href={item.match.sourceUrl} target="_blank" rel="noopener noreferrer">Source publique Nakka ↗</a></small>
    </article>)}</div>
    <p>Les scores en sets restent des sets et ne sont jamais additionnés aux legs.</p>
  </div></details>;
}

function DuoCard({ partner, slot }: { partner: PartnerAnalysis; slot: string }) {
  const result = partner.result;
  const duo = partner.duoStats;
  return <article className="bp-duo-card" data-testid="partner-card" data-partner-id={partner.partner.id}>
    <header className="bp-duo-header"><div><span className="bp-duo-label">{slot} · Notre duo</span><h3>{partner.player.name} + {partner.partner.name}</h3><span className="bp-note">{roundsText(partner.rounds)} · {partner.evenings} soirée{partner.evenings > 1 ? "s" : ""}</span></div></header>
    <p className="bp-volume">{partner.dates.map(date).join(" · ")}<br /><Affiliation player={partner.partner} season={partner.matches[0]?.match.season ?? partner.roundResults[0]?.season ?? 2027} /></p>
    <div className="bp-metric-grid">
      <Metric metric="duo-average3" label="Moyenne 3 fléchettes du duo" value={number(duo.average3)} definition="3 × (points des deux membres) / (fléchettes des deux membres), uniquement sur le même périmètre enregistré pour tous les deux. Ce n’est pas la moyenne arithmétique de leurs moyennes." coverage={duo.coverage} volume={`${count(duo.score)} points / ${count(duo.darts)} fléchettes`} />
      <Metric label="Matchs gagnés" value={result.winRate == null ? "—" : `${result.wins}/${result.knownMatches} · ${percent(result.winRate)}`} definition="Victoires / rencontres avec résultat sportif connu. Les résultats corrigés priment sur les scores Nakka interrompus ; les pourcentages de manches ne sont pas moyennés." volume={result.matches ? `${result.matches} matchs disputés ; ${result.losses} défaites, ${result.draws} égalités` : "Aucun match dans cette phase"} />
      <Metric label="Legs gagnés" value={result.legWinRate == null ? "—" : `${count(result.legsWon)}/${count((result.legsWon ?? 0) + (result.legsLost ?? 0))} · ${percent(result.legWinRate)}`} definition="Legs gagnés / (gagnés + perdus) sur les résultats en legs connus. Un score en sets ne contribue pas au dénominateur. Si tous les matchs ne sont pas comparables, la conclusion sportive utilise explicitement les matchs." volume={`${result.legMatches} matchs en legs connus ; ${result.unknownLegMatches} scores en sets ou indisponibles`} />
      <Metric label="Couverture des lancers" value={`${partner.coverage.matches}/${partner.coverage.totalMatches} matchs`} definition="Un match couvert comporte des lancers attribués aux deux joueurs. Un match couvert peut rester incomplet. Les legs enregistrés, matchs complets et soirées sont trois volumes distincts." coverage={partner.coverage} />
    </div>
    <IndividualStats stats={partner.playerStats} name={partner.player.name} label="Moi avec ce partenaire" reference={partner.playerReference} />
    <IndividualStats stats={partner.partnerStats} name={partner.partner.name} label="Mon partenaire avec moi" reference={partner.partnerReference} />
    <details className="bp-disclosure"><summary>Notre duo · démarrage et répartition</summary><div>
      <h4>Démarrage · First 9 individuel</h4>
      <Bars title="First 9 individuel des deux joueurs" rows={[{ name: `Moi · ${partner.player.name}`, value: partner.playerStats.first9 }, { name: `Partenaire · ${partner.partner.name}`, value: partner.partnerStats.first9 }]} />
      <h4>Scoring individuel sur le même périmètre que le duo</h4>
      <Bars title="Moyennes sur les matchs communs" rows={[{ name: `Moi · ${partner.player.name}`, value: duo.playerAverage3 }, { name: `Partenaire · ${partner.partner.name}`, value: duo.partnerAverage3 }]} />
      <Split title="Points marqués" playerName={partner.player.name} partnerName={partner.partner.name} player={duo.playerScore} partner={duo.partnerScore} />
      <Split title="Fléchettes lancées" playerName={partner.player.name} partnerName={partner.partner.name} player={duo.playerDarts} partner={duo.partnerDarts} />
      <Split title="Finishes enregistrés" playerName={partner.player.name} partnerName={partner.partner.name} player={duo.playerFinishes} partner={duo.partnerFinishes} />
      <p>{coverageText(duo.coverage)} pour le scoring commun ; {coverageText(duo.finishCoverage)} pour les finishes. Une répartition 50/50 n’est pas un objectif ni une preuve de complémentarité.</p>
    </div></details>
    <details className="bp-disclosure"><summary>Contexte de manche · places et points BDC</summary><div><p>Ces informations concernent la manche entière ; elles ne sont pas recalculées pour la phase choisie.</p><ul className="bp-list">{partner.roundResults.map(result => <li key={result.round}>M{result.round} · {date(result.date)} · place {count(result.place)} · {count(result.points)} points par joueur · {result.pointsStatus === "provisional" ? "provisoires, sous réserve de validation DS" : result.pointsStatus === "validated" ? "barème validé" : "points indisponibles"}</li>)}</ul><p>Le statut des points BDC est indépendant de la vérification des statistiques de lancer.</p></div></details>
    {partner.observations.length ? <details className="bp-disclosure"><summary>Observations sur cette association</summary><div><ul className="bp-list">{partner.observations.map((observation, index) => <li key={index}>{observation.text} <small>({roundsText(observation.rounds)}, {observation.matchIds.length} matchs concernés)</small></li>)}</ul></div></details> : null}
    <MatchEvolution partner={partner} />
    <MatchDetails partner={partner} />
  </article>;
}

function SummaryTable({ analysis, left, right }: { analysis: Analysis; left: string; right: string }) {
  return <section className="bp-panel" id="partenaires" data-testid="partner-summary">
    <div className="bp-heading"><h2>Mes partenaires observés</h2><small>{analysis.partners.length} association{analysis.partners.length > 1 ? "s" : ""} · {PHASE_LABELS[analysis.filters.phase]}</small></div>
    <div className="bp-table-region bp-desktop-partners" role="region" tabIndex={0} aria-label="Tableau comparatif des partenaires">
      <table className="bp-table"><caption>Moyennes pondérées sur les lancers conservés. Les résultats sportifs utilisent les scores corrigés.</caption>
        <thead><tr><th scope="col">Partenaire</th><th scope="col">Résultats du duo</th><th scope="col">Moi · moy. / First 9</th><th scope="col">Partenaire · moy.</th><th scope="col">Duo · moy.</th><th scope="col">Observation</th><th scope="col">Détails</th></tr></thead>
        <tbody>{analysis.partners.map(partner => <tr key={partner.pairKey} data-partner-id={partner.partner.id}>
          <th scope="row">{partner.partner.name}<small>{roundsText(partner.rounds)} · {partner.evenings} soirée{partner.evenings > 1 ? "s" : ""}</small></th>
          <td><strong>{partner.result.winRate == null ? "—" : `${partner.result.wins}/${partner.result.knownMatches} V · ${percent(partner.result.winRate)}`}</strong><small>{partner.result.matches ? `${count(partner.result.legsWon)} / ${count(partner.result.legsLost)} legs gagnés / perdus${partner.result.legsComparable ? "" : " · périmètre en legs partiel"}` : "Aucun match dans cette phase"}</small></td>
          <td><strong>{number(partner.playerStats.average3)}</strong><small>First 9 : {number(partner.playerStats.first9)}</small></td>
          <td><strong>{number(partner.partnerStats.average3)}</strong></td>
          <td><strong>{number(partner.duoStats.average3)}</strong></td>
          <td>{partner.coverage.matches}/{partner.coverage.totalMatches} matchs couverts<small>{partner.coverage.completeMatches} complets · {partner.coverage.recordedLegs} legs</small></td>
          <td><Link href={partnerHref(analysis.player!.id, analysis.filters, partner.partner.id, partner.partner.id === left ? right : left)}>Comparer →</Link></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="bp-mobile-partners">{analysis.partners.map(partner => <article className="bp-partner-card" key={partner.pairKey} data-partner-id={partner.partner.id}>
      <h3>{partner.partner.name}</h3><p className="bp-volume">{roundsText(partner.rounds)} · {partner.evenings} soirée{partner.evenings > 1 ? "s" : ""} · {coverageText(partner.coverage)}</p>
      <div className="bp-mini-grid"><div><span>Résultats du duo</span><strong>{partner.result.winRate == null ? "—" : `${partner.result.wins}/${partner.result.knownMatches} V`}</strong><span>{partner.result.matches ? `${percent(partner.result.winRate)} matchs gagnés` : "Aucun match dans cette phase"}</span></div><div><span>Notre duo · moyenne</span><strong>{number(partner.duoStats.average3)}</strong></div><div><span>Moi · moyenne</span><strong>{number(partner.playerStats.average3)}</strong><span>First 9 : {number(partner.playerStats.first9)}</span></div><div><span>Partenaire · moyenne</span><strong>{number(partner.partnerStats.average3)}</strong></div></div>
      <Link className="bp-button" href={partnerHref(analysis.player!.id, analysis.filters, partner.partner.id, partner.partner.id === left ? right : left)}>Comparer cette association</Link>
    </article>)}</div>
    <p className="bp-note">Les détails de chaque indicateur, ses dénominateurs et ses sources sont accessibles dans les fiches ci-dessous. « — » indique une donnée indisponible, jamais zéro.</p>
  </section>;
}

export function BdcPartnerAnalysis({ data, analysis, requestedPlayer, left, right }: Props) {
  const { filters, partners, player } = analysis;
  const seasons = [...new Set([...data.rounds.map(round => round.season), filters.season])].sort((a, b) => b - a);
  const rounds = data.rounds.filter(round => round.season === filters.season);
  const selectedLeft = partners.find(partner => partner.partner.id === left) ?? partners[0];
  const selectedRight = partners.find(partner => partner.partner.id === right && partner !== selectedLeft) ?? partners.find(partner => partner !== selectedLeft);
  const invalidPlayer = Boolean(requestedPlayer && !player);
  return <div className="bdc-partners">
    <header className="bp-hero"><div><span className="bp-eyebrow">Tampon Darts Club · Blind Draw Championship</span><h1>Analyse des partenaires</h1><p>{player ? "Comparer mon jeu, celui de mes partenaires et notre duo." : "Retrouver mes associations, comparer mon jeu et celui du duo, puis lire ce qui ressort des rencontres observées."}</p>{player ? <p className="bp-selected-player"><strong>{player.name}</strong> · <Affiliation player={player} season={filters.season} /></p> : null}</div><div className="bp-hero-mark" aria-hidden="true">BDC<small>{filters.season - 1} — {filters.season}</small></div></header>
    <section className="bp-panel" aria-labelledby="bp-filters-title">
      <div className="bp-heading"><h2 id="bp-filters-title">Choisir mon périmètre</h2><Link href="/players/kpi#doublettes-bdc">Comprendre les indicateurs →</Link></div>
      <details className="bp-filter-disclosure" open={!player} data-testid="filter-disclosure"><summary>Modifier joueur et filtres{player ? ` · ${player.name}` : ""}</summary>
      <form action={PATH} method="get" className="bp-filters" data-testid="filters">
        <label className="bp-field">Joueur<select name="player" defaultValue={requestedPlayer} required aria-label="Joueur BDC"><option value="">Sélectionner un joueur</option>{invalidPlayer ? <option value={requestedPlayer}>Identifiant inconnu</option> : null}{data.players.map(option => <option value={option.id} key={option.id}>{option.name}</option>)}</select></label>
        <label className="bp-field">Saison BDC<select name="season" defaultValue={filters.season}>{seasons.map(season => <option value={season} key={season}>{season - 1}–{season} (filtre {season})</option>)}</select></label>
        <label className="bp-field">Phase de compétition<select name="phase" defaultValue={filters.phase}><option value="pool">Matchs de poule</option><option value="all">Toutes les phases</option><option value="finals">Phase finale</option></select></label>
        <fieldset><legend>Manches incluses</legend><input name="rounds" type="hidden" value="" /><div className="bp-round-options">{rounds.length ? rounds.map(round => <label key={round.number}><input type="checkbox" name="rounds" value={round.number} defaultChecked={filters.rounds.includes(round.number)} />M{round.number} · {date(round.date)}</label>) : <span className="bp-note">Aucune manche publiée pour cette saison.</span>}</div></fieldset>
        {left ? <input type="hidden" name="left" value={left} /> : null}{right ? <input type="hidden" name="right" value={right} /> : null}
        <button type="submit" className="bp-button">Analyser ce joueur</button>
      </form>
      <p className="bp-note">Les poules sont choisies par défaut pour comparer les associations sur un format commun. Tous les indicateurs de jeu et la synthèse suivent ces filtres. Le lien de cette page conserve la sélection et se partage directement.</p>
      </details>
      <div className="bp-scope"><span className="bp-pill">{PHASE_LABELS[filters.phase]}</span><span className="bp-pill">{roundsText(filters.rounds)}</span><span className="bp-pill">Saison sportive {filters.season - 1}–{filters.season}</span></div>
    </section>
    {!player ? <div className="bp-empty" role={invalidPlayer ? "alert" : undefined}><h2>{invalidPlayer ? "Joueur BDC introuvable" : "Sélectionner un joueur pour commencer"}</h2><p>{invalidPlayer ? "Cet identifiant ne correspond à aucun participant vérifié. Choisissez un joueur dans la liste pour ouvrir ses associations." : "Le comparatif présente les partenaires réellement observés dans les manches publiées, sans prédire le résultat d’une nouvelle paire."}</p></div> : !partners.length ? <div className="bp-empty"><h2>Aucune participation sur ce périmètre</h2><p>{player.name} n’a aucune association avec des rencontres pour cette saison, ces manches et cette phase. Changez les filtres pour retrouver ses participations.</p></div> : <>
      <aside className="bp-warning"><strong>Premières observations</strong> — les différences peuvent aussi refléter la forme du jour, les adversaires et le format. {partners.map(partner => `${partner.partner.name} : ${partner.evenings} soirée${partner.evenings > 1 ? "s" : ""}`).join(" ; ")}.</aside>
      <section className="bp-panel" aria-labelledby="bp-conclusions-title" data-testid="conclusions"><div className="bp-heading"><h2 id="bp-conclusions-title">Ce qui ressort à ce stade</h2><small>Observations, sans score de compatibilité</small></div><div className="bp-conclusions">{analysis.conclusions.map(conclusion => <Conclusion key={conclusion.criterion} conclusion={conclusion} partners={partners} />)}</div>
        <div className="bp-summary">
          {analysis.observations.filter(observation => observation.metric !== "context").map((observation, index) => <p key={index}>{observation.text} {observation.matchIds.length ? <a href="#partenaires">{roundsText(observation.rounds)} · {observation.matchIds.length} matchs concernés →</a> : null}</p>)}
        </div>
      </section>
      <SummaryTable analysis={analysis} left={selectedLeft?.partner.id ?? ""} right={selectedRight?.partner.id ?? ""} />
      <section className="bp-panel" id="comparaison" data-testid="comparison"><div className="bp-heading"><h2>Comparer les associations</h2><small>Moi / mon partenaire / notre duo</small></div>
        {partners.length > 1 ? <form action={`${PATH}#comparaison`} method="get" className="bp-compare-form"><FiltersHidden playerId={player.id} filters={filters} /><label className="bp-field">Association A<select name="left" defaultValue={selectedLeft?.partner.id}>{partners.map(partner => <option value={partner.partner.id} key={partner.pairKey}>{partner.partner.name}</option>)}</select></label><label className="bp-field">Association B<select name="right" defaultValue={selectedRight?.partner.id}>{partners.map(partner => <option value={partner.partner.id} key={partner.pairKey}>{partner.partner.name}</option>)}</select></label><button className="bp-button" type="submit">Comparer</button></form> : null}
        {left && left === right && partners.length > 1 ? <p className="bp-note">Deux partenaires distincts sont nécessaires : la deuxième association disponible est affichée.</p> : null}
        <div className="bp-comparison">{selectedLeft ? <DuoCard partner={selectedLeft} slot={partners.length > 1 ? "Association A" : "Association observée"} /> : null}{selectedRight ? <DuoCard partner={selectedRight} slot="Association B" /> : null}</div>
      </section>
    </>}
    <details className="bp-panel bp-disclosure" id="methodologie"><summary>Méthode, couverture et limites des sources</summary><div className="bp-method-grid"><section><h3>Un périmètre commun, des calculs pondérés</h3><p>Le moteur additionne les points et les fléchettes avant de calculer chaque moyenne. Le scoring collectif et ses répartitions utilisent uniquement les mêmes rencontres enregistrées pour les deux membres. Les références utilisent exclusivement les autres partenaires BDC, avec les mêmes filtres.</p><p>Les valeurs absentes restent « — ». Les finishes enregistrés ne donnent pas un checkout % sans tentatives fiables. La dispersion exige trois matchs complets et pondère chaque moyenne par ses fléchettes. Un volume élevé de legs sur une seule soirée ne prouve pas une compatibilité durable.</p><Link href="/players/kpi#doublettes-bdc">Définitions des indicateurs et formules →</Link></section><section><h3>Résultats, statistiques et points BDC</h3><p>M1 : scores sportifs corrigés après l’incident Nakka ; certains legs ne sont pas conservés et les finales peuvent être en sets. La couverture est recalculée pour chaque association et chaque indicateur. M2 : l’attribution des lancers suit l’ordre Nakka de chaque leg ; les points restent provisoires sous réserve du directeur sportif.</p><p>Les volées ordonnées ne sont pas conservées dans cette couche publique : aucune analyse de réaction après une volée du partenaire n’est reconstituée. Un ordre de match inconnu ne produit pas de chronologie inventée.</p></section></div></details>
  </div>;
}
