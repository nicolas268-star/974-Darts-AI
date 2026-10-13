import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import { fixture } from "./match-day-fixture.mjs";
const require = createRequire(import.meta.url), root = resolve(dirname(new URL(import.meta.url).pathname), "..");
let authResult = { ok: false, response: Response.json({ error: "Accès refusé" }, { status: 403 }) };
const cache = new Map();
function load(path) {
  const file = path.endsWith(".ts") ? resolve(root, path) : resolve(root, path + ".ts");
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} }; cache.set(file, mod);
  const js = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", js)(p => p === "@/lib/auth/session" ? { authorizeAdminApi: async () => authResult } : p.startsWith(".") ? load(resolve(dirname(file), p)) : p.startsWith("@/") ? load(p.slice(2)) : require(p), mod, mod.exports);
  return mod.exports;
}
const m = load("lib/match-day/model"), t = load("lib/player-card/themes"), metrics = load("lib/player-card/metrics"), source = fixture();
let count = 0;
function test(label, fn) { fn(); count++; console.log("PASS Match Day: " + label); }
test("manual and stable calendar occurrence, no confirmed presence inferred", () => {
  const s = m.createSnapshot(source, ...source.teams); assert.equal(s.event, null); assert.equal(s.teamA.composition_confirmed, false); assert.equal(s.teamA.players.length, 5);
  const a = m.createSnapshot(source, ...source.teams, source.events[0]), b = m.createSnapshot(source, ...source.teams, source.events[1]); assert.notEqual(a.event.id, b.event.id);
});
test("eight genuine shared theme variants, independent selection and explicit bindings", () => {
  assert.equal(t.MATCH_THEME_IDS.length, 8); assert.equal(new Set(t.MATCH_THEME_IDS.map(id => JSON.stringify([t.THEMES[id].accent, t.THEMES[id].background, t.THEMES[id].pattern]))).size, 8);
  const s = m.createSnapshot(source, ...source.teams); s.teamA.theme = "brune"; assert.equal(s.teamB.theme, "neige"); assert.equal(s.teamA.id, source.teams[0].id);
  assert.equal(t.matchThemeForTeam("PDC Fournaise"), null); assert.equal(t.matchThemeForTeam("9b85ca85-4c9a-4bb7-8d73-c92e19ae7de3"), "brune");
  assert.deepEqual(m.resetThemes(s).teamA.theme, "fournaise");
});
test("swap moves photo, order and themes together, preserves calendar home/away", () => {
  const s = m.createSnapshot(source, ...source.teams, source.events[0]); s.teamA.players[0].photo = "photo"; s.teamA.theme = "brune";
  const swapped = m.invert(s); assert.equal(swapped.teamB, s.teamA); assert.equal(swapped.teamB.players[0].photo, "photo"); assert.deepEqual(swapped.event.team_ids, s.event.team_ids);
  const story = { ...swapped, format: "story", metrics: ["first9"] }; assert.equal(story.teamB.theme, "brune"); assert.equal(JSON.parse(JSON.stringify(story)).teamB.theme, "brune");
});
test("same KPI adapter, exact zero, missing/new season data and no historical leakage", () => {
  const s = m.createSnapshot(source, ...source.teams); const d = m.playerCardData(s, s.teamA.players[0]); assert.equal(d.stats.average, 43.14); assert.equal(metrics.metricValue("winRate", d.stats), "0,0 %"); assert.equal(d.stats.scores180, 0);
  const missing = { ...s.teamA.players[0], dashboard: null }; assert.ok(Object.values(m.playerCardData(s, missing).stats).every(v => v === null));
  s.match.date = "2020-01-01"; assert.equal(m.historicalUnavailable(s), true); assert.ok(Object.values(m.playerCardData(s, s.teamA.players[0]).stats).every(v => v === null));
});
test("Réunion midnight conversions and scheduling rules with unknown hours", () => {
  assert.equal(m.localToUtc("2030-01-02T00:30"), "2030-01-01T20:30:00.000Z"); assert.equal(m.localInput("2030-01-01T22:00:00Z"), "2030-01-02T02:00");
  const s = m.createSnapshot(source, ...source.teams); s.match.date = "2030-01-02"; s.match.time = "01:00";
  assert.equal(m.schedulePreset(s, "h2"), "2030-01-01T23:00"); assert.equal(m.schedulePreset(s, "previous", "10:00"), "2030-01-01T10:00");
  s.match.time = null; assert.throws(() => m.schedulePreset(s, "h2"));
});
test("deterministic editable captions avoid invented participants and relative dates", () => {
  const s = m.createSnapshot(source, ...source.teams); const c = m.caption(s, true); assert.match(c, /présence non confirmée/); assert.doesNotMatch(c, /Ce soir|Aujourd’hui|favori|rivalité/); assert.match(c, /#974Darts/);
});
test("publication uses selected KPI, featured players, exact zeros and honest missing data", () => {
  const s = m.createSnapshot(source, ...source.teams, source.events[0]);
  s.teamA.players[0].featured = true;
  s.teamB.players = s.teamB.players.map(p => ({ ...p, dashboard: null }));
  const before = JSON.stringify(s), c = m.publicationCaption(s);
  assert.match(c, /Nico \(20 legs joués\).*Moyenne 3 fléchettes : 43,14.*Taux de legs gagnés : 0,0 %.*Meilleur finish : 104/);
  assert.match(c, /KPI sélectionnés ne sont pas encore disponibles/);
  assert.match(c, /présence non confirmée/); assert.match(c, /20h00/); assert.match(c, /Saint-Leu/); assert.match(c, /J2/);
  assert.match(c, /référence/); assert.match(c, /#NDXPerformanceLab/);
  assert.doesNotMatch(c, /premier match|report|favori|Ce soir|Aujourd’hui|First 9/);
  assert.equal(JSON.stringify(s), before); assert.ok(c.length <= 5000);
  s.teamA.composition_confirmed = true; s.metrics = ["scores180"];
  const selected = m.publicationCaption(s);
  assert.match(selected, /composition confirmée/); assert.match(selected, /Nico \(20 legs joués\) — Scores 180 : 0/);
  assert.doesNotMatch(selected, /Moyenne 3 fléchettes|Meilleur finish|Taux de legs gagnés/);
});
test("publication never leaks masked historical figures or another season without data", () => {
  const s = m.createSnapshot(source, ...source.teams); s.match.date = "2020-01-01";
  const masked = m.publicationCaption(s);
  assert.match(masked, /historique exact/); assert.doesNotMatch(masked, /43,14|104|Moyenne 3 fléchettes|🎯 Nico/);
  s.match.date = null; s.match.time = null; s.stats_label = "Championnat 2028–2029";
  s.teamA.players.forEach(p => { p.dashboard.meta.has_data = false; });
  s.teamB.players = [];
  const empty = m.publicationCaption(s);
  assert.match(empty, /Date à confirmer · Horaire à confirmer/);
  assert.match(empty, /période Championnat 2028–2029/); assert.doesNotMatch(empty, /43,14|104/);
});
console.log(`${count} Match Day test groups passed.`);

const { NextRequest } = require("next/server"), proxy = load("app/api/admin/match-day/[...path]/route");
const envBefore = { ...process.env }, fetchBefore = globalThis.fetch;
try {
  const url = "https://site.test/api/admin/match-day/source", context = { params: Promise.resolve({ path: ["source"] }) };
  process.env.MATCH_DAY_ENABLED = "true";
  assert.equal((await proxy.GET(new NextRequest(url), context)).status, 403);
  authResult = { ok: true, auth: { user: { id: "admin-id" } } };
  process.env.MATCH_DAY_ENABLED = "false"; assert.equal((await proxy.GET(new NextRequest(url), context)).status, 404);
  process.env.MATCH_DAY_ENABLED = "true"; process.env.NEXT_PUBLIC_SITE_URL = "https://site.test";
  const post = origin => new NextRequest("https://site.test/api/admin/match-day/save", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: "{}" });
  assert.equal((await proxy.POST(post("https://untrusted.test"), { params: Promise.resolve({ path: ["save"] }) })).status, 403);
  assert.equal((await proxy.POST(post("https://site.test"), { params: Promise.resolve({ path: ["execute"] }) })).status, 404);
  process.env.BACKEND_API_URL = "https://internal.test"; process.env.INTERNAL_API_TOKEN = "opaque-private-token";
  const large = new NextRequest("https://site.test/api/admin/match-day/save", { method: "POST", headers: { origin: "https://site.test", "Content-Length": String(19*1024*1024) }, body: "{}" });
  assert.equal((await proxy.POST(large, { params: Promise.resolve({ path: ["save"] }) })).status, 413);
  globalThis.fetch = async (url, options) => { assert.equal(options.headers["X-Internal-Token"], "opaque-private-token"); assert.equal(options.headers["X-User-Id"], "admin-id"); return Response.json({ ok: true }); };
  const response = await proxy.GET(new NextRequest(url), context); assert.equal(response.status, 200); assert.match(response.headers.get("Cache-Control"), /private.*no-store/); assert.doesNotMatch(await response.text(), /opaque-private-token/);
  console.log("PASS Match Day: frontend API role, flag, CSRF origin, path allowlist, upload bound and private responses");
} finally { process.env = envBefore; globalThis.fetch = fetchBefore; }
