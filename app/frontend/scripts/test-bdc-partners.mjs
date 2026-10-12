import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

// Execute the real TypeScript modules and JSON sources, without adding a test runtime dependency.
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'bdc-partners-'));
const modules = new Map();
function compile(file) {
  if (modules.has(file)) return modules.get(file);
  const target = join(temporary, `${modules.size}.mjs`);
  modules.set(file, target);
  if (file.endsWith('.json')) {
    writeFileSync(target, `export default ${readFileSync(file, 'utf8')};`);
    return target;
  }
  const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  const output = outputText.replace(/(\bfrom\s*|\bimport\s*)["']([^"']+)["']/g, (original, prefix, specifier) => {
    if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return original;
    const base = specifier.startsWith('@/') ? resolve(root, specifier.slice(2)) : resolve(dirname(file), specifier);
    const source = [base, `${base}.ts`, `${base}.tsx`, `${base}.json`, join(base, 'index.ts')].find(path => existsSync(path) && statSync(path).isFile());
    assert.ok(source, `Resolve test import ${specifier} from ${file}`);
    return `${prefix}${JSON.stringify(pathToFileURL(compile(source)).href)}`;
  });
  writeFileSync(target, output);
  return target;
}

try {
  const { analyzeBdcPartners, canonicalPairKey, getBdcPartnerData, normalizeBdcPartnerSources, BDC_PARTNER_SOURCES, weightedAverage3 } = await import(pathToFileURL(compile(join(root, 'lib/bdc-partners/index.ts'))).href);
  const { bdcPlayerForPublicProfile, bdcSeasonAffiliation } = await import(pathToFileURL(compile(join(root, 'lib/bdc-profile-links.ts'))).href);
  const close = (value, expected, message) => assert.ok(value !== null && Math.abs(value - expected) < 1e-9, `${message}: ${value} != ${expected}`);
  const filters = { season: 2027, rounds: [1, 2], phase: 'pool' };
  const data = getBdcPartnerData();
  assert.equal(data.matches.length, 57);
  assert.equal(data.players.length, 21);
  assert.equal(new Set(data.matches.map(match => match.id)).size, 57);
  assert.equal(data.matches.filter(match => match.round === 1 && match.statisticsComplete).length, 28);
  assert.equal(data.matches.filter(match => match.round === 2 && match.statisticsComplete).length, 25);
  assert.equal(data.players.find(player => player.id === 'pierre-tdc').team, 'Papangue Darts Club - Neige');
  assert.equal(bdcSeasonAffiliation('pierre-tdc', 2026), null);
  assert.equal(bdcPlayerForPublicProfile('Nicolas DUPONT'), 'nicolas-pdc');
  assert.equal(bdcPlayerForPublicProfile('Nico'), 'nicolas-pdc');
  assert.equal(bdcPlayerForPublicProfile('Nicolas'), null);
  assert.equal(bdcPlayerForPublicProfile('Laurent'), null);
  assert.equal(bdcPlayerForPublicProfile('Stéphane ABROUSSE'), 'abrousse-tdc');
  assert.equal(bdcPlayerForPublicProfile('Mario DEVILLE'), 'super-mario-tdc');
  assert.equal(data.players.find(player => player.id === 'laurent-bdc').club, null);
  assert.equal(data.participations.filter(participation => participation.playerIds.includes('abrousse-tdc')).length, 2);
  assert.equal(data.participations.filter(participation => participation.playerIds.includes('super-mario-tdc')).length, 2);
  assert.equal(data.participations.find(participation => participation.playerIds.includes('kozu')).round, 2);

  const nico = analyzeBdcPartners('nicolas-pdc', filters, data);
  assert.deepEqual(nico.partners.map(partner => partner.partner.id).sort(), ['jeff-tdc', 'laurent-bdc']);
  const jeff = nico.partners.find(partner => partner.partner.id === 'jeff-tdc');
  const laurent = nico.partners.find(partner => partner.partner.id === 'laurent-bdc');
  assert.deepEqual([jeff.result.matches, jeff.result.wins, jeff.result.legsWon, jeff.result.legsLost], [7, 2, 5, 12]);
  assert.deepEqual([laurent.result.matches, laurent.result.wins, laurent.result.legsWon, laurent.result.legsLost], [6, 2, 5, 9]);
  close(jeff.playerStats.average3, 3 * 4005 / 283, 'M1 Nicolas weighted');
  close(laurent.playerStats.average3, 3 * 3710 / 266, 'M2 Nicolas weighted');
  close(jeff.playerStats.first9, 48.3125, 'M1 First9 weighted');
  close(laurent.playerStats.first9, 49.666666666666664, 'M2 First9 weighted');
  close(jeff.duoStats.average3, 3 * 7202 / 538, 'M1 collective weighted');
  close(laurent.duoStats.average3, 3 * 6690 / 519, 'M2 collective weighted');
  assert.equal(jeff.coverage.matches, 7);
  assert.equal(jeff.coverage.completeMatches, 6);
  assert.equal(jeff.coverage.partial, true);
  assert.equal(laurent.coverage.partial, false);
  assert.equal(laurent.roundResults[0].pointsStatus, 'provisional');
  assert.equal(laurent.roundResults[0].points, 4);
  assert.equal(jeff.playerStats.finishCount, 3);
  assert.equal(laurent.playerStats.finishCount, 2);
  assert.equal(jeff.playerStats.frequency100Plus, null);
  assert.equal(jeff.playerStats.checkoutPercent, null);
  close(jeff.playerReference.difference, jeff.playerStats.average3 - laurent.playerStats.average3, 'Reference excludes own association');
  assert.deepEqual(jeff.playerReference.partnerIds, ['laurent-bdc']);
  assert.deepEqual(jeff.observations.find(observation => observation.metric === 'playerReference.difference').rounds, [1, 2], 'Delta provenance includes compared reference rounds');
  assert.equal(jeff.partnerReference.average3, null);
  assert.equal(laurent.partnerReference.average3, null);
  assert.equal(jeff.chronological, false);
  assert.equal(laurent.chronological, true);
  assert.deepEqual(nico.conclusions.find(conclusion => conclusion.criterion === 'results').partnerIds, ['laurent-bdc']);
  assert.deepEqual(nico.conclusions.find(conclusion => conclusion.criterion === 'individual').partnerIds, ['jeff-tdc']);
  assert.deepEqual(nico.conclusions.find(conclusion => conclusion.criterion === 'collective').partnerIds, ['jeff-tdc']);
  assert.deepEqual(nico.bestObservedPartnerIds, []);
  const inverseJeff = analyzeBdcPartners('jeff-tdc', filters, data).partners[0];
  assert.equal(inverseJeff.pairKey, jeff.pairKey);
  assert.equal(inverseJeff.duoStats.average3, jeff.duoStats.average3);
  assert.equal(inverseJeff.duoStats.score, jeff.duoStats.score);
  assert.deepEqual(inverseJeff.result, jeff.result);
  assert.ok(analyzeBdcPartners('jeff-tdc', filters, data).conclusions.every(conclusion => conclusion.status === 'single-partner' && conclusion.partnerIds.length === 0));
  assert.equal(analyzeBdcPartners('bad-id', filters, data).player, null);
  assert.equal(analyzeBdcPartners('nicolas-pdc', { ...filters, rounds: [] }, data).partners.length, 0);
  assert.equal(analyzeBdcPartners('nicolas-pdc', { ...filters, season: 2026 }, data).partners.length, 0);
  assert.equal(analyzeBdcPartners('nicolas-pdc', { ...filters, phase: 'finals' }, data).partners.every(partner => partner.matches.length === 0), true);
  const allMario = analyzeBdcPartners('super-mario-tdc', { ...filters, phase: 'all' }, data);
  const marioM1 = allMario.partners.find(partner => partner.partner.id === 'pierre-tdc');
  assert.equal(marioM1.result.unknownLegMatches, 2);
  assert.equal(marioM1.result.legsComparable, false);
  assert.equal(allMario.conclusions[0].metric, 'winRate', 'Sets force explicit match-win criterion');
  for (const player of data.players) {
    for (const partner of analyzeBdcPartners(player.id, filters, data).partners) {
      const inverse = analyzeBdcPartners(partner.partner.id, filters, data).partners.find(entry => entry.partner.id === player.id);
      assert.equal(partner.duoStats.average3, inverse.duoStats.average3, 'Collective A+B symmetry');
      assert.deepEqual(partner.result, inverse.result);
      assert.equal(partner.partnerReference.average3, inverse.playerReference.average3, 'Other-partner reference symmetry');
      assert.ok(partner.matches.every(row => row.playerStats === null || row.playerStats.playerId === player.id));
    }
  }
  assert.throws(() => normalizeBdcPartnerSources([BDC_PARTNER_SOURCES[0], BDC_PARTNER_SOURCES[0]]), /dupliquée/);
  const duplicateSelection = structuredClone(BDC_PARTNER_SOURCES[0]);
  duplicateSelection.selection.matches.push(duplicateSelection.selection.matches[0]);
  assert.throws(() => normalizeBdcPartnerSources([duplicateSelection]), /compté deux fois/);
  const wrongIdentity = structuredClone(BDC_PARTNER_SOURCES[1]);
  wrongIdentity.selection.matches[0].teamA.players[0].id = 'unknown-nakka-id';
  assert.throws(() => normalizeBdcPartnerSources([wrongIdentity]), /Attribution BDC/);

  // Synthetic fixtures deliberately separate sporting results, throwing data and source coverage.
  const makeStats = (id, score, darts, overrides = {}) => ({
    playerId: id, score, darts, first9Score: score / 2, first9Darts: darts / 2,
    visits100: 1, visits140: 1, visits170: 1, visits180: 1, zeroVisits: 0,
    visits: null, doubleAttempts: null, finishes: [], ...overrides,
  });
  const players = ['p', 'q', 'r', 's', 'o1', 'o2'].map(id => ({ id, name: id.toUpperCase(), club: null, team: null }));
  const makeMatch = (id, round, ids, stats, overrides = {}) => ({
    id, round, season: 2027, date: round === 1 ? '2026-09-11' : '2026-10-09',
    phase: 'pool', phaseLabel: 'Poule', startedAt: null, scoreUnit: 'legs', recordedLegs: 3, officialLegs: 3,
    statisticsComplete: true, sourceStatus: 'verified', sourceFile: 'fixture', sourceUrl: 'fixture',
    teamA: { teamId: `${round}-${ids.join('-')}`, name: ids.join(' / '), playerIds: ids, score: 2, players: stats },
    teamB: { teamId: 'opponents', name: 'O1 / O2', playerIds: ['o1', 'o2'], score: 1, players: [makeStats('o1', 0, 0), makeStats('o2', 0, 0)] },
    ...overrides,
  });
  const fixture = (matches) => ({
    players, rounds: [], matches,
    participations: [...new Map(matches.map(match => [`${match.round}-${canonicalPairKey(...match.teamA.playerIds)}`, {
      round: match.round, season: match.season, date: match.date, teamId: match.teamA.teamId,
      pairKey: canonicalPairKey(...match.teamA.playerIds), playerIds: match.teamA.playerIds,
      place: 5, points: 4, pointsStatus: 'validated',
    }])).values()],
  });
  const a = makeMatch('a', 1, ['p', 'q'], [makeStats('p', 300, 30), makeStats('q', 600, 30)]);
  const b = makeMatch('b', 1, ['p', 'q'], [makeStats('p', 900, 45), makeStats('q', 300, 15)]);
  const c = makeMatch('c', 2, ['p', 'r'], [makeStats('p', 600, 30), makeStats('r', 300, 30)]);
  const d = makeMatch('d', 2, ['q', 's'], [makeStats('q', 100, 30), makeStats('s', 500, 30)]);
  const synthetic = analyzeBdcPartners('p', filters, fixture([a, b, c, d]));
  const withQ = synthetic.partners.find(partner => partner.partner.id === 'q');
  close(withQ.playerStats.average3, 48, '300/30+900/45 must be 48, not average 45');
  close(withQ.playerStats.first9, 48, 'Aggregate First9 numerators/denominators');
  close(withQ.duoStats.average3, 3 * 2100 / 120, 'Unequal player weights');
  close(withQ.playerStats.scoringShare, 1200 / 2100 * 100, 'Score contribution common perimeter');
  close(withQ.playerStats.dartsShare, 75 / 120 * 100, 'Darts share has its own denominator');
  assert.equal(withQ.playerStats.visits100Plus, 8, 'Four disjoint categories counted once each match');
  assert.equal(withQ.playerStats.finishCount, 0, 'Recorded true zero preserved');
  assert.equal(withQ.playerStats.bestFinish, null);
  assert.equal(withQ.playerStats.dispersion.value, null, 'Two complete matches not enough');
  close(withQ.playerReference.average3, 60, 'P other partners');
  close(withQ.partnerReference.average3, 10, 'Q other partners symmetric');
  const onlyRound1 = analyzeBdcPartners('p', { ...filters, rounds: [1] }, fixture([a, b, c, d]));
  assert.equal(onlyRound1.partners[0].playerReference.average3, null, 'Round filters also apply to reference');
  assert.equal(onlyRound1.partners[0].partnerReference.average3, null);
  const third = makeMatch('e', 1, ['p', 'q'], [makeStats('p', 600, 30), makeStats('q', 300, 30)]);
  const dispersion = analyzeBdcPartners('p', filters, fixture([a, b, third])).partners[0].playerStats.dispersion;
  close(dispersion.value, Math.sqrt((30 * (30 - 3 * 1800 / 105) ** 2 + 45 * (60 - 3 * 1800 / 105) ** 2 + 30 * (60 - 3 * 1800 / 105) ** 2) / 105), 'Weighted dispersion');
  assert.equal(dispersion.matches, 3);
  const incompleteThird = { ...third, statisticsComplete: false, recordedLegs: 2 };
  assert.equal(analyzeBdcPartners('p', filters, fixture([a, b, incompleteThird])).partners[0].playerStats.dispersion.value, null);
  const absent = makeMatch('absent', 1, ['p', 'q'], [null, null], { statisticsComplete: false, recordedLegs: 0 });
  const noData = analyzeBdcPartners('p', filters, fixture([absent])).partners[0];
  assert.equal(noData.playerStats.score, null);
  assert.equal(noData.playerStats.finishCount, null);
  assert.equal(noData.playerStats.zeroVisits, null);
  assert.equal(noData.result.wins, 1, 'Sporting result survives absent throwing data');
  assert.equal(noData.coverage.matches, 0);
  assert.equal(noData.coverage.totalMatches, 1);
  const partial = analyzeBdcPartners('p', filters, fixture([a, absent])).partners[0];
  assert.equal(partial.playerStats.score, 300);
  assert.equal(partial.coverage.partial, true);
  const oneMember = makeMatch('one-member', 1, ['p', 'q'], [makeStats('p', 300, 30), null], { statisticsComplete: false });
  const oneMemberAnalysis = analyzeBdcPartners('p', filters, fixture([oneMember])).partners[0];
  assert.equal(oneMemberAnalysis.playerStats.average3, 30, 'Keep independently recorded individual data');
  assert.equal(oneMemberAnalysis.duoStats.average3, null, 'Do not replace absent partner statistics by zero');
  assert.equal(oneMemberAnalysis.playerStats.scoringShare, null, 'Contributions require same recorded duo perimeter');
  assert.equal(weightedAverage3(0, 0), null);
  assert.equal(weightedAverage3(null, 1), null);
  assert.equal(weightedAverage3(0, 1), 0);
  assert.equal(weightedAverage3(Number.NaN, 1), null);
  assert.equal(weightedAverage3(Number.POSITIVE_INFINITY, 1), null);
  const zeroDenominator = analyzeBdcPartners('p', filters, fixture([makeMatch('zero', 1, ['p', 'q'], [makeStats('p', 0, 0), makeStats('q', 0, 0)])])).partners[0];
  assert.equal(zeroDenominator.playerStats.average3, null);
  assert.equal(zeroDenominator.playerStats.scoringShare, null);
  assert.equal(zeroDenominator.duoStats.average3, null);
  const finishData = makeMatch('finishes', 1, ['p', 'q'], [makeStats('p', 100, 30, { finishes: [{ value: 40, darts: 1, leg: 1, matchId: 'finishes' }], visits: 10, doubleAttempts: 2 }), makeStats('q', 200, 30)]);
  const finishStats = analyzeBdcPartners('p', filters, fixture([finishData])).partners[0].playerStats;
  assert.equal(finishStats.checkoutPercent, 50);
  assert.equal(finishStats.frequency100Plus, 40, 'Frequency only uses observed visits');
  assert.equal(finishStats.finishShare, 100, 'Finish share is separate from checkout success');
  const finals = { ...b, id: 'finals', phase: 'finals', phaseLabel: 'Finale', scoreUnit: 'sets' };
  const phaseTest = fixture([a, finals, c]);
  close(analyzeBdcPartners('p', { ...filters, phase: 'pool' }, phaseTest).partners.find(partner => partner.partner.id === 'q').playerStats.average3, 30, 'Phase applied to scoring');
  const all = analyzeBdcPartners('p', { ...filters, phase: 'all' }, phaseTest);
  assert.equal(all.conclusions[0].metric, 'winRate');
  assert.equal(all.partners.find(partner => partner.partner.id === 'q').result.legsWon, 2, 'Sets excluded from legs');
  assert.equal(all.partners.find(partner => partner.partner.id === 'q').roundResults[0].points, 4, 'Round points independent of phase');
  const tieMatch = makeMatch('tie', 2, ['p', 'r'], [makeStats('p', 300, 30), makeStats('r', 600, 30)]);
  const tied = analyzeBdcPartners('p', filters, fixture([a, tieMatch]));
  assert.ok(tied.conclusions.every(conclusion => conclusion.partnerIds.length === 2));
  assert.deepEqual(tied.bestObservedPartnerIds.sort(), ['q', 'r']);
  const unavailableComparison = analyzeBdcPartners('p', filters, fixture([absent, c]));
  assert.equal(unavailableComparison.conclusions.find(conclusion => conclusion.criterion === 'individual').status, 'insufficient');
  assert.equal(unavailableComparison.conclusions.find(conclusion => conclusion.criterion === 'individual').partnerIds.length, 0);
  assert.deepEqual(analyzeBdcPartners('p', filters, fixture([a, b, c, d])), synthetic, 'Deterministic observations');
  console.log('BDC partners: audited M1/M2 identities, weighted averages, First9, corrected sports scores, sets, null/zero, per-pair coverage, symmetric references, phase/round filters, weighted dispersion, ties and deterministic observations passed.');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
