import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nativeRequire = createRequire(import.meta.url);
const cache = new Map();
function load(file) {
  if (!/\.(ts|tsx)$/.test(file)) file += file.includes("/components/") || file.includes("\\components\\") ? ".tsx" : ".ts";
  if (cache.has(file)) return cache.get(file);
  const mod = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  new Function("require", "module", "exports", code)(name => {
    if (name.endsWith(".css")) return {};
    if (name.endsWith(".json")) return nativeRequire(name.startsWith("@/") ? resolve(root, name.slice(2)) : resolve(dirname(file), name));
    if (name === "@/components/Sidebar" || name === "@/components/BdcCard") return { Sidebar: () => null, BdcCard: () => null };
    if (name === "next/link") return function LinkStub({ children, ...props }) { return createElement("a", props, children); };
    if (name.startsWith("@/")) return load(resolve(root, name.slice(2)));
    if (name.startsWith(".")) return load(resolve(dirname(file), name));
    return nativeRequire(name);
  }, mod, mod.exports);
  cache.set(file, mod.exports);
  return mod.exports;
}
const page = load(resolve(root, "app/tournaments/[code]/page.tsx")).default;
const participant = { name: "Alice", canonical_player_id: "alice", team: "Club", legs_played: 3, legs_won: 2,
  average_3_darts: 50, first_9: null, best_finish: null, scores_180: 0, scores_140: null, scores_100: null,
  no_score: null, matches_played: 1, matches_won: 1, win_rate: 100 };
const match = { id: "m", match_number: 1, home: "Alice", away: "Bob", home_score: 2, away_score: 1,
  winner: "Alice", legs: 3, result_complete: true, unresolved_legs: 0, phase: "KNOCKOUT" };
const stage = (code, kind, name = "Finale", order = 1) => ({ code, bracket_kind: kind, name, order, matches: [{ ...match, id: code }] });
const base = { contract_version: "universal-v1", code: "test", name: "Open de test", event_name: "Open de test",
  date: "2026-10-18", date_label: "18 octobre 2026", location: "Saint-Leu", organizer: "Comité", season: "2026-2027",
  classification: "FRIENDLY", classification_label: "Tournoi amical", affects_committee_ranking: false,
  ranking_status: "NOT_APPLICABLE", status: "AVAILABLE", format: "SINGLE_ELIMINATION", format_label: "Élimination simple",
  source_url: "https://n01darts.com/n01/tournament/comp.php?id=source", summary: { players: 2, matches: 1 },
  players: [participant], duos: [], matches: [match], pools: [], bracket: [stage("primary_1", "PRIMARY")],
  round_robin: [], data_quality_notes: [], final_standings: [{ name: "Alice", rank: 1, placement: "WINNER" }] };
const originalFetch = globalThis.fetch;
async function render(data) {
  globalThis.fetch = async () => ({ ok: true, json: async () => data });
  return renderToStaticMarkup(await page({ params: Promise.resolve({ code: data.code }) }));
}
try {
  let html = await render(base);
  assert.match(html, /TABLEAU PRINCIPAL/); assert.doesNotMatch(html, /WINNER BRACKET|LOSER BRACKET/);
  assert.match(html, /Saint-Leu/); assert.match(html, /2026-2027/); assert.match(html, /Consulter la source Nakka/);
  assert.match(html, /Non disponible/); assert.match(html, /<td>0<\/td>/); assert.doesNotMatch(html, /Points Comité/);
  assert.match(html, /Aucun 180 enregistré/, "Zero 180 is not awarded arbitrarily to the first tied player");
  assert.match(html, /Demi|Vainqueur/);
  html = await render({ ...base, bracket: [stage("primary_1", "PRIMARY"), stage("secondary_1", "SECONDARY")] });
  assert.match(html, /TABLEAU SECONDAIRE/); assert.doesNotMatch(html, /LOSER BRACKET/);
  html = await render({ ...base, bracket: [stage("loser_1", undefined)] });
  assert.match(html, /TABLEAU SECONDAIRE/); assert.doesNotMatch(html, /LOSER BRACKET/);
  html = await render({ ...base, format: "POOLS_AND_DOUBLE_ELIMINATION", has_double_elimination: true,
    bracket: [stage("winner_1", "WINNER"), stage("loser_1", "LOSER"), stage("grand_final_1", "GRAND_FINAL", "Grande finale"), stage("grand_final_2", "GRAND_FINAL", "Reset de finale", 2)] });
  assert.match(html, /WINNER BRACKET/); assert.match(html, /LOSER BRACKET/); assert.match(html, /Reset de finale/);
  const group = { code: "A", name: "Poule A", format_label: "Round Robin", participant_count: 2,
    match_count: 0, expected_match_count: 1, complete: false, win_points: 3, draw_points: 1, loss_points: 0,
    matrix: [{ number: 1, name: "Alice", average_3_darts: null, rank: null, cells: [null, { opponent: "Bob", played: false }] }],
    standings: [{ name: "Alice", rank: null, played: 0, wins: 0, draws: 0, losses: 0, legs_for: 0, legs_against: 0, leg_difference: 0, points: null }] };
  html = await render({ ...base, format: "POOLS", bracket: [], pools: [stage("pool_A", "PRIMARY")], round_robin: [group] });
  assert.match(html, /Poule A/); assert.doesNotMatch(html, /WINNER BRACKET|LOSER BRACKET|Le chemin vers la finale/);
  assert.match(html, /rank-0">Non disponible/); assert.match(html, /3 pts \/ victoire/);
  html = await render({ ...base, classification: "COMMITTEE_OFFICIAL", classification_label: "Open Comité officiel",
    affects_committee_ranking: true, ranking_status: "PUBLISHED", official_publication: { event_id: "oc1", version_id: "v1" },
    official_results: [{ name: "Alice", rank: 1, points: 237, placement: "WINNER", canonical_player_id: "alice" }] });
  assert.match(html, /Points Comité/); assert.match(html, /<td>237<\/td>/); assert.match(html, /href="\/players\/alice"/);
  assert.match(html, /Classement du Comité/);
  html = await render({ ...base, players: [], duos: [{ ...participant, name: "Alice / Bob", players: ["Alice", "Bob"] }] });
  assert.match(html, /Alice \/ Bob/); assert.match(html, /Aucune statistique joueur/); assert.doesNotMatch(html, /Meilleure moyenne/);
  html = await render({ ...base, matches: [{ ...match, winner: null, result_complete: false, unresolved_legs: 1 }] });
  assert.match(html, /Non confirmé/); assert.doesNotMatch(html, /<td>Égalité/);
  const catalog = { championships: [], tournaments: [{ ...base, href: "/tournaments/test", classification: "FRIENDLY" }],
    official_tournaments: [{ ...base, code: "oc1", name: "Open Comité 1", href: "/tournaments/oc1", classification: "COMMITTEE_OFFICIAL", classification_label: "Officiel" }] };
  globalThis.fetch = async () => ({ ok: true, json: async () => catalog });
  const competitions = load(resolve(root, "app/competitions/page.tsx")).default;
  html = renderToStaticMarkup(await competitions());
  assert.match(html, /href="\/tournaments\/oc1"/); assert.equal((html.match(/<h3>Open Comité 1<\/h3>/g) ?? []).length, 1);
  const { getTournamentRecords } = load(resolve(root, "lib/tournament-records.ts"));
  globalThis.fetch = async url => String(url).endsWith("/competitions/tournaments")
    ? Response.json({ tournaments: [{ code: "OC1", status: "AVAILABLE" }], official_tournaments: [{ code: "oc1", status: "AVAILABLE" }] })
    : Response.json({ ...base, code: "oc1", players: [{ ...participant, scores_180: null }] });
  const records = (await getTournamentRecords("2027")).filter(item => item.code === "oc1");
  assert.equal(records.length, 1, "Official and friendly aliases of the same event cannot double count records");
  assert.equal(records[0].canonical_player_id, "alice"); assert.equal(records[0].scores_180, null, "Unavailable metrics stay unknown in records");
  globalThis.fetch = async url => String(url).endsWith("/competitions/tournaments")
    ? Response.json({ tournaments: [{ code: "safe", status: "AVAILABLE" }] })
    : Response.json({ ...base, code: "safe", players: [
      { ...participant, identity_status: "EXACT" },
      { ...participant, identity_status: "AMBIGUOUS", canonical_player_id: null },
      { ...participant, identity_status: "UNMATCHED", canonical_player_id: null },
      { ...participant, identity_status: "EXACT", canonical_player_id: null },
    ] });
  assert.equal((await getTournamentRecords("2027")).filter(item => item.code === "safe").length, 1,
    "New tournament records require an exact canonical identity; similar names cannot claim ambiguous performances");
  console.log("PASS tournament rendering: official points, friendly, pools, simple elimination, secondary, double elimination, reset, collective doubles, unavailable metrics, incomplete results and catalog.");
} finally { globalThis.fetch = originalFetch; }
