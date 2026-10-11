import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url), root = resolve(dirname(new URL(import.meta.url).pathname), "..");
function load(path) {
  const file = path.endsWith(".ts") ? path : path + ".ts";
  const mod = { exports: {} };
  const js = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", js)(p => p.startsWith(".") ? load(resolve(dirname(file), p)) : nativeRequire(p), mod, mod.exports);
  return mod.exports;
}
const { guideSeason, publicGuideDashboard, GUIDE_PLAYERS } = load(resolve(root, "lib/player/kpi-guide.ts"));
const source = { player: { id: GUIDE_PLAYERS[0].id, public_profile: true }, season: { id: "season-id", name: "2025-2026" }, kpis: { first_9: null, legs_played: 0 }, meta: { has_data: false } };
let checks = 0;
function test(label, run) { run(); checks++; console.log("PASS KPI guide: " + label); }

test("requested periods are bounded; an absent or invalid period defaults explicitly to 2026", () => {
  for (const value of [undefined, "", "20266/2027", "<script>", "2030"]) assert.equal(guideSeason(value), "2026");
  for (const value of ["2026", "2027", "2028", "2029", "all"]) assert.equal(guideSeason(value), value);
});
test("private, missing and mismatched identities never enter a public example", () => {
  assert.equal(publicGuideDashboard(null, source.player.id, "2026"), null);
  for (const public_profile of [false, undefined, "true"]) assert.equal(publicGuideDashboard({ ...source, player: { ...source.player, public_profile } }, source.player.id, "2026"), null);
  assert.equal(publicGuideDashboard(source, GUIDE_PLAYERS[1].id, "2026"), null);
});
test("a source from another season or career scope never becomes a 2027 example", () => {
  assert.equal(publicGuideDashboard(source, source.player.id, "2027"), null);
  assert.equal(publicGuideDashboard(source, source.player.id, "all"), null);
  assert.equal(publicGuideDashboard({ ...source, season: null }, source.player.id, "2026"), null);
  const career = { ...source, season: { id: "all", name: "2025-2026" } };
  assert.equal(publicGuideDashboard(career, source.player.id, "2026"), null);
  assert.equal(publicGuideDashboard(career, source.player.id, "all"), career);
  const next = { ...source, season: { id: "new-season", name: "2026/2027" } };
  assert.equal(publicGuideDashboard(next, source.player.id, "2027"), next);
});
test("valid source data keeps missing values and empty coverage without inventing metrics", () => {
  const result = publicGuideDashboard(source, source.player.id, "2026");
  assert.equal(result, source);
  assert.equal(result.kpis.first_9, null);
  assert.equal(result.meta.has_data, false);
});
console.log(`${checks} KPI guide groups passed.`);
