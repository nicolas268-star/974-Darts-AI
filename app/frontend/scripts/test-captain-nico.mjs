import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nativeRequire = createRequire(import.meta.url);
function load(file) {
  const mod = { exports: {} };
  const js = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", js)(nativeRequire, mod, mod.exports);
  return mod.exports;
}
const { forecast, simulate, playerRating, pairings, makeLineup } = load(resolve(root, "lib/captain-nico/model.ts"));
const { emptyDraft, restoreDraft } = load(resolve(root, "lib/captain-nico/draft.ts"));
const player = (id, average = 50, extra = {}) => ({ player_id: id, name: id, team: "Équipe", average_3_darts: average, first_9: average, legs_played: 40, legs_won: 20, win_rate: 50, best_finish: 80, elo: null, scores_180: 0, scores_170: 0, scores_140: 0, scores_100: 0, finishes: 20, nakka_note: "", ...extra });
const home = ["a", "b", "c", "d"], away = ["e", "f", "g", "h"];
const players = [...home, ...away].map(id => player(id));
const input = (extra = {}) => ({ players, duos: [], assumptions: {}, ...extra });
const scenario = (left = home, right = away, leftPair = 0, rightPair = 0) => ({ home: makeLineup(left, leftPair), away: makeLineup(right, rightPair) });
const near = (left, right, tolerance = 1e-10) => assert.ok(Math.abs(left - right) <= tolerance, `${left} != ${right}`);
let checks = 0;
function test(name, run) { run(); checks++; console.log("PASS Captain Nico: " + name); }

test("the 20 parties and two-winning-leg assumption match the actual saved interclub schedule", () => {
  const saved = JSON.parse(readFileSync(resolve(root, "../backend/tests/fixtures/interclub_j2_fournaise_ambree.json"), "utf8"));
  const result = forecast(scenario(), input());
  const positions = { A: ["a"], B: ["b"], C: ["c"], D: ["d"], E: ["e"], F: ["f"], G: ["g"], H: ["h"], A1: ["a", "b"], A2: ["c", "d"], E1: ["e", "f"], E2: ["g", "h"] };
  assert.equal(result.matches.length, 20);
  saved.data.lg_setting.schedule.forEach((match, index) => {
    const [, left, first, right] = /([A-H][12]?)(\*?)-([A-H][12]?)/.exec(match.subTitle);
    const actual = result.matches[index];
    assert.deepEqual([actual.number, actual.home, actual.away, actual.homeStarts], [index + 1, positions[left], positions[right], Boolean(first)]);
    assert.equal(match.limit_leg_count, 2);
  });
  assert.equal(result.matches.filter(match => match.kind === "single").length, 16);
  assert.equal(result.matches.filter(match => match.kind === "double").length, 4);
  for (const id of [...home, ...away]) assert.equal(result.matches.filter(match => match.kind === "single" && [...match.home, ...match.away].includes(id)).length, 4);
});

test("equal observed teams give 10/20 and a normalized exact score distribution", () => {
  const result = forecast(scenario(), input());
  near(result.expectedHome, 10); near(result.expectedSingles, 8); near(result.expectedDoubles, 2);
  assert.ok(result.matches.every(match => match.probability === .5));
  assert.equal(result.scoreDistribution.length, 21);
  near(result.scoreDistribution.reduce((sum, value) => sum + value, 0), 1);
  near(result.homeWin + result.draw + result.awayWin, 1);
  near(result.homeWin, result.awayWin);
  near(result.scoreDistribution[0], 2 ** -20); near(result.scoreDistribution[20], 2 ** -20);
  assert.deepEqual(result.mostLikelyScore, [10, 10]);
  assert.deepEqual(result.missingPlayerIds, []); assert.deepEqual(result.assumedPlayerIds, []);
});

test("swapping the two teams mirrors all outcome probabilities and expected scores", () => {
  const data = input({ players: players.map((p, index) => ({ ...p, average_3_darts: 30 + index * 5, first_9: 35 + index * 4 })) });
  const left = forecast(scenario(), data), right = forecast(scenario(away, home), data);
  near(left.expectedHome + right.expectedHome, 20);
  near(left.homeWin, right.awayWin); near(left.awayWin, right.homeWin); near(left.draw, right.draw);
  left.scoreDistribution.forEach((mass, wins) => near(mass, right.scoreDistribution[20 - wins]));
});

test("a permutation of the same singles cannot manufacture an expected singles gain", () => {
  const data = input({ players: players.map((p, index) => ({ ...p, average_3_darts: 25 + index * 7, first_9: 40 + index * 3 })) });
  const baseline = forecast(scenario(), data);
  for (const order of [["d", "a", "c", "b"], ["c", "b", "a", "d"], ["b", "d", "c", "a"]]) {
    near(baseline.expectedSingles, forecast(scenario(order), data).expectedSingles);
  }
  const equal = simulate(home, away, 0, 0, input());
  assert.equal(equal.evaluated, 3); assert.deepEqual(equal.candidates[0].scenario.home.starters, home);
});

test("missing Matheo data stays unknown and complete forecast totals remain unavailable", () => {
  const unknown = player("matheo", null, { legs_played: 0, first_9: null });
  const data = input({ players: [...players, unknown] });
  assert.equal(playerRating(unknown, {}), null);
  const result = forecast(scenario(["matheo", "b", "c", "d"]), data);
  assert.equal(result.expectedHome, null); assert.equal(result.expectedSingles, null); assert.equal(result.expectedDoubles, null);
  assert.equal(result.scoreDistribution, null); assert.equal(result.homeWin, null); assert.equal(result.draw, null); assert.equal(result.awayWin, null); assert.equal(result.mostLikelyScore, null);
  assert.deepEqual(result.missingPlayerIds, ["matheo"]);
  assert.equal(result.matches.filter(match => match.probability === null).length, 6);
  assert.ok(result.matches.filter(match => match.probability !== null).every(match => match.probability === .5));
});

test("manual assumptions are explicit, limited to missing observations and cannot change stored data", () => {
  const unknown = player("matheo", null, { legs_played: 0, first_9: null });
  const before = JSON.stringify(unknown);
  const data = input({ players: [...players, unknown], assumptions: { matheo: 50, a: 150 } });
  assert.equal(playerRating(players[0], data.assumptions), 50);
  const result = forecast(scenario(["matheo", "b", "c", "d"]), data);
  near(result.expectedHome, 10); assert.deepEqual(result.assumedPlayerIds, ["matheo"]); assert.deepEqual(result.missingPlayerIds, []);
  assert.ok(result.matches.filter(match => match.home.includes("matheo")).every(match => /hypothèse/i.test(match.basis)));
  assert.equal(JSON.stringify(unknown), before);
  for (const value of [0, -1, 181, NaN, Infinity, "50", null]) assert.equal(playerRating(unknown, { matheo: value }), null);
});

test("invalid observed averages never turn into zero strength or an artificial prediction", () => {
  for (const value of [null, 0, -5, 181, NaN, Infinity, "50"]) assert.equal(playerRating(player("invalid", value), {}), null);
  for (const legs of [null, 0, -1, NaN, Infinity, 1.5]) assert.equal(playerRating(player("invalid", 50, { legs_played: legs }), {}), null);
  near(playerRating(player("sample", 50, { first_9: 70 }), {}), 54);
  near(playerRating(player("sample", 50, { first_9: null }), {}), 50);
  near(playerRating(player("sample", 50, { first_9: 0 }), {}), 40);
  // More volume is evidence, not a talent bonus.
  near(playerRating(player("sample", 50, { legs_played: 2 }), {}), playerRating(player("sample", 50, { legs_played: 200 }), {}));
});

test("three pair partitions cover every possible double once without duplicates", () => {
  const options = pairings(home);
  assert.equal(options.length, 3);
  const all = new Set(options.flat().map(pair => [...pair].sort().join("/")));
  assert.equal(all.size, 6);
  options.forEach(option => assert.deepEqual([...option.flat()].sort(), [...home].sort()));
  assert.deepEqual(makeLineup([...home, "reserve"], 2), { starters: home, reserves: ["reserve"], pairs: [["a", "d"], ["b", "c"]] });
});

test("simulation ranks 4–6 selected players fairly and keeps stable order for tied candidates", () => {
  const data = input({ players: [...players, player("reserve", 80), player("reserve2", 65)] });
  const result = simulate([...home, "reserve", "reserve2"], away, 0, 1, data);
  assert.equal(result.evaluated, 45); assert.equal(result.candidates.length, 3);
  assert.ok(result.candidates.every(candidate => candidate.scenario.home.starters.includes("reserve")));
  assert.ok(result.candidates[0].forecast.expectedHome > result.baseline.expectedHome);
  assert.deepEqual(result.candidates[0].scenario.away, makeLineup(away, 1));
  const tied = simulate(home, away, 1, 0, input());
  assert.deepEqual(tied.candidates.map(candidate => candidate.scenario.home.pairs), pairings(home));
});

test("an unrated reserve cannot be silently dropped to claim an optimal composition", () => {
  const unknown = player("matheo", null, { legs_played: 0 });
  const data = input({ players: [...players, unknown] });
  const result = simulate([...home, "matheo"], away, 0, 0, data);
  assert.equal(result.evaluated, 0); assert.deepEqual(result.candidates, []); assert.deepEqual(result.missingPlayerIds, ["matheo"]);
  near(result.baseline.expectedHome, 10);
  assert.equal(simulate([...home, "matheo"], away, 0, 0, { ...data, assumptions: { matheo: 50 } }).evaluated, 15);
  // An away reserve is not used to optimize the fixed away starters.
  assert.equal(simulate(home, [...away, "matheo"], 0, 0, data).evaluated, 3);
});

test("observed duo data is blended with volume, not mistaken for finishing precision", () => {
  const duo = { duo_id: "ab", player_1: { id: "b" }, player_2: { id: "a" }, average_3_darts: 70, first_9: null, legs_played: 20 };
  const result = forecast(scenario(), input({ duos: [duo] }));
  near(result.expectedSingles, 8);
  assert.ok(result.expectedDoubles > 2); assert.ok(result.matches[8].probability > .5);
  assert.match(result.matches[8].basis, /20 legs/);
  assert.match(forecast(scenario(), input()).matches[8].basis, /Approximation/);
  assert.deepEqual(forecast(scenario(), input({ duos: [{ ...duo, legs_played: 0 }] })).scoreDistribution, forecast(scenario(), input()).scoreDistribution);
});

test("extreme allowed assumptions remain finite and the score distribution spans 0:20", () => {
  const extreme = players.map(p => ({ ...p, legs_played: 0, average_3_darts: null, first_9: null }));
  const assumptions = Object.fromEntries(extreme.map((p, index) => [p.player_id, index < 4 ? 180 : 1]));
  const result = forecast(scenario(), input({ players: extreme, assumptions }));
  assert.ok(result.matches.every(match => Number.isFinite(match.probability) && match.probability >= 0 && match.probability <= 1));
  near(result.scoreDistribution.reduce((sum, mass) => sum + mass, 0), 1);
  assert.deepEqual(result.mostLikelyScore, [20, 0]);
});

test("stale identities, duplicate sides and invalid pair assignments are rejected", () => {
  assert.throws(() => forecast(scenario(["stale", "b", "c", "d"]), input()), /plus disponible/);
  assert.throws(() => forecast(scenario(home, ["a", "f", "g", "h"]), input()), /deux équipes/);
  assert.throws(() => simulate(["a", "a", "c", "d"], away, 0, 0, input()), /différents/);
  assert.throws(() => simulate(home.slice(0, 3), away, 0, 0, input()), /4 à 6/);
  assert.throws(() => makeLineup([...home, "x", "y", "z"]), /4 à 6/);
  assert.throws(() => makeLineup(home, 3), /invalide/);
  const bad = scenario(); bad.home.pairs = [["a", "b"], ["a", "d"]];
  assert.throws(() => forecast(bad, input()), /seule paire/);
  assert.throws(() => forecast(scenario(), input({ players: [...players, players[0]] })), /catalogue/);
});

const draftSeason = "2026–2027";
const draftIds = new Set([...home, ...away, "reserve", "reserve2", "matheo"]);
const storedDraft = extra => ({ version: 2, season: draftSeason, title: "Fournaise avant match", home, away, homePairing: 1, awayPairing: 2, assumptions: {}, ...extra });
const restore = (value, legacy = null, season = draftSeason) => restoreDraft(typeof value === "string" || value === null ? value : JSON.stringify(value), legacy === null ? null : JSON.stringify(legacy), draftIds, season);

test("malformed or unsupported saved drafts restore an empty current-season selection", () => {
  for (const value of [null, "{malformed", "null", "[]", "23", "\"text\"", storedDraft({ version: 1 }), storedDraft({ version: 3 }), storedDraft({ season: "2025–2026" })]) {
    assert.deepEqual(restore(value), emptyDraft(draftSeason));
  }
  assert.deepEqual(restoreDraft(null, "{bad legacy", draftIds, draftSeason), emptyDraft(draftSeason));
  assert.deepEqual(restore(null, { title: "No slot object" }), emptyDraft(draftSeason));
});

test("restoration removes deleted or malformed player identities without shifting their positions", () => {
  const result = restore(storedDraft({ home: ["a", "deleted-player", "c", "d", "reserve", 123], away: ["e", "f", null, "h", "reserve2", "ignored", "matheo"] }));
  assert.deepEqual(result.home, ["a", "", "c", "d", "reserve", ""]);
  assert.deepEqual(result.away, ["e", "f", "", "h", "reserve2", ""]);
  assert.equal(result.home.length, 6); assert.equal(result.away.length, 6);
  const badArrays = restore(storedDraft({ home: "a,b,c,d", away: { 0: "e" } }));
  assert.deepEqual(badArrays.home, Array(6).fill("")); assert.deepEqual(badArrays.away, Array(6).fill(""));
});

test("duplicate positions and cross-side duplicates are removed deterministically from saved drafts", () => {
  const result = restore(storedDraft({ home: ["a", "b", "a", "d", "reserve", "reserve"], away: ["e", "b", "g", "h", "reserve", "reserve2"] }));
  assert.deepEqual(result.home, ["a", "b", "", "d", "reserve", ""]);
  assert.deepEqual(result.away, ["e", "", "g", "h", "", "reserve2"]);
  const chosen = [...result.home, ...result.away].filter(Boolean);
  assert.equal(new Set(chosen).size, chosen.length);
});

test("only finite allowed manual averages and valid double partition indices survive restoration", () => {
  const result = restore(storedDraft({ assumptions: { a: 1, matheo: 180, reserve: 42.5, b: 0, c: -1, d: 181, e: "50", f: null, deleted: 50 }, homePairing: -1, awayPairing: 3 }));
  assert.deepEqual(result.assumptions, { a: 1, matheo: 180, reserve: 42.5 });
  assert.equal(result.homePairing, 0); assert.equal(result.awayPairing, 0);
  for (const value of [null, "1", .5, -1, 3, {}, []]) {
    const bad = restore(storedDraft({ homePairing: value, awayPairing: value }));
    assert.equal(bad.homePairing, 0); assert.equal(bad.awayPairing, 0);
  }
  const valid = restore(storedDraft({ homePairing: 1, awayPairing: 2 }));
  assert.equal(valid.homePairing, 1); assert.equal(valid.awayPairing, 2);
});

test("legacy Captain Nico v1 slots migrate to the named starters and optional reserves", () => {
  const result = restore(null, { title: "Ancienne préparation", slots: { A: "a", B: "b", C: "c", D: "d", Y: "reserve", E: "e", F: "f", G: "g", H: "h", Z: "reserve2", A1P1: "a", A1P2: "b", A2P1: "c", A2P2: "d" }, results: { 1: "W" } });
  assert.equal(result.version, 2); assert.equal(result.season, draftSeason); assert.equal(result.title, "Ancienne préparation");
  assert.deepEqual(result.home, [...home, "reserve", ""]); assert.deepEqual(result.away, [...away, "reserve2", ""]);
  assert.equal(Object.hasOwn(result, "results"), false);
  // A valid v2 draft takes precedence over the legacy preparation.
  assert.equal(restore(storedDraft({ title: "Préparation actuelle" }), { title: "Ancien", slots: { A: "a" } }).title, "Préparation actuelle");
});

test("legacy custom doubles migrate when they still partition the four selected starters", () => {
  for (const [index, pairs] of pairings(home).entries()) {
    const migrated = restore(null, { slots: { A: "a", B: "b", C: "c", D: "d", E: "e", F: "f", G: "g", H: "h", A1P1: pairs[0][1], A1P2: pairs[0][0], A2P1: pairs[1][1], A2P2: pairs[1][0] } });
    assert.equal(migrated.homePairing, index);
  }
  const invalid = restore(null, { slots: { A: "a", B: "b", C: "c", D: "d", A1P1: "a", A1P2: "reserve", A2P1: "c", A2P2: "d" } });
  assert.equal(invalid.homePairing, 0);
});

test("saved predictions and results never restore as analyses and titles stay bounded", () => {
  const result = restore(storedDraft({ title: "x".repeat(300), simulation: { evaluated: 45 }, prediction: { homeWin: 1 }, forecast: { expectedHome: 20 }, results: { 1: "W" } }));
  assert.equal(result.title.length, 140);
  assert.deepEqual(Object.keys(result).sort(), ["version", "season", "title", "home", "away", "homePairing", "awayPairing", "assumptions"].sort());
  for (const key of ["simulation", "prediction", "forecast", "results"]) assert.equal(Object.hasOwn(result, key), false);
  assert.equal(restore(storedDraft({ title: { malicious: true } })).title, emptyDraft(draftSeason).title);
  const first = emptyDraft(draftSeason), second = emptyDraft(draftSeason);
  first.home[0] = "a"; first.assumptions.matheo = 50;
  assert.equal(second.home[0], ""); assert.deepEqual(second.assumptions, {});
});

console.log(`${checks} Captain Nico model groups passed.`);
