import Link from "next/link";
import { BDC_RESULTS, BDC_URL, bdcPoints } from "@/lib/bdc";

type Finish = { leg: number | null; value: number; darts: number | null; matchId?: string; validation?: string };
type PlayerMatchStats = {
  name: string; score: number; darts: number; first9Score: number; first9Darts: number;
  visits100: number; visits140: number; visits170: number; visits180: number;
  finishes: Finish[]; average3: number | null; first9: number | null; bestFinish: number | null;
};
type MatchSide = { teamId: string; name: string; score: number; average3: number; recordedDarts: number; players: PlayerMatchStats[] | null; validatedFinishes?: Array<Finish & { player: string }> };
type RoundMatch = { id: string; phase: string; scoreUnit: string; recordedDarts: number; dataStatus: string; teamA: MatchSide; teamB: MatchSide };
type PlayerGlobalStats = PlayerMatchStats & { matches: number; duoScore: number; contribution: number | null };
type RoundDetails = {
  round: number; status: string; quality: { individualMatches: number; totalMatches: number };
  poolStandings: { rank: number; teamId: string; name: string; played: number; wins: number; losses: number; setsDiff: number; legsFor: number; legsAgainst: number; legsDiff: number; points: number; average3: number }[];
  matches: RoundMatch[]; playerStats: PlayerGlobalStats[];
};
type RoundSource = {
  entries: { tpid: string; name: string }[];
  stats: Record<string, { score: number; darts: number; f9Score: number; f9Darts: number; ton00: number; ton40: number; ton70: number; ton80: number; highOut: number; match: number; winMatch: number; leg: number; winLeg: number }>;
};

const UNAVAILABLE = "Donnée indisponible – incident Nakka";
const fmt = (value: number | null, suffix = "") => value === null ? "—" : `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}${suffix}`;
const average = (score: number, darts: number) => darts > 0 ? score * 3 / darts : null;
const signed = (value: number) => value > 0 ? `+${value}` : String(value);

function BracketMatch({ match }: { match: RoundMatch }) {
  const winner = match.teamA.score > match.teamB.score ? match.teamA : match.teamB;
  return <div className="bdc-bracket-match">
    {[match.teamA, match.teamB].map(team => <div className={`bdc-bracket-team ${team === winner ? "is-winner" : ""}`} key={team.teamId}>
      <span>{team.name}</span><small>({fmt(team.average3)})</small><strong>{team.score}</strong>
    </div>)}
  </div>;
}

function Contribution({ side }: { side: MatchSide }) {
  if (!side.players) return <p className="bdc-unavailable">{UNAVAILABLE}</p>;
  const total = side.players.reduce((sum, player) => sum + player.score, 0);
  return <div className="bdc-contribution" aria-label={`Contribution au scoring de ${side.name}`}>
    {side.players.map((player, index) => {
      const share = total ? Math.round(player.score * 1000 / total) / 10 : 0;
      return <div className="bdc-contribution-row" key={player.name}>
        <div><strong>{player.name}</strong><span>{fmt(share, "%")} · {fmt(player.score)} pts</span></div>
        <div className="bdc-contribution-track"><span className={index ? "is-partner" : ""} style={{ width: `${share}%` }} /></div>
      </div>;
    })}
  </div>;
}

function PlayerMatchCard({ player }: { player: PlayerMatchStats }) {
  return <article className="bdc-player-match">
    <h5>{player.name}</h5>
    <dl className="bdc-metrics-grid">
      <div><dt>Score</dt><dd>{fmt(player.score)}</dd></div><div><dt>Fléchettes</dt><dd>{player.darts}</dd></div>
      <div><dt>Moy. 3 darts</dt><dd>{fmt(player.average3)}</dd></div><div><dt>First 9</dt><dd className={player.first9 === null ? "is-unavailable" : ""}>{player.first9 === null ? UNAVAILABLE : fmt(player.first9)}</dd></div>
      <div><dt>100–139</dt><dd>{player.visits100}</dd></div><div><dt>140–169</dt><dd>{player.visits140}</dd></div>
      <div><dt>170–179</dt><dd>{player.visits170}</dd></div><div><dt>180</dt><dd>{player.visits180}</dd></div>
    </dl>
    <div className="bdc-finishes"><strong>Finishes</strong>{player.finishes.length
      ? <ul>{player.finishes.map(finish => <li key={`${finish.leg}-${finish.value}-${finish.darts}`}>{finish.leg === null ? "Leg non identifié" : `Leg ${finish.leg}`} · sortie {finish.value}{finish.darts === null ? " · nombre de fléchettes indisponible" : ` en ${finish.darts} fléchette${finish.darts > 1 ? "s" : ""}`}</li>)}</ul>
      : <span>Aucun finish enregistré</span>}</div>
  </article>;
}

function MatchDetail({ match }: { match: RoundMatch }) {
  const unavailable = match.dataStatus !== "partial-individual";
  return <details className="bdc-match-card"><summary>
    <span className="bdc-match-phase">{match.phase}</span><span>{match.teamA.name}</span><strong>{match.teamA.score} – {match.teamB.score}</strong><span>{match.teamB.name}</span>
  </summary><div className="bdc-match-content">
    <div className="bdc-match-facts"><span>Score final · {match.teamA.score}–{match.teamB.score} {match.scoreUnit}</span><span>{match.recordedDarts} fléchettes enregistrées</span><span>Moyennes duo · {fmt(match.teamA.average3)} / {fmt(match.teamB.average3)}</span></div>
    {unavailable ? <div className="bdc-unavailable-panel"><strong>{UNAVAILABLE}</strong><p>Les séquences individuelles complètes ne sont plus présentes dans cette feuille. Le score collectif et les moyennes du duo restent affichés.</p>{[match.teamA, match.teamB].flatMap(side => side.validatedFinishes ?? []).map(finish => <p key={`${finish.player}-${finish.leg}-${finish.value}`}><strong>Finish attribué :</strong> {finish.player} · {finish.leg === null ? "leg non identifié" : `leg ${finish.leg}`} · sortie {finish.value}{finish.darts === null ? "" : ` en ${finish.darts} fléchette${finish.darts > 1 ? "s" : ""}`} · ordre de passage confirmé</p>)}</div>
      : <div className="bdc-duo-details">{[match.teamA, match.teamB].map(side => <section key={side.teamId}>
        <h4>{side.name}</h4><Contribution side={side} /><div className="bdc-player-match-grid">{side.players!.map(player => <PlayerMatchCard player={player} key={player.name} />)}</div>
      </section>)}</div>}
  </div></details>;
}

function LeaderCard({ label, rows, value, suffix = "" }: { label: string; rows: PlayerGlobalStats[]; value: (row: PlayerGlobalStats) => number | null; suffix?: string }) {
  const valid = rows.filter(row => value(row) !== null).sort((a, b) => (value(b) ?? 0) - (value(a) ?? 0));
  const best = valid[0];
  if (!best) return <article className="bdc-leader-card"><span>{label}</span><strong>—</strong><small>{UNAVAILABLE}</small></article>;
  const bestValue = value(best);
  const names = valid.filter(row => value(row) === bestValue).map(row => row.name).join(" · ");
  return <article className="bdc-leader-card"><span>{label}</span><strong>{fmt(bestValue, suffix)}</strong><small>{names}</small></article>;
}

export function BdcRoundTemplate({ details, source }: { details: RoundDetails; source: RoundSource }) {
  const result = BDC_RESULTS.find(item => item.round === details.round)!;
  const names = Object.fromEntries(source.entries.map(entry => [entry.tpid, entry.name]));
  const playerIds = Object.fromEntries(result.teams.flatMap(team => team.players.map(player => [player.name, player.id])));
  const poolMatches = details.matches.filter(match => match.phase === "Poule").reverse();
  const semifinals = details.matches.filter(match => match.phase === "Demi-finale");
  const final = details.matches.find(match => match.phase === "Finale")!;
  const third = details.matches.find(match => match.phase === "3e place")!;
  const first9Rows = details.playerStats.filter(row => row.first9 !== null);
  const totalBigScores = (row: PlayerGlobalStats) => row.visits100 + row.visits140 + row.visits170 + row.visits180;

  return <section id={`resultats-manche-${details.round}`} className="bdc-section bdc-round-report">
    <div className="bdc-heading"><div><span className="bdc-eyebrow">RAPPORT DE MANCHE</span><h2>Manche {details.round} · Résultats et performances</h2></div><span className="bdc-status">{details.status} · 8 doublettes · 16 joueurs</span></div>
    <div className="bdc-levels" aria-label="Niveaux d’analyse"><a href="#m1-synthese">Synthèse</a><a href="#m1-poule">Round Robin</a><a href="#m1-finale">Phase finale</a><a href="#m1-tournoi">Stats générales</a><a href="#m1-joueurs">Joueurs</a><a href="#m1-matchs">Matchs</a></div>

    <section id="m1-synthese" className="bdc-report-block">
      <div className="bdc-report-title"><div><span>01</span><h3>Synthèse et statistiques globales de la Manche 01</h3></div><small>Résultat final validé</small></div>
      <div className="bdc-kpis"><article><span>Champion</span><strong>Super Mario / Pierre</strong><small>11 points par joueur</small></article><article><span>Format</span><strong>8 doublettes</strong><small>16 joueurs</small></article><article><span>Rencontres</span><strong>32 matchs</strong><small>28 poule · 4 phase finale</small></article><article><span>Couverture individuelle</span><strong>{details.quality.individualMatches}/{details.quality.totalMatches}</strong><small>feuilles nominatives exploitables</small></article></div>
      <div className="bdc-podium"><article><span>2</span><strong>Abrousse / Alexandre</strong><small>9 pts/joueur</small></article><article className="is-champion"><span>1</span><strong>Super Mario / Pierre</strong><small>Champions · 11 pts/joueur</small></article><article><span>3</span><strong>Vincent / Guillaume</strong><small>8 pts/joueur</small></article></div>
    </section>

    <section id="m1-poule" className="bdc-report-block">
      <div className="bdc-report-title"><div><span>02</span><h3>Phase de poule · Round Robin</h3></div><small>28 rencontres · scores corrigés validés</small></div>
      <details className="bdc-data-disclosure" open><summary>Tableau complet des rencontres</summary><div className="bdc-table-scroll" role="region" aria-label="Rencontres du Round Robin" tabIndex={0}><table className="bdc-table bdc-match-table"><thead><tr><th>#</th><th>Doublette A</th><th>Moy. A</th><th>Score</th><th>Doublette B</th><th>Moy. B</th></tr></thead><tbody>
        {poolMatches.map((match, index) => <tr key={match.id}><td>{index + 1}</td><th scope="row">{match.teamA.name}</th><td>{fmt(match.teamA.average3)}</td><td><strong>{match.teamA.score} – {match.teamB.score}</strong></td><td>{match.teamB.name}</td><td>{fmt(match.teamB.average3)}</td></tr>)}
      </tbody></table></div></details>
      <h4 className="bdc-subtitle">Classement final de la poule</h4><div className="bdc-table-scroll" role="region" aria-label="Classement final de la poule" tabIndex={0}><table className="bdc-table"><thead><tr><th>Rang</th><th>Doublette</th><th>J</th><th>V</th><th>D</th><th>Diff. sets</th><th>Legs</th><th>Diff. legs</th><th>Pts</th><th>Moy. 3 darts</th></tr></thead><tbody>
        {details.poolStandings.map(row => <tr key={row.teamId} className={row.rank <= 4 ? "is-qualified" : ""}><td><strong>{row.rank}</strong></td><th scope="row">{row.name}</th><td>{row.played}</td><td>{row.wins}</td><td>{row.losses}</td><td>{signed(row.setsDiff)}</td><td>{row.legsFor}–{row.legsAgainst}</td><td>{signed(row.legsDiff)}</td><td><strong>{row.points}</strong></td><td>{fmt(row.average3)}</td></tr>)}
      </tbody></table></div><p className="bdc-note">Les quatre premières doublettes sont qualifiées pour les demi-finales.</p>
    </section>

    <section id="m1-finale" className="bdc-report-block">
      <div className="bdc-report-title"><div><span>03</span><h3>Phase finale</h3></div><small>Premier à 1 set · meilleur des 5 legs</small></div>
      <div className="bdc-bracket" aria-label="Tableau de la phase finale"><div><span className="bdc-bracket-label">Demi-finales</span>{semifinals.map(match => <BracketMatch match={match} key={match.id} />)}</div><div className="bdc-bracket-arrow" aria-hidden="true">›</div><div><span className="bdc-bracket-label">Finale</span><BracketMatch match={final} /><div className="bdc-champion"><span>CHAMPIONS MANCHE 01</span><strong>Super Mario / Pierre</strong></div></div></div>
      <details className="bdc-data-disclosure"><summary>Afficher le match pour la 3e place</summary><div className="bdc-third-place"><BracketMatch match={third} /><p><strong>Vincent / Guillaume</strong> terminent troisièmes.</p></div></details>
    </section>

    <section id="m1-tournoi" className="bdc-report-block">
      <div className="bdc-report-title"><div><span>04</span><h3>Statistiques générales du tournoi</h3></div><small>Données collectives publiées · inchangées</small></div>
      <div className="bdc-table-scroll" role="region" aria-label="Statistiques générales des doublettes" tabIndex={0}><table className="bdc-table"><thead><tr><th>Doublette</th><th>Matchs</th><th>Victoires</th><th>Legs</th><th>Legs gagnés</th><th>Score</th><th>Fléchettes</th><th>Moy. 3 darts</th><th>First 9</th><th>100–139</th><th>140–169</th><th>170–179</th><th>180</th><th>Meilleure sortie</th></tr></thead><tbody>
        {result.teams.map(team => { const stats = source.stats[team.id]; return <tr key={team.id}><th scope="row">{names[team.id]}</th><td>{stats.match}</td><td>{stats.winMatch}</td><td>{stats.leg}</td><td>{stats.winLeg}</td><td>{fmt(stats.score)}</td><td>{stats.darts}</td><td>{fmt(average(stats.score, stats.darts))}</td><td>{fmt(average(stats.f9Score, stats.f9Darts))}</td><td>{stats.ton00}</td><td>{stats.ton40}</td><td>{stats.ton70}</td><td>{stats.ton80}</td><td>{stats.highOut || "—"}</td></tr>; })}
      </tbody></table></div>
    </section>

    <section id="m1-joueurs" className="bdc-report-block">
      <div className="bdc-report-title"><div><span>05</span><h3>Performances individuelles disponibles</h3></div><small>{details.quality.individualMatches} matchs sur {details.quality.totalMatches}</small></div>
      <p>Ces comparaisons utilisent les feuilles disposant de séquences individuelles exploitables. Les finishes confirmés manuellement sont ajoutés séparément, sans reconstituer les autres statistiques manquantes.</p>
      <div className="bdc-leaders"><LeaderCard label="Meilleur scoreur" rows={details.playerStats} value={row => row.score} /><LeaderCard label="Meilleure moyenne 3 darts" rows={details.playerStats} value={row => row.average3} /><LeaderCard label="Meilleure moyenne First 9" rows={first9Rows} value={row => row.first9} /><LeaderCard label="Plus grand nombre de finishes" rows={details.playerStats} value={row => row.finishes.length} /><LeaderCard label="Plus haut finish" rows={details.playerStats.filter(row => row.bestFinish !== null)} value={row => row.bestFinish} /><LeaderCard label="Plus gros volume 100+" rows={details.playerStats} value={totalBigScores} /></div>
      <div className="bdc-table-scroll" role="region" aria-label="Classement des performances individuelles disponibles" tabIndex={0}><table className="bdc-table"><thead><tr><th>Joueur</th><th>Matchs couverts</th><th>Score</th><th>Part du duo</th><th>Moy. 3 darts</th><th>First 9</th><th>Finishes</th><th>Haut finish</th><th>100–139</th><th>140–169</th><th>170–179</th><th>180</th></tr></thead><tbody>
        {details.playerStats.map(row => { const playerId = playerIds[row.name]; return <tr key={row.name}><th scope="row">{playerId ? <Link className="bdc-player-link" href={`${BDC_URL}/manche-${details.round}/joueurs/${playerId}`}>{row.name}<span aria-hidden="true">→</span></Link> : row.name}</th><td>{row.matches}</td><td><strong>{fmt(row.score)}</strong></td><td>{fmt(row.contribution, "%")}</td><td>{fmt(row.average3)}</td><td>{row.first9 === null ? UNAVAILABLE : fmt(row.first9)}</td><td>{row.finishes.length}</td><td>{row.bestFinish ?? "—"}</td><td>{row.visits100}</td><td>{row.visits140}</td><td>{row.visits170}</td><td>{row.visits180}</td></tr>; })}
      </tbody></table></div><p className="bdc-note">First 9 : calculé uniquement lorsqu’un joueur dispose de neuf fléchettes enregistrées dans le leg. « — » signifie donnée indisponible.</p>
    </section>

    <section id="m1-matchs" className="bdc-report-block"><div className="bdc-report-title"><div><span>06</span><h3>Fiches détaillées des rencontres</h3></div><small>Sections dépliables</small></div><div className="bdc-match-list">{details.matches.map(match => <MatchDetail match={match} key={match.id} />)}</div></section>

    <section className="bdc-source-limits"><h3>Source et limites</h3><p>Plusieurs matchs se sont interrompus à 1–1 dans le système avant d’être terminés hors application. Le classement et les scores finaux validés manuellement sont conservés. Les statistiques reposent seulement sur les volées enregistrées.</p><p>L’ordre officiel des joueurs correspond à l’ordre des noms dans chaque duo et a été confirmé par l’organisateur. Lorsque les séquences de volées ne sont plus disponibles, seules les performances expressément validées sont ajoutées ; les autres chiffres ne sont pas reconstitués.</p></section>

    <section className="bdc-report-block"><div className="bdc-report-title"><div><span>07</span><h3>Classement de la manche et points BDC</h3></div><small>Points attribués à chaque joueur</small></div><div className="bdc-table-scroll" role="region" aria-label="Classement de la manche 1 et points BDC" tabIndex={0}><table className="bdc-table"><thead><tr><th>Place</th><th>Doublette</th><th>Victoires de poule</th><th>Base</th><th>Bonus</th><th>Points par joueur</th></tr></thead><tbody>
      {result.teams.map(team => <tr key={team.id}><td>{team.place}</td><th scope="row">{names[team.id]}</th><td>{team.poolWins}/7</td><td>{bdcPoints(team.place!, 0, 8)}</td><td>+{Math.min(team.poolWins!, 3)}</td><td><strong>{bdcPoints(team.place!, team.poolWins!, 8)}</strong></td></tr>)}
    </tbody></table></div><p className="bdc-note">Le résultat officiel et son classement restent détenus par le directeur sportif du Tampon Darts Club.</p></section>
  </section>;
}
