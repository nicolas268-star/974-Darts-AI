import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url), root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const cache = new Map();
function load(path) {
  const file = path.endsWith(".ts") ? resolve(root, path) : resolve(root, path + ".ts");
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} }; cache.set(file, mod);
  const js = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", js)(p => p.startsWith(".") ? load(resolve(dirname(file), p)) : p.startsWith("@/") ? load(p.slice(2)) : nativeRequire(p), mod, mod.exports);
  return mod.exports;
}
const { officialPlayerRoster2027 } = load("lib/team-roster");
const { playerSeasonAffiliations } = load("lib/player/season-affiliations");
const { seasonLabel } = load("lib/season-label");
const { canonicalTeamName, sameTeam, displayTeamNames } = load("lib/team-identity");
let checks = 0;
function test(label, run) { run(); checks++; console.log("PASS affiliations: " + label); }
const historical = (name, team, club = null) => ({ player: { id: "canonical", name, team, club }, season: { id: "old", name: "2026" }, meta: { has_data: true } });

test("Pierre keeps his 2026 team and gets Neige from the 2027 roster even without a recorded transfer", () => {
  const old = historical("Pierre BERLET", "PDC Fournaise");
  const view = playerSeasonAffiliations(old.player, old);
  assert.deepEqual(view.previous, { team: "PDC Fournaise", club: "Papangue Darts Club" });
  assert.deepEqual(view.current, { team: "Papangue Darts Club - Neige", club: "Papangue Darts Club" });
  assert.equal(old.player.team, "PDC Fournaise");
});
test("same team in both seasons stays visible; current roster supports clubs with split teams", () => {
  const nico = historical("Nicolas DUPONT", "PDC Fournaise");
  assert.equal(playerSeasonAffiliations(nico.player, nico).current.team, "Papangue Darts Club - Fournaise");
  assert.equal(officialPlayerRoster2027("Guillaume HOARAU").id, "tdc-zarboutan");
  assert.equal(officialPlayerRoster2027("David DESCHRYVER").id, "3bdc-blonde");
  assert.equal(officialPlayerRoster2027("David DESCHRYVER").name, "3B Darts Club - B(rune)");
  const david = historical("David DESCHRYVER", "3BDC");
  assert.equal(playerSeasonAffiliations(david.player, david).current.team, "3B Darts Club - B(rune)");
  assert.equal(canonicalTeamName("3B Darts Club - B(londe)"), "3B Darts Club - B(rune)");
  assert.equal(sameTeam("3B Darts Club - B(londe)", "3B Darts Club - B(rune)"), true);
  assert.equal(displayTeamNames("J2 · 3B Darts Club - B(londe) vs Kaz A Darts - A"), "J2 · 3B Darts Club - B(rune) vs Kaz A Darts - A");
  assert.equal(officialPlayerRoster2027("Yoann MARQUES").id, "kaz-a");
});
test("only exact full names and published aliases match; accents work and ambiguous aliases stay unset", () => {
  assert.equal(officialPlayerRoster2027("  kevin BARRET ").id, "tdc-zarlor");
  assert.equal(officialPlayerRoster2027("Fran").id, "tdc-zarlor");
  assert.equal(officialPlayerRoster2027("Pierre B"), undefined);
  assert.equal(officialPlayerRoster2027(""), undefined);
  const rosters = [{ id: "a", players: [{ officialName: "Jean A", nakkaName: "Jean" }] }, { id: "b", players: [{ officialName: "Jean B", nakkaName: "Jean" }] }];
  assert.equal(officialPlayerRoster2027("Jean", rosters), undefined);
  assert.equal(officialPlayerRoster2027("Jean A", rosters).id, "a");
});
test("missing 2026 data, wrong season or another player never reuse a current team as history", () => {
  const old = historical("Pierre BERLET", "PDC Fournaise");
  for (const source of [null, { ...old, meta: { has_data: false } }, { ...old, season: { id: "new", name: "2026-2027" } }, { ...old, player: { ...old.player, id: "another" } }]) {
    const view = playerSeasonAffiliations(old.player, source);
    assert.equal(view.previous, null); assert.equal(view.current.team, "Papangue Darts Club - Neige");
  }
  const unlisted = historical("Sebastien", "Kazadarts A", "Club source");
  assert.equal(playerSeasonAffiliations(unlisted.player, unlisted).current, null);
  assert.equal(playerSeasonAffiliations(unlisted.player, unlisted).previous.club, "Club source");
});
test("six historical teams get their official club when legacy club_id is missing; unknown clubs are not invented", () => {
  for (const [team, club] of [["PDC Fournaises", "Papangue Darts Club"], ["PDC Neige", "Papangue Darts Club"], ["Kazadarts A", "Kazadarts"], ["Kazadarts B", "Kazadarts"], ["3BDC", "3 Brasseurs Darts Club"], ["TDC", "Tampon Darts Club"]]) {
    const source = historical("Pierre BERLET", team); assert.equal(playerSeasonAffiliations(source.player, source).previous.club, club);
  }
  const source = historical("Pierre BERLET", "toString"); assert.equal(playerSeasonAffiliations(source.player, source).previous.club, null);
});
test("season labels use the ending year for championship ranges without changing statistics or career scope", () => {
  for (const name of ["2026-2027", "2026/2027", "2026–2027", "Championnat 2027"]) assert.equal(seasonLabel({ id: "new", name }), "Saison 2027");
  assert.equal(seasonLabel({ id: "old", name: "2026" }), "Saison 2026");
  assert.equal(seasonLabel({ id: "all", name: "2026-2027" }), "Toute la carrière");
  assert.equal(seasonLabel(null), "Période non renseignée");
});
console.log(`${checks} affiliation groups passed.`);
