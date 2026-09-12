import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/bdc.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { BDC_RESULTS, bdcPoints, bdcStandings, bdcCalendarRound } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
assert.equal(bdcPoints(1, 5, 8), 11, 'Pool bonus capped at three');
assert.equal(bdcPoints(8, 0, 8), 2);
assert.equal(bdcPoints(12, 1, 12), 2);
assert.throws(() => bdcPoints(9, 0, 8));
assert.throws(() => bdcPoints(1, -1, 8));
assert.throws(() => bdcPoints(1.5, 0, 8));
const a = { id: 'a', name: 'A' }, b = { id: 'b', name: 'B' }, c = { id: 'c', name: 'C' };
const round = (number, players, place = 1, poolWins = 2) => ({ round: number, teamCount: 8, teams: [{ id: `duo-${number}`, players, place, poolWins }] });
const rows = bdcStandings([round(1, [a, b]), round(2, [a, c]), round(3, [a, b])]);
assert.equal(rows.find(row => row.id === 'a').total, 30, 'Keep points when changing partner');
assert.equal(rows.find(row => row.id === 'b').total, 20, 'Full points for each partner');
assert.equal(rows.find(row => row.id === 'a').eligible, true);
assert.equal(rows.find(row => row.id === 'b').eligible, false);
assert.equal(rows.find(row => row.id === 'a').participations, 3);
assert.equal(rows.find(row => row.id === 'b').points[1], null, 'No attendance is not a zero result');
const tied = bdcStandings([round(1, [a, b])]);
assert.deepEqual(tied.map(row => row.rank), [1, 1], 'Do not invent tie-breaks');
const pending = bdcStandings([round(1, [a, b], null, null)]);
assert.equal(pending[0].pending, true);
assert.equal(pending[0].points[0], null);
assert.throws(() => bdcStandings([round(1, [a, a])]), /Joueur/);
assert.throws(() => bdcStandings([round(1, [a, b]), round(1, [a, c])]), /Manche/);
assert.throws(() => bdcStandings([round(7, [a, b])]), /Manche/);
assert.equal(bdcCalendarRound('Blind Draw Championship by TDC - Manche 1', '2026-09-11').number, 1);
assert.equal(bdcCalendarRound('Autre tournoi', '2026-09-11'), undefined);
assert.deepEqual(bdcStandings([]), []);
const finalRows = bdcStandings(BDC_RESULTS);
assert.equal(finalRows.length, 16);
assert.ok(finalRows.every(row => row.participations === 1 && !row.eligible && !row.pending));
assert.equal(finalRows.find(row => row.id === 'nicolas-pdc').total, 4);
assert.equal(finalRows.find(row => row.id === 'jeff-tdc').total, 4);
assert.deepEqual(BDC_RESULTS[0].teams.map(team => bdcPoints(team.place, team.poolWins, 8)), [11, 9, 8, 7, 5, 5, 4, 4]);
const snapshot = JSON.parse(readFileSync(new URL('../lib/bdc-round-one.json', import.meta.url), 'utf8'));
const matches = JSON.parse(readFileSync(new URL('../lib/bdc-round-one-matches.json', import.meta.url), 'utf8'));
assert.equal(matches.length, 32);
assert.equal(new Set(matches.map(match => match.tmid)).size, 32);
assert.equal(matches.filter(match => match.tmid.includes('_rr_')).length, 28);
for (const team of BDC_RESULTS[0].teams) {
  const wins = Object.entries(snapshot.pool[team.id]).filter(([other, result]) => result.r > snapshot.pool[other][team.id].r).length;
  assert.equal(wins, team.poolWins, 'Use corrected bracket wins, not incomplete recorded legs');
}
const rawDetail = JSON.parse(readFileSync(new URL('../lib/bdc-round-one-details.json', import.meta.url), 'utf8'));
assert.equal(rawDetail.matches.length, 32);
assert.equal(rawDetail.quality.individualMatches, 31);
assert.equal(rawDetail.quality.incompleteMatches, 3);
assert.equal(rawDetail.quality.unavailableMatches, 1);
assert.equal(rawDetail.matches.filter(match => match.dataStatus === 'partial-individual').length, 28);
assert.equal(rawDetail.matches.filter(match => match.dataStatus === 'partial-individual-incomplete').length, 3);
assert.equal(rawDetail.matches.filter(match => match.dataStatus === 'unavailable-individual').length, 1);
assert.equal(rawDetail.poolStandings.length, 8);
assert.equal(rawDetail.poolStandings[0].teamId, 'wAHs');
assert.equal(rawDetail.poolStandings[7].teamId, 'iTep');
const poolMatches = rawDetail.matches.filter(match => match.phase === 'Poule');
assert.equal(poolMatches.length, 28);
assert.equal(new Set(poolMatches.map(match => [match.teamA.teamId, match.teamB.teamId].sort().join(':'))).size, 28, 'Every Round Robin pairing appears once');
for (const standing of rawDetail.poolStandings) {
  assert.equal(poolMatches.filter(match => match.teamA.teamId === standing.teamId || match.teamB.teamId === standing.teamId).length, 7);
}
for (const match of rawDetail.matches.filter(match => match.dataStatus !== 'unavailable-individual')) {
  for (const side of [match.teamA, match.teamB]) {
    assert.equal(side.players.reduce((sum, player) => sum + player.darts, 0), side.recordedDarts, `Player darts match duo darts in ${match.id}`);
    assert.ok(side.players.every(player => player.zeroVisits >= 0));
  }
}
const allAuditedPlayers = rawDetail.matches.flatMap(match => [match.teamA, match.teamB]).flatMap(side => side.players ?? []);
assert.equal(allAuditedPlayers.flatMap(player => player.finishes).length, 81);
assert.equal(allAuditedPlayers.reduce((sum, player) => sum + player.zeroVisits, 0), 86);
assert.equal(allAuditedPlayers.reduce((sum, player) => sum + player.visits100, 0), 82);
assert.equal(allAuditedPlayers.reduce((sum, player) => sum + player.visits140, 0), 13);
assert.equal(allAuditedPlayers.reduce((sum, player) => sum + player.visits170, 0), 0);
assert.equal(allAuditedPlayers.reduce((sum, player) => sum + player.visits180, 0), 3);
for (const global of rawDetail.playerStats) {
  const appearances = rawDetail.matches.flatMap(match => [match.teamA, match.teamB])
    .filter(side => side.players?.some(player => player.name === global.name));
  const rows = appearances.map(side => side.players.find(player => player.name === global.name));
  const sum = field => rows.reduce((total, player) => total + player[field], 0);
  assert.equal(global.matches, rows.length);
  for (const field of ['score', 'darts', 'first9Score', 'first9Darts', 'visits100', 'visits140', 'visits170', 'visits180', 'zeroVisits']) {
    assert.equal(global[field], sum(field), `${field} aggregate for ${global.name}`);
  }
  assert.equal(global.finishes.length, rows.reduce((total, player) => total + player.finishes.length, 0));
  assert.equal(global.duoScore, appearances.reduce((total, side) => total + side.players.reduce((score, player) => score + player.score, 0), 0));
  assert.equal(global.average3, Math.round((global.score * 3 / global.darts) * 100) / 100);
  assert.equal(global.first9, Math.round((global.first9Score * 3 / global.first9Darts) * 100) / 100);
  assert.equal(global.contribution, Math.round((global.score / global.duoScore) * 1000) / 10);
}
const page = readFileSync(new URL('../components/BdcRoundTemplate.tsx', import.meta.url), 'utf8');
assert.match(page, /Donnée indisponible – incident Nakka/);
assert.match(page, /BdcRoundRobinMatrix/);
assert.match(page, /round-robin-table/);
assert.match(page, /liste chronologique des 28 rencontres/);
assert.doesNotMatch(page, /n01darts\.com|Feuille Nakka/);
const profileSource = readFileSync(new URL('../lib/bdc-player-profile.ts', import.meta.url), 'utf8')
  .replace('import { bdcPoints, type BdcRoundResult } from "@/lib/bdc";', `const bdcPoints = ${bdcPoints.toString()}; type BdcRoundResult = any;`);
const profileModule = ts.transpileModule(profileSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { buildBdcPlayerRoundProfile, BDC_UNAVAILABLE } = await import(`data:text/javascript;base64,${Buffer.from(profileModule.outputText).toString('base64')}`);
const detail = rawDetail;
const profiles = BDC_RESULTS[0].teams.flatMap(team => team.players.map(player => buildBdcPlayerRoundProfile(player.id, BDC_RESULTS[0], detail, snapshot)));
assert.equal(profiles.length, 16);
assert.ok(profiles.every(Boolean));
assert.ok(profiles.every(profile => profile.matches.length === profile.matchesPlayed));
assert.ok(profiles.every(profile => profile.matches.filter(match => match.available).length === profile.matchesCovered));
assert.ok(profiles.every(profile => profile.matches.filter(match => match.result === 'Victoire').length === profile.matchesWon));
assert.ok(profiles.every(profile => profile.zeroVisits !== null));
assert.ok(profiles.every(profile => profile.matches.filter(match => match.available).every(match => match.zeroVisits !== null)));
const nicolas = profiles.find(profile => profile.player.id === 'nicolas-pdc');
assert.equal(nicolas.partner.id, 'jeff-tdc');
assert.equal(nicolas.matchesPlayed, 7);
assert.equal(nicolas.matchesCovered, 7);
assert.equal(nicolas.matchesIncomplete, 1);
assert.equal(nicolas.points, 4);
assert.equal(nicolas.summary.score, 4005);
assert.equal(nicolas.summary.darts, 283);
assert.equal(nicolas.summary.average3, 42.46);
assert.equal(nicolas.summary.first9, 48.31);
assert.equal(nicolas.summary.contribution, 55.6);
assert.equal(nicolas.summary.zeroVisits, 0);
assert.equal(nicolas.summary.visits100, 4);
assert.equal(nicolas.summary.visits180, 0);
assert.equal(nicolas.summary.finishes.length, 3);
assert.equal(nicolas.summary.bestFinish, 10);
const nicolasKevinFabien = nicolas.matches.find(match => match.id === 'm1-rr_0_iTep_wAHs');
assert.equal(nicolasKevinFabien.available, true);
assert.equal(nicolasKevinFabien.dataComplete, false);
assert.equal(nicolasKevinFabien.recordedLegs, 2);
assert.equal(nicolasKevinFabien.officialLegs, 3);
assert.equal(nicolasKevinFabien.stats.score, 574);
assert.equal(nicolasKevinFabien.stats.average3, 49.2);
assert.equal(nicolasKevinFabien.stats.first9, 69);
assert.equal(nicolasKevinFabien.stats.zeroVisits, 0);
assert.deepEqual(nicolasKevinFabien.stats.finishes, [{ leg: 1, value: 10, darts: 2, matchId: 'm1-rr_0_iTep_wAHs' }]);
assert.equal(BDC_UNAVAILABLE, 'Donnée indisponible – incident Nakka');
const playerPage = readFileSync(new URL('../app/tournaments/blind-draw-championship/manche-1/joueurs/[player_id]/page.tsx', import.meta.url), 'utf8');
assert.match(playerPage, /Partenaire de la manche/);
assert.match(playerPage, /buildBdcPlayerRoundProfile/);
assert.doesNotMatch(playerPage, /n01darts\.com|href=.*nakka/i);
console.log('BDC checks passed: individual points, partner changes, participation, bonus, ties and invalid inputs.');
