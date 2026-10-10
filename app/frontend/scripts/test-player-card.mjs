import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url), root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const cache = new Map();
function load(path) {
  const file = path.endsWith(".ts") ? resolve(root, path) : resolve(root, path + ".ts");
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} }; cache.set(file, mod);
  const js = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", "__dirname", js)(p => p.startsWith(".") ? load(resolve(dirname(file), p)) : p.startsWith("@/") ? load(p.slice(2)) : require(p), mod, mod.exports, dirname(file));
  return mod.exports;
}
const data = load("lib/player-card/data"), themes = load("lib/player-card/themes"), photo = load("lib/player-card/photo"), exporter = load("lib/player-card/export"), feature = load("lib/player-card/feature"), source = load("lib/player-card/server"), route = load("app/api/player-card/[player_id]/route");
const originalEnv = { ...process.env }; let checks = 0;
const test = async (label, fn) => { await fn(); checks++; console.log("PASS player card: " + label); };
const dashboard = {
  player: { id: "canonical-player", name: "Nicolas Éléonore", public_profile: true, team_id: "team-uuid", team: "Équipe actuelle", club_id: "club-uuid", club: "Club actuel" },
  season: { id: "season-uuid", name: "2026-2027" }, kpis: { average_3_darts: 43.14, first_9: 52.96, best_finish: 104, legs_won: 40, legs_played: 87, win_rate: 99 }, scoring: { scores_100_plus: 44, scores_140_plus: 9 },
  meta: { has_data: true, data_quality: { player_stat_rows: 87 } }, recent_matches: [], trends: [],
};
try {
  await test("profile adapter preserves source values, canonical public identity and categories", () => {
    const d = data.adaptDashboard(dashboard, "Interclubs"); assert.equal(d.stats.average, 43.14); assert.equal(d.stats.scores100, 44); assert.equal(d.stats.scores140, 9); assert.equal(d.stats.bestAverage, null); assert.equal(d.nickname, null); assert.equal(d.period, "Saison 2026-2027"); assert.equal(d.demonstration, false); assert.equal(d.initials, "NÉ"); assert.equal(d.name, dashboard.player.name);
    assert.doesNotMatch(JSON.stringify(d), /canonical-player|team-uuid|club-uuid|email|phone|DataMan/);
    assert.throws(() => data.adaptDashboard({ ...dashboard, player: { ...dashboard.player, public_profile: false } }, null));
  });
  await test("40/87 → 46,0 %, real zero, missing/non-finite/invalid counts and no legs", () => {
    assert.equal(data.formatNumber(data.winRate(40, 87), 1), "46,0"); assert.equal(data.winRate(0, 10), 0);
    for (const [w,p] of [[0,0],[null,87],[40,null],[88,87],[-1,2],[NaN,2],[Infinity,2],[1.5,2]]) assert.equal(data.winRate(w,p), null);
    assert.equal(data.formatNumber(0), "0,00"); assert.equal(data.formatNumber(null), "—"); assert.equal(data.formatNumber(NaN), "—");
    const noData = data.adaptDashboard({ ...dashboard, meta: { has_data: false } }, null); assert.ok(Object.values(noData.stats).every(n => n === null));
    const fallback = data.adaptDashboard({ ...dashboard, meta: { has_data: true, data_quality: { player_stat_rows: 0 } } }, null); assert.equal(fallback.stats.scores100, null);
  });
  await test("typed themes use exact team/club IDs with neutral fallback and no affiliation mutation", () => {
    const bindings = themes.parseBindings('{"teams":{"team-uuid":"fournaise"},"clubs":{"club-uuid":"neige"}}');
    assert.equal(themes.defaultTheme("team-uuid", "club-uuid", bindings), "fournaise"); assert.equal(themes.defaultTheme(null, "club-uuid", bindings), "neige"); assert.equal(themes.defaultTheme("Fournaise", null, bindings), "neutral");
    assert.equal(themes.defaultTheme("87719ebb-183e-43ac-a96a-5bf4c657939b",null),"fournaise"); assert.equal(themes.defaultTheme("4a3849c5-3096-4443-87e0-9ce5fd248a46",null),"neige"); assert.equal(themes.defaultTheme("toString",null),"neutral");
    assert.throws(() => themes.parseBindings('{"teams":{"x":"unknown"}}'));
    assert.equal(data.adaptDashboard(dashboard, null).team, "Équipe actuelle");
  });
  await test("strict season filter matches profile years; no name resolution or fixture fallback", async () => {
    assert.equal(data.parseSeason("2027"), "2027"); assert.throws(() => data.parseSeason("2030"));
    const calls = []; globalThis.fetch = async url => { calls.push(url); return Response.json(url.includes("/dashboard") ? dashboard : { championships: [{ id: "season-uuid", name: "Interclubs", year: 2027, has_data: true }] }); };
    const payload = await source.loadCard("legacy/player", "2027"); assert.match(calls[0], /legacy%2Fplayer\/dashboard\?season_id=2027$/); assert.equal(payload.data.name, "Nicolas Éléonore"); assert.equal(payload.selectedSeason, "2027"); assert.equal(payload.data.competition, "Interclubs");
    globalThis.fetch = async () => Response.json({}, { status: 503 }); await assert.rejects(source.loadCard("canonical-player", "2027"));
  });
  await test("API checks activation, public visibility, error status and private no-store", async () => {
    const ctx = { params: Promise.resolve({ player_id: "canonical-player" }) };
    delete process.env.PLAYER_CARD_ENABLED; let r = await route.GET(new Request("http://local/api/player-card/x"), ctx); assert.equal(r.status, 404);
    process.env.PLAYER_CARD_ENABLED = "true";
    globalThis.fetch = async () => Response.json({ ...dashboard, player: { ...dashboard.player, public_profile: false } });
    r = await route.GET(new Request("http://local/api/player-card/x?season=2027"), ctx); assert.equal(r.status, 403); assert.match(r.headers.get("Cache-Control"), /no-store/); assert.doesNotMatch(await r.text(), /Nicolas|canonical-player/);
    r = await route.GET(new Request("http://local/api/player-card/x?season=2030"), ctx); assert.equal(r.status, 400);
    globalThis.fetch = async () => { throw Error("backend secret URL"); }; r = await route.GET(new Request("http://local/api/player-card/x"), ctx); assert.equal(r.status, 503); assert.doesNotMatch(await r.text(), /secret|DataMan/);
  });
  await test("development fixture is never enabled in production", () => {
    process.env.PLAYER_CARD_PREVIEW = "true"; process.env.NODE_ENV = "production"; assert.equal(feature.playerCardPreviewEnabled(), false);
    process.env.NODE_ENV = "development"; assert.equal(feature.playerCardPreviewEnabled(), true);
    assert.doesNotMatch(readFileSync(resolve(root,"lib/player-card/server.ts"),"utf8"), /fixture|DEMO_CARD/);
  });
  await test("photo type/size constraints, HEIC alternative and consistent square crop geometry", () => {
    for (const type of ["image/jpeg","image/png","image/webp"]) photo.validatePhotoFile({type, size:100,name:"photo"});
    assert.throws(() => photo.validatePhotoFile({type:"image/png",size:11*1024*1024,name:"photo.png"}));
    assert.throws(() => photo.validatePhotoFile({type:"image/heic",size:10,name:"photo.heic"}), /JPEG/);
    assert.throws(() => photo.validatePhotoFile({type:"image/svg+xml",size:10,name:"photo.svg"}));
    assert.deepEqual(photo.cropRectangle(1200,800,{x:.5,y:.5,zoom:2}),{sx:400,sy:200,side:400});
    assert.deepEqual(photo.cropRectangle(800,1200,{x:0,y:1,zoom:1}),{sx:0,sy:400,side:800});
  });
  await test("camera requests video only, stops completed and late streams, and preserves denial", async () => {
    let stopped=0, constraints; const stream={getTracks:()=>[{stop:()=>stopped++}]};
    const session=new photo.CameraSession(); const media={getUserMedia:async c=>{constraints=c;return stream;}};
    assert.equal(await session.start(media,"user"),stream); assert.equal(constraints.audio,false); assert.equal(constraints.video.facingMode.ideal,"user"); session.stop(); assert.equal(stopped,1);
    let deliver; const pending=session.start({getUserMedia:()=>new Promise(r=>deliver=r)},"user"); session.stop(); deliver(stream); assert.equal(await pending,null); assert.equal(stopped,2);
    await assert.rejects(session.start({getUserMedia:async()=>{throw new DOMException("Denied","NotAllowedError");}},"user"));
    assert.match(photo.cameraError(new DOMException("Denied","NotAllowedError")), /refusé/);
  });
  await test("prepared file sharing: supported, unsupported and cancellation without download", async () => {
    const file=new File(["PNG"],"test.png",{type:"image/png"}); let shared=0;
    const nav={canShare:args=>args.files[0]===file,share:async args=>{assert.equal(args.files[0],file);shared++;}};
    assert.equal(await exporter.shareFile(file,nav),"shared"); assert.equal(shared,1);
    assert.equal(await exporter.shareFile(file,{canShare:()=>false,share:async()=>assert.fail()}),"unsupported");
    assert.equal(await exporter.shareFile(file,{canShare:()=>true,share:async()=>{throw new DOMException("cancel","AbortError");}}),"cancelled");
  });
  await test("permissions remain denied by default; enabled documents only, Vision unchanged", async () => {
    const config=load("next.config").default; delete process.env.PLAYER_CARD_ENABLED;
    let rules=await config.headers(); assert.deepEqual(rules.filter(r=>r.headers.some(h=>h.key==="Permissions-Policy"&&h.value.includes("camera=(self)"))).map(r=>r.source),["/admin/vision"]);
    process.env.PLAYER_CARD_ENABLED="true"; process.env.NODE_ENV="production"; rules=await config.headers(); assert.deepEqual(rules.filter(r=>r.headers.some(h=>h.key==="Permissions-Policy"&&h.value.includes("camera=(self)"))).map(r=>r.source),["/admin/vision","/players/:player_id/card"]);
    assert.ok(rules.find(r=>r.source==="/(.*)").headers.some(h=>h.value==="camera=(), microphone=(), geolocation=()"));
    const card=rules.find(r=>r.source==="/players/:player_id/card"); assert.ok(card.headers.some(h=>h.value.includes("microphone=(), geolocation=()"))); assert.ok(card.headers.some(h=>h.value.includes("media-src 'self' blob:")));
    process.env.NODE_ENV="development"; rules=await config.headers(); assert.ok(rules.find(r=>r.source==="/player-card-preview"));
    const profile=readFileSync(resolve(root,"app/players/[player_id]/page.tsx"),"utf8"); assert.match(profile, /<a className="btn btn-primary" href=\{`\/players/);
  });
  console.log(`${checks} player card test groups passed.`);
} finally { process.env = originalEnv; }
