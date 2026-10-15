import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

const nativeRequire = createRequire(import.meta.url);
const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
function load(path) {
  const file = /\.(ts|tsx)$/.test(path) ? path : path + (path.includes('/components/') ? '.tsx' : '.ts');
  const mod = { exports: {} };
  const js = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', js)(p => p.endsWith('.module.css') ? { default: {} } : p.startsWith('@/') ? load(resolve(root, p.slice(2))) : p.startsWith('.') ? load(resolve(dirname(file), p)) : nativeRequire(p), mod, mod.exports);
  return mod.exports;
}
const { ScoringRangeNote, ScoringRangeValue } = load(resolve(root, 'components/stats/ScoringRangeValue'));
const { PlayerMatchHistory } = load(resolve(root, 'components/player/PlayerMatchHistory'));
const { buildMvpPlayers } = load(resolve(root, 'lib/records/mvp'));
const render = (component, props) => renderToStaticMarkup(createElement(component, props));
assert.match(render(ScoringRangeValue, { data: {} }), />—<\/span>/);
assert.match(render(ScoringRangeValue, { data: { scores_120_139: 0 } }), />0<\/span>/);
const partial = { scores_120_139: null, scores_120_139_observed: 3,
  scores_120_139_coverage: { status: 'partial', covered_player_legs: 2, total_player_legs: 5 } };
const note = render(ScoringRangeNote, { data: partial });
assert.match(note, /<strong>—<\/strong>/);
assert.match(note, /3 volée\(s\) observée\(s\) sur 2\/5/);
assert.match(render(ScoringRangeNote, { data: { scores_120_139: 2 } }), /Sous-ensemble.*100–139/);
const html = render(PlayerMatchHistory, { matches: [{ match_id: 'm', round: 'J1', mode: 'S',
  win_rate: 100, legs_won: 2, legs_played: 2, average_3_darts: 45, best_finish: 40,
  scores_100_plus: 4, scores_120_139: 2, scores_140_plus: 1 }] });
assert.match(html, /<th>100\+<\/th><th>120–139<\/th><th>140\+<\/th>/);
assert.match(html, /<dt>120–139<\/dt><dd><span[^>]*>2<\/span><\/dd>/, 'Mobile cards contain the same metric');
const player = { player_id: 'p', name: 'P', team: 'T', legs_played: 100, legs_won: 70,
  average_3_darts: 56, first_9: 64, best_finish: 102, scores_100: 20, scores_140: 10, scores_180: 0 };
const metrics = p => { const result = buildMvpPlayers([p])[0]; return [result.score, result.scoringIndex, result.resultsIndex, result.impactIndex, result.finishIndex]; };
for (const count of [null, 0, 10, 20]) assert.deepEqual(metrics({ ...player, scores_120_139: count }), metrics(player));
console.log('PASS scoring UI: unknown versus zero, partial coverage, subset explanation, ascending columns, mobile cards and unchanged MVP formula.');
