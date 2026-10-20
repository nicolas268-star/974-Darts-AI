import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const cache = new Map();
function load(path) {
  const file = path.endsWith(".ts") ? resolve(root, path) : resolve(root, path + ".ts");
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} }; cache.set(file, mod);
  const js = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", js)(p => p.startsWith(".") ? load(resolve(dirname(file), p)) : p.startsWith("@/") ? load(p.slice(2)) : nativeRequire(p), mod, mod.exports);
  return mod.exports;
}
const { loadCaptainData } = load("lib/captain-nico/data");
let checks = 0;
async function test(label, run) { await run(); checks++; console.log("PASS captain data: " + label); }
const season = { id: "current-season", name: "2026-2027", year: 2027 };
const newcomer = { player_id: "matheo", name: "Matheo PREHU", team: "Papangue Darts Club - Fournaise", season_id: season.id, average_3_darts: null, first_9: null, legs_played: 0, win_rate: 0 };
const nico = { ...newcomer, player_id: "nico", name: "Nicolas DUPONT", team: "Historic team", average_3_darts: 45, first_9: 50, legs_played: 20, win_rate: 50 };
const duo = { duo_id: "nico-matheo", player_1: { id: "nico" }, player_2: { id: "matheo" }, matches_played: 2, legs_played: 5, average_3_darts: 43, first_9: null, win_rate: 40 };
const json = value => new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
function source(overrides = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    const endpoint = new URL(url).pathname.split("/").at(-1);
    calls.push({ url: new URL(url), options });
    const value = Object.hasOwn(overrides, endpoint) ? overrides[endpoint] : {
      competitions: { active_championship: season },
      players: { players: [nico, newcomer] },
      duos: { season, duos: [duo] },
    }[endpoint];
    if (typeof value === "function") return value();
    return json(value);
  };
  return { calls, run: () => loadCaptainData({ baseUrl: "https://captain.invalid/", fetcher }) };
}

await test("fresh active-season reads retain a newcomer without licence or statistics", async () => {
  const api = source(); const result = await api.run();
  assert.equal(result.unavailable, undefined); assert.equal(result.seasonLabel, "Saison 2027");
  assert.deepEqual(result.players.map(p => p.player_id), ["nico", "matheo"]);
  assert.equal(result.players[1].average_3_darts, null); assert.equal(result.players[1].legs_played, 0);
  assert.equal(result.players[0].team, "Papangue Darts Club - Fournaise");
  assert.deepEqual(result.duos, [duo]);
  assert.equal(nico.team, "Historic team", "Do not mutate the API objects");
  assert.equal(api.calls.length, 3);
  for (const call of api.calls) {
    assert.equal(call.options.cache, "no-store"); assert.ok(call.options.signal instanceof AbortSignal);
    if (!call.url.pathname.endsWith("competitions")) assert.equal(call.url.searchParams.get("season_id"), season.id);
  }
});

await test("duo network failures, timeouts, bad HTTP and malformed JSON never hide players", async () => {
  for (const failure of [() => { throw new Error("offline"); }, () => { throw new DOMException("timeout", "TimeoutError"); }, () => new Response("Unavailable", { status: 503 }), () => new Response("{bad-json")]) {
    const result = await source({ duos: failure }).run();
    assert.equal(result.players.length, 2); assert.deepEqual(result.duos, []);
    assert.match(result.notice, /Historique des doubles indisponible/); assert.equal(result.unavailable, undefined);
  }
});

await test("duo season mismatch and malformed entries cannot contaminate this season", async () => {
  for (const payload of [{ season: { id: "old-season" }, duos: [duo] }, { season, duos: [null] }, { season, duos: [{ ...duo, player_2: duo.player_1 }] }, { season, duos: "not-an-array" }]) {
    const result = await source({ duos: payload }).run();
    assert.equal(result.players.length, 2); assert.deepEqual(result.duos, []); assert.ok(result.notice);
  }
});

await test("mixed player seasons, stale responses and invalid identities fail explicitly", async () => {
  for (const players of [[{ ...nico, season_id: "old-season" }], [nico, { ...newcomer, season_id: "old-season" }], [nico, nico], [null], [{ ...newcomer, player_id: "" }]]) {
    const result = await source({ players: { players } }).run();
    assert.equal(result.unavailable, true); assert.deepEqual(result.players, []); assert.deepEqual(result.duos, []);
    assert.ok(result.notice); assert.equal(result.seasonLabel, "Saison 2027");
  }
});

await test("player outage and empty season produce a visible unavailable state", async () => {
  for (const failure of [() => { throw new Error("offline"); }, () => new Response("No", { status: 503 }), () => new Response("{bad-json"), { players: [] }, { players: {} }]) {
    const result = await source({ players: failure }).run();
    assert.equal(result.unavailable, true); assert.deepEqual(result.players, []); assert.ok(result.notice);
  }
});

await test("catalog failures never fall back to unscoped statistics", async () => {
  for (const catalog of [null, { active_championship: null }, { active_championship: { ...season, id: null } }, { active_championship: { ...season, year: "2027" } }, () => { throw new Error("offline"); }]) {
    const api = source({ competitions: catalog }); const result = await api.run();
    assert.equal(result.unavailable, true); assert.equal(api.calls.length, 1); assert.match(result.notice, /saison active/);
  }
});

await test("official 2027 roster is never substituted into another season", async () => {
  const old = { id: "old-season", name: "2026", year: 2026 };
  const result = await source({ competitions: { active_championship: old }, players: { players: [{ ...nico, season_id: old.id }] }, duos: { season: old, duos: [] } }).run();
  assert.equal(result.seasonLabel, "Saison 2026"); assert.equal(result.players[0].team, "Historic team");
  assert.equal(result.notice, undefined);
});

console.log(`${checks} Captain Nico data groups passed.`);
