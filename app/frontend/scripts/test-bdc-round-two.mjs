import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const round = JSON.parse(readFileSync(new URL('../lib/bdc-round-two.json', import.meta.url)));
assert.equal(round.sourceUrl, 'https://n01darts.com/n01/league/season.php?id=t_sEW0_8920');
assert.equal(round.pointsStatus, 'provisional-ds-review');
assert.equal(round.results.length, 7);
assert.equal(round.playerStats.length, 14);
assert.equal(round.matches.length, 25);
assert.equal(new Set(round.matches.map(match => match.id)).size, 25);
const pool = round.matches.filter(match => match.phase === 'Poule');
assert.equal(pool.length, 21);
assert.equal(new Set(pool.map(match => [match.teamA.teamId, match.teamB.teamId].sort().join(':'))).size, 21);
for (const team of round.results) {
  const matches = round.matches.filter(match => [match.teamA.teamId, match.teamB.teamId].includes(team.teamId));
  const own = match => match.teamA.teamId === team.teamId ? match.teamA : match.teamB;
  assert.equal(matches.length, team.stats.match);
  assert.equal(matches.filter(match => match.phase === 'Poule').length, 6);
  assert.equal(matches.filter(match => match.phase === 'Poule' && own(match).score === 2).length, team.poolWins);
  assert.equal(matches.reduce((total, match) => total + own(match).recordedScore, 0), team.stats.score);
  assert.equal(matches.reduce((total, match) => total + own(match).recordedDarts, 0), team.stats.darts);
  const players = round.playerStats.filter(player => player.teamId === team.teamId);
  assert.equal(players.length, 2);
  assert.equal(players.reduce((total, player) => total + player.score, 0), team.stats.score);
  assert.equal(players.reduce((total, player) => total + player.darts, 0), team.stats.darts);
}
assert.equal(round.matches.reduce((total, match) => total + match.legs, 0), 64);
assert.equal(round.playerStats.reduce((total, player) => total + player.finishes.length, 0), 64);
const final = round.matches.find(match => match.phase === 'Finale');
const winner = final.teamA.score > final.teamB.score ? final.teamA : final.teamB;
assert.equal(winner.name, 'Kozu / Vincent');
assert.equal(winner.score, 3);
assert.equal(final.legs, 5);
assert.deepEqual(round.results.map(team => team.poolWins), [4, 6, 4, 3, 2, 1, 1]);
assert.deepEqual(round.results.map(team => team.points), [11, 9, 8, 7, 4, 3, 3]);
const yoann = round.playerStats.find(player => player.name === 'Yoann');
assert.equal(yoann.bestFinish, 125);
assert.equal(round.playerStats.reduce((total, player) => total + player.visits180, 0), 0);
const nicolas = round.playerStats.find(player => player.name === 'Nicolas');
assert.equal(nicolas.average3, 41.84);
assert.equal(nicolas.score, 3710);
assert.equal(nicolas.darts, 266);
assert.equal(round.matches.every(match => match.teamA.score + match.teamB.score === match.legs), true);
const source = readFileSync(new URL('../lib/bdc.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { BDC_RESULTS, bdcPoints, bdcStandings } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const second = BDC_RESULTS.find(result => result.round === 2);
assert.equal(second.teamCount, 7);
assert.equal(second.provisional, true);
assert.equal(bdcPoints(1, 4, 7), 11);
assert.equal(bdcPoints(7, 1, 7), 3);
assert.throws(() => bdcPoints(8, 0, 7));
for (const team of second.teams) {
  const audited = round.results.find(result => result.teamId === team.id);
  assert.equal(team.place, audited.place);
  assert.equal(team.poolWins, audited.poolWins);
  assert.equal(bdcPoints(team.place, team.poolWins, second.teamCount), audited.points);
}
const standings = bdcStandings(BDC_RESULTS);
assert.equal(standings.length, 21, 'Merge confirmed M1/M2 identities; keep five new participants');
assert.equal(standings.reduce((total, player) => total + player.total, 0), 196);
assert.equal(standings.filter(player => player.provisionalRounds.includes(2)).length, 14);
assert.equal(standings.filter(player => player.provisionalRounds.length === 0).length, 7);
assert.ok(standings.every(player => !player.pending && !player.eligible && player.participations <= 2));
for (const [id, total, rank] of [
  ['vincent-tdc', 19, 1], ['alexandre-pdc', 18, 2], ['abrousse-tdc', 17, 3],
  ['kevin-tdc', 16, 4], ['guillaume-tdc', 15, 5], ['super-mario-tdc', 14, 6],
  ['benjamin-tdc', 12, 7], ['yoann-kaz', 12, 7], ['pierre-tdc', 11, 9],
  ['kozu', 11, 9], ['nicolas-pdc', 8, 11],
]) {
  const player = standings.find(row => row.id === id);
  assert.equal(player.total, total, id);
  assert.equal(player.rank, rank, id);
}
const nicolasStanding = standings.find(player => player.id === 'nicolas-pdc');
assert.equal(nicolasStanding.participations, 2);
assert.deepEqual(nicolasStanding.points, [4, 4, null, null, null, null]);
assert.deepEqual(nicolasStanding.provisionalRounds, [2]);
const kozu = standings.find(player => player.id === 'kozu');
assert.equal(kozu.participations, 1, 'Visiting participant has no invented M1 history');
assert.deepEqual(kozu.points, [null, 11, null, null, null, null]);
assert.deepEqual(kozu.provisionalRounds, [2]);
console.log('BDC M2: 25 matches, 64 legs, 14 player totals and 21 cumulative standings reconciled; M2 points are provisional pending sporting director validation.');
