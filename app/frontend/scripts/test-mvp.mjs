import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url), root = resolve(dirname(new URL(import.meta.url).pathname), "..");
function load(path) {
  const file = path.endsWith(".ts") ? path : path + ".ts", mod = { exports: {} };
  const js = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", js)(p => p.startsWith("@/") ? load(resolve(root, p.slice(2))) : p.startsWith(".") ? load(resolve(dirname(file), p)) : nativeRequire(p), mod, mod.exports);
  return mod.exports;
}
const { buildMvpPlayers, mvpStanding, playersForMvpSeason } = load(resolve(root, "lib/records/mvp.ts"));
const { loadMvpSeason } = load(resolve(root, "lib/records/mvp-server.ts"));
const player = overrides => ({ player_id: "one", name: "Joueur", team: "Équipe", season_id: "season-2027", legs_played: 100, legs_won: 70, average_3_darts: 56, first_9: 64, best_finish: 102, scores_100: 20, scores_140: 10, scores_180: 0, ...overrides });
let checks = 0;
async function test(label, run) { await run(); checks++; console.log("PASS MVP: " + label); }

await test("confirmed scoring keeps the existing weights, Wilson adjustment and missing-value fallbacks", () => {
  const result = buildMvpPlayers([player({})])[0];
  assert.deepEqual([result.score, result.scoringIndex, result.resultsIndex, result.impactIndex, result.finishIndex], [75, 83, 60, 100, 60]);
  assert.equal(buildMvpPlayers([player({ first_9: null })])[0].score, 75);
  assert.equal(buildMvpPlayers([player({ best_finish: null })])[0].finishIndex, 0);
});
await test("early-season results below 20 legs produce an explicitly provisional ranking", () => {
  const players = [player({ player_id: "a", name: "Esteban", legs_played: 13, legs_won: 11, average_3_darts: 53.87, first_9: 64.06, best_finish: 61, scores_100: 8, scores_140: 2 }), player({ player_id: "b", name: "Jacky", legs_played: 14, legs_won: 12, average_3_darts: 44.55, first_9: 50.35, best_finish: 59, scores_100: 8, scores_140: 0 })];
  const standing = mvpStanding(players);
  assert.equal(standing.provisional, true); assert.equal(standing.confirmed.length, 0);
  assert.equal(standing.displayed.length, 2); assert.equal(standing.developing.length, 2);
  assert.equal(standing.displayed[0].name, "Esteban");
});
await test("the first qualifying player activates the principal ranking with the exact 20-leg threshold", () => {
  const standing = mvpStanding([player({ player_id: "early", legs_played: 19, legs_won: 19, average_3_darts: 90 }), player({ player_id: "qualified", legs_played: 20, legs_won: 10 })]);
  assert.equal(standing.provisional, false); assert.equal(standing.displayed.length, 1);
  assert.equal(standing.displayed[0].player_id, "qualified"); assert.equal(standing.developing.length, 1);
});
await test("zero legs, missing or invalid averages and impossible results never become a leader", () => {
  for (const values of [{ legs_played: 0, legs_won: 0 }, { average_3_darts: null }, { average_3_darts: NaN }, { legs_won: 101 }, { legs_won: -1 }, { scores_100: -1 }, { first_9: Infinity }]) assert.equal(mvpStanding([player(values)]).displayed.length, 0);
  const zero = buildMvpPlayers([player({ legs_played: 20, legs_won: 0, average_3_darts: 0, first_9: null, best_finish: 0, scores_100: 0, scores_140: 0 })])[0];
  assert.equal(zero.score, 3);
});
await test("tie ordering is stable and an empty season is not provisional", () => {
  assert.equal(buildMvpPlayers([player({ name: "Zoe" }), player({ name: "Alex", player_id: "two" })])[0].name, "Alex");
  assert.equal(mvpStanding([]).provisional, false);
});
await test("mixed, unscoped and malformed season payloads are rejected instead of reusing another year", () => {
  assert.equal(playersForMvpSeason({ players: [player({})] }, "season-2027").length, 1);
  assert.equal(playersForMvpSeason({ players: [] }, "season-2027").length, 0);
  for (const payload of [{}, { players: null }, { players: [null] }, { players: [player({ season_id: null })] }, { players: [player({}), player({ season_id: "season-2026" })] }]) assert.equal(playersForMvpSeason(payload, "season-2027"), null);
});

const catalog = { championships: [{ year: 2026, id: "season-2026", published_rounds: 9 }, { year: 2027, id: "season-2027", is_active: true, published_rounds: 1 }, { year: 2028, id: null, published_rounds: 0 }] };
const originalFetch = globalThis.fetch;
try {
  for (const year of ["2026", "2027"]) await test(`season ${year} fetches its catalog UUID even while 2027 is active`, async () => {
    const calls = [];
    globalThis.fetch = async (input, options) => {
      const url = new URL(input); calls.push(url); assert.equal(options.cache, "no-store");
      return Response.json(url.pathname.endsWith("competitions") ? catalog : { players: [player({ name: "Pierre BERLET", team: "PDC Fournaise", season_id: `season-${year}` })] });
    };
    const result = await loadMvpSeason(year);
    assert.equal(result.status, "ready"); assert.equal(result.players.length, 1);
    assert.equal(result.players[0].team, year === "2027" ? "Papangue Darts Club - Neige" : "PDC Fournaise");
    assert.equal(calls[1].searchParams.get("season_id"), `season-${year}`); assert.equal(calls.length, 2);
  });
  await test("a planned season makes no player request and never substitutes the active season", async () => {
    let calls = 0; globalThis.fetch = async () => { calls++; return Response.json(catalog); };
    assert.equal((await loadMvpSeason("2028")).status, "awaiting"); assert.equal(calls, 1);
  });
  await test("a successful empty response distinguishes missing individual stats from an outage", async () => {
    globalThis.fetch = async input => Response.json(String(input).endsWith("competitions") ? catalog : { players: [] });
    const result = await loadMvpSeason("2027"); assert.equal(result.status, "ready"); assert.equal(result.publishedRounds, 1); assert.deepEqual(result.players, []);
  });
  await test("HTTP failures, a network error and wrong-season data produce an unavailable state", async () => {
    for (const failure of ["catalog", "players", "network", "scope"]) {
      globalThis.fetch = async input => {
        if (failure === "network") throw Error("offline");
        const isCatalog = String(input).endsWith("competitions");
        if (failure === (isCatalog ? "catalog" : "players")) return Response.json({}, { status: 503 });
        return Response.json(isCatalog ? catalog : { players: [player({ season_id: "season-2026" })] });
      };
      const result = await loadMvpSeason("2027"); assert.equal(result.status, "unavailable"); assert.deepEqual(result.players, []);
    }
  });
} finally { globalThis.fetch = originalFetch; }
console.log(`${checks} MVP groups passed.`);
