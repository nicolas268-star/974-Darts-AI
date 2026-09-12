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
const detail = JSON.parse(readFileSync(new URL('../lib/bdc-round-one-details.json', import.meta.url), 'utf8'));
assert.equal(detail.matches.length, 32);
assert.equal(detail.matches.filter(match => match.dataStatus === 'partial-individual').length, 16);
assert.equal(detail.poolStandings.length, 8);
assert.equal(detail.poolStandings[0].teamId, 'wAHs');
assert.equal(detail.poolStandings[7].teamId, 'iTep');
const page = readFileSync(new URL('../components/BdcRoundTemplate.tsx', import.meta.url), 'utf8');
assert.match(page, /Donnée indisponible – incident Nakka/);
assert.doesNotMatch(page, /n01darts\.com|Feuille Nakka/);
const profileSource = readFileSync(new URL('../lib/bdc-player-profile.ts', import.meta.url), 'utf8')
  .replace('import { bdcPoints, type BdcRoundResult } from "@/lib/bdc";', `const bdcPoints = ${bdcPoints.toString()}; type BdcRoundResult = any;`);
const profileModule = ts.transpileModule(profileSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { buildBdcPlayerRoundProfile, BDC_UNAVAILABLE } = await import(`data:text/javascript;base64,${Buffer.from(profileModule.outputText).toString('base64')}`);
const profiles = BDC_RESULTS[0].teams.flatMap(team => team.players.map(player => buildBdcPlayerRoundProfile(player.id, BDC_RESULTS[0], detail, snapshot)));
assert.equal(profiles.length, 16);
assert.ok(profiles.every(Boolean));
assert.ok(profiles.every(profile => profile.matches.length === profile.matchesPlayed));
assert.ok(profiles.every(profile => profile.matches.filter(match => match.available).length === profile.matchesCovered));
assert.ok(profiles.every(profile => profile.matches.filter(match => match.result === 'Victoire').length === profile.matchesWon));
assert.ok(profiles.every(profile => profile.zeroVisits === null && profile.matches.every(match => match.zeroVisits === null)), 'Never infer zero-score visits');
const nicolas = profiles.find(profile => profile.player.id === 'nicolas-pdc');
assert.equal(nicolas.partner.id, 'jeff-tdc');
assert.equal(nicolas.matchesPlayed, 7);
assert.equal(nicolas.matchesCovered, 3);
assert.equal(nicolas.points, 4);
assert.equal(nicolas.summary.contribution, 55.8);
assert.equal(nicolas.summary.finishes.length, 1);
assert.equal(nicolas.summary.bestFinish, 10);
const nicolasKevinFabien = nicolas.matches.find(match => match.id === 'm1-rr_0_iTep_wAHs');
assert.equal(nicolasKevinFabien.available, false);
assert.deepEqual(nicolasKevinFabien.validatedFinishes, [{
  leg: null,
  value: 10,
  darts: 2,
  matchId: 'm1-rr_0_iTep_wAHs',
  validation: 'manual',
}]);
assert.equal(BDC_UNAVAILABLE, 'Donnée indisponible – incident Nakka');
const playerPage = readFileSync(new URL('../app/tournaments/blind-draw-championship/manche-1/joueurs/[player_id]/page.tsx', import.meta.url), 'utf8');
assert.match(playerPage, /Partenaire de la manche/);
assert.match(playerPage, /buildBdcPlayerRoundProfile/);
assert.doesNotMatch(playerPage, /n01darts\.com|href=.*nakka/i);
console.log('BDC checks passed: individual points, partner changes, participation, bonus, ties and invalid inputs.');
