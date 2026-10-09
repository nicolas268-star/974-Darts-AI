import { StatsTable } from "@/components/stats/StatsTable";
import round from "@/lib/bdc-round-two.json";

const fmt = (value: number | null) => value === null ? "—" : value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
const average = (score: number, darts: number) => darts ? score * 3 / darts : null;
type Match = typeof round.matches[number];

function Result({ match }: { match: Match }) {
  return <div className="bdc-bracket-match">{[match.teamA, match.teamB].map(side => <div key={side.teamId} className={`bdc-bracket-team ${side.score === Math.max(match.teamA.score, match.teamB.score) ? "is-winner" : ""}`}>
    <span>{side.name}</span><small>({fmt(side.average3)})</small><strong>{side.score}</strong>
  </div>)}</div>;
}

function MatchDetails({ match }: { match: Match }) {
  return <details className="bdc-match-card"><summary>
    <span className="bdc-match-phase">{match.phase}</span><span>{match.teamA.name}</span><strong>{match.teamA.score} – {match.teamB.score}</strong><span>{match.teamB.name}</span>
  </summary><div className="bdc-match-content">
    <div className="bdc-match-facts"><span>{match.legs} legs vérifiés</span><span>Moyennes duo · {fmt(match.teamA.average3)} / {fmt(match.teamB.average3)}</span></div>
    <div className="bdc-duo-details">{[match.teamA, match.teamB].map(side => <section key={side.teamId}><h4>{side.name}</h4>
      <div className="bdc-player-match-grid">{side.players.map(player => <article className="bdc-player-match" key={player.id}><h5>{player.name}</h5>
        <dl className="bdc-metrics-grid">
          <div><dt>Score</dt><dd>{fmt(player.score)}</dd></div><div><dt>Fléchettes</dt><dd>{player.darts}</dd></div>
          <div><dt>Moy. 3 darts</dt><dd>{fmt(player.average3)}</dd></div><div><dt>First 9</dt><dd>{fmt(player.first9)}</dd></div>
          <div><dt>Part du scoring</dt><dd>{fmt(player.score * 100 / side.recordedScore)} %</dd></div><div><dt>Tours sans score</dt><dd>{player.zeroVisits}</dd></div>
          <div><dt>100–139</dt><dd>{player.visits100}</dd></div><div><dt>140–169</dt><dd>{player.visits140}</dd></div>
          <div><dt>170–179</dt><dd>{player.visits170}</dd></div><div><dt>180</dt><dd>{player.visits180}</dd></div>
        </dl><div className="bdc-finishes"><strong>Finishes</strong>{player.finishes.length ? <ul>{player.finishes.map(finish => <li key={finish.leg}>Leg {finish.leg} · {finish.value} en {finish.darts} fléchette{finish.darts > 1 ? "s" : ""}</li>)}</ul> : <span>Aucun finish enregistré</span>}</div>
      </article>)}</div>
    </section>)}</div>
  </div></details>;
}

export function BdcRoundTwo() {
  const pool = round.matches.filter(match => match.phase === "Poule");
  const semis = round.matches.filter(match => match.phase === "Demi-finale");
  const final = round.matches.find(match => match.phase === "Finale")!;
  const third = round.matches.find(match => match.phase === "3e place")!;
  const champion = round.results[0];
  const topAverage = round.playerStats[0];
  const topFinish = [...round.playerStats].sort((a, b) => (b.bestFinish ?? 0) - (a.bestFinish ?? 0))[0];

  return <section id="resultats-manche-2" className="bdc-section bdc-round-report">
    <div className="bdc-heading"><div><span className="bdc-eyebrow">9 OCTOBRE 2026 · BAR LE CHAM’Ô</span><h2>Manche 2 · Résultats et performances</h2></div><span className="bdc-status">Terminée · {round.teamCount} doublettes · {round.playerCount} joueurs</span></div>
    <nav className="bdc-levels" aria-label="Analyse de la manche 2"><a href="#m2-synthese">Synthèse</a><a href="#m2-poule">Round Robin</a><a href="#m2-finale">Phase finale</a><a href="#m2-joueurs">Joueurs</a><a href="#m2-tournoi">Doublettes</a><a href="#m2-matchs">Matchs</a><a href="#m2-points">Points BDC</a></nav>

    <section id="m2-synthese" className="bdc-report-block">
      <div className="bdc-report-title"><div><span>01</span><h3>La manche en chiffres</h3></div><small>Résultats Nakka · tournoi terminé</small></div>
      <div className="bdc-kpis"><article><span>Champions</span><strong>{champion.name}</strong><small>Victoire 3–2 en finale</small></article><article><span>Format</span><strong>{round.teamCount} doublettes</strong><small>{round.playerCount} joueurs</small></article><article><span>Rencontres</span><strong>{round.quality.matches} matchs</strong><small>{round.quality.poolMatches} poule · {round.quality.finalMatches} phase finale</small></article><article><span>Couverture statistique</span><strong>{round.quality.recordedLegs} legs</strong><small>25/25 matchs vérifiés</small></article></div>
      <div className="bdc-podium">{[round.results[1], champion, round.results[2]].map(team => <article className={team.place === 1 ? "is-champion" : ""} key={team.teamId}><span>{team.place}</span><strong>{team.name}</strong><small>{team.place === 1 ? "Champions de la manche 2" : team.place === 2 ? "Finalistes" : "3e place"}</small></article>)}</div>
    </section>

    <section id="m2-poule" className="bdc-report-block">
      <div className="bdc-report-title"><div><span>02</span><h3>Phase de poule · Round Robin</h3></div><small>21 rencontres · 6 matchs par doublette</small></div>
      <article className="round-robin-card bdc-round-robin-card"><div className="round-robin-heading"><div><span>ROUND ROBIN</span><h3>Poule unique · 7 doublettes</h3><p>Score en legs · moyenne 3 darts du duo sous chaque résultat</p></div><div className="round-robin-badges"><b className="complete">21/21 matchs</b></div></div>
        <div className="round-robin-scroll" role="region" aria-label="Round Robin de la manche 2" tabIndex={0}><StatsTable className="round-robin-table" mobileSummaryColumns={[9, 10, 11, 12]}>
          <thead><tr><th>#</th><th className="rr-player-name">Doublette</th>{round.poolStandings.map((team, index) => <th key={team.teamId} title={team.name}>{index + 1}</th>)}<th>V</th><th>D</th><th>+/-</th><th>Pts</th></tr></thead>
          <tbody>{round.poolStandings.map((team, index) => <tr key={team.teamId}><td>{index + 1}</td><th scope="row" className="rr-player-name"><strong>{team.name}</strong><small>{fmt(team.average3)}</small></th>
            {round.poolStandings.map(opponent => {
              if (team.teamId === opponent.teamId) return <td className="rr-self" key={opponent.teamId} aria-label="Même doublette" />;
              const match = pool.find(m => [m.teamA.teamId, m.teamB.teamId].includes(team.teamId) && [m.teamA.teamId, m.teamB.teamId].includes(opponent.teamId))!;
              const own = match.teamA.teamId === team.teamId ? match.teamA : match.teamB;
              const other = own === match.teamA ? match.teamB : match.teamA;
              return <td className={`rr-result ${own.score > other.score ? "won" : "lost"}`} key={opponent.teamId}><strong>{own.score} – {other.score}</strong><small>{fmt(own.average3)}</small></td>;
            })}<td>{team.wins}</td><td>{team.losses}</td><td>{team.legsDiff > 0 ? "+" : ""}{team.legsDiff}</td><td><strong>{team.points}</strong></td></tr>)}</tbody>
        </StatsTable></div><footer className="round-robin-legend"><span><i className="rr-legend-win" /> Victoire</span><span><i className="rr-legend-loss" /> Défaite</span><span>Les quatre premières doublettes accèdent aux demi-finales.</span></footer>
      </article>
    </section>

    <section id="m2-finale" className="bdc-report-block">
      <div className="bdc-report-title"><div><span>03</span><h3>Phase finale</h3></div><small>Premier à 3 legs</small></div>
      <div className="bdc-bracket" aria-label="Phase finale de la manche 2"><div><span className="bdc-bracket-label">Demi-finales</span>{semis.map(match => <Result key={match.id} match={match} />)}</div><div className="bdc-bracket-arrow" aria-hidden="true">›</div><div><span className="bdc-bracket-label">Finale</span><Result match={final} /><div className="bdc-champion"><span>CHAMPIONS MANCHE 02</span><strong>{champion.name}</strong></div></div></div>
      <details className="bdc-data-disclosure"><summary>Match pour la 3e place</summary><div className="bdc-third-place"><Result match={third} /></div></details>
    </section>

    <section id="m2-joueurs" className="bdc-report-block">
      <div className="bdc-report-title"><div><span>04</span><h3>Performances individuelles</h3></div><small>14 joueurs · toutes les volées vérifiées</small></div>
      <div className="bdc-leaders"><article className="bdc-leader-card"><span>Meilleure moyenne 3 darts</span><strong>{fmt(topAverage.average3)}</strong><small>{topAverage.name}</small></article><article className="bdc-leader-card"><span>Plus haut finish</span><strong>{topFinish.bestFinish}</strong><small>{topFinish.name}</small></article><article className="bdc-leader-card"><span>180</span><strong>{round.playerStats.reduce((sum, player) => sum + player.visits180, 0)}</strong><small>Sur l’ensemble de la manche</small></article></div>
      <div className="bdc-table-scroll" role="region" aria-label="Statistiques individuelles de la manche 2" tabIndex={0}><StatsTable className="bdc-table"><thead><tr><th>Joueur</th><th>Matchs</th><th>Legs</th><th>Moy. 3 darts</th><th>First 9</th><th>Score</th><th>Part du duo</th><th>Finishes</th><th>Haut finish</th><th>100–139</th><th>140–169</th><th>170–179</th><th>180</th></tr></thead><tbody>
        {round.playerStats.map(player => <tr key={player.id}><th scope="row">{player.name}</th><td>{player.matches}</td><td>{player.legs}</td><td><strong>{fmt(player.average3)}</strong></td><td>{fmt(player.first9)}</td><td>{fmt(player.score)}</td><td>{fmt(player.contribution)} %</td><td>{player.finishes.length}</td><td>{player.bestFinish ?? "—"}</td><td>{player.visits100}</td><td>{player.visits140}</td><td>{player.visits170}</td><td>{player.visits180}</td></tr>)}
      </tbody></StatsTable></div><p className="bdc-note">First 9 : moyenne sur les neuf premières fléchettes disponibles de chaque joueur, dans chaque leg. Les performances sont attribuées selon l’ordre des joueurs enregistré pour chaque leg.</p>
    </section>

    <section id="m2-tournoi" className="bdc-report-block">
      <div className="bdc-report-title"><div><span>05</span><h3>Statistiques des doublettes</h3></div><small>Ensemble de la manche</small></div>
      <div className="bdc-table-scroll" role="region" aria-label="Statistiques des doublettes de la manche 2" tabIndex={0}><StatsTable className="bdc-table"><thead><tr><th>Doublette</th><th>Matchs</th><th>Victoires</th><th>Legs</th><th>Legs gagnés</th><th>Moy. 3 darts</th><th>First 9 duo</th><th>100–139</th><th>140–169</th><th>180</th><th>Haut finish</th></tr></thead><tbody>
        {round.results.map(team => <tr key={team.teamId}><th scope="row">{team.name}</th><td>{team.stats.match}</td><td>{team.stats.winMatch}</td><td>{team.stats.leg}</td><td>{team.stats.winLeg}</td><td>{fmt(average(team.stats.score, team.stats.darts))}</td><td>{fmt(average(team.stats.f9Score, team.stats.f9Darts))}</td><td>{team.stats.ton00}</td><td>{team.stats.ton40}</td><td>{team.stats.ton80}</td><td>{team.stats.highOut || "—"}</td></tr>)}
      </tbody></StatsTable></div>
    </section>

    <section id="m2-matchs" className="bdc-report-block"><div className="bdc-report-title"><div><span>06</span><h3>Les 25 rencontres en détail</h3></div><small>Ordre chronologique · ouvrir un match</small></div><div className="bdc-match-list">{round.matches.map(match => <MatchDetails key={match.id} match={match} />)}</div></section>

    <section id="m2-points" className="bdc-report-block">
      <div className="bdc-report-title"><div><span>07</span><h3>Classement de la manche et points BDC</h3></div><small>Points en attente</small></div>
      <p className="bdc-note">Cette manche a réuni 7 doublettes. L’application du barème à cet effectif reste à confirmer auprès de l’organisateur avant le cumul des points individuels. Le classement général ci-dessous couvre encore la manche 1.</p>
      <div className="bdc-table-scroll" role="region" aria-label="Classement de la manche 2" tabIndex={0}><StatsTable className="bdc-table"><thead><tr><th>Place</th><th>Doublette</th><th>Victoires de poule</th><th>Points par joueur</th></tr></thead><tbody>{round.results.map(team => <tr key={team.teamId}><td>{team.place}</td><th scope="row">{team.name}</th><td>{team.poolWins}/6</td><td>En attente</td></tr>)}</tbody></StatsTable></div>
      <p className="bdc-note">Source : résultats et feuilles Nakka du 9 octobre 2026. Les résultats et le classement officiels sont tenus par le directeur sportif du Tampon Darts Club.</p>
    </section>
  </section>;
}
