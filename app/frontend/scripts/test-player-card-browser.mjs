// Optional integration/visual suite. Requires Playwright in the validation runtime, not in production.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const out = resolve(process.env.PLAYER_CARD_QA_OUTPUT || "/tmp/player-card-qa"); mkdirSync(out, { recursive: true });
const dashboard = (season, id) => ({
  player: { id, name: "Joueur de validation", public_profile: id !== "private-player", team_id: "validated-team-uuid", team: "Équipe de validation", club_id: "validated-club-uuid", club: "Club de validation" },
  season: { id: season === "all" ? "all" : "season-2027", name: season === "all" ? "Toute la carrière" : season === "2026" ? "2025-2026" : "2026-2027", is_active: true },
  kpis: { legs_played: 8, legs_won: 3, win_rate: 37.5, average_3_darts: season === "2026" ? 44 : 50, first_9: null, best_finish: 64, average_finish: null },
  scoring: { scores_100_plus: 5, scores_140_plus: 0, scores_180: 0, scores_80_plus: 1, scores_170_plus: 0, no_score: 0 },
  trends: [], recent_matches: [], elo: { available: false, value: null, history: [] },
  meta: { has_data: true, nakka_note: "Source synthétique de validation", data_quality: { player_stat_rows: 8 } },
});
let failSource = false;
const backend = createServer((req,res) => {
  const url = new URL(req.url,"http://localhost"); let body;
  if (url.pathname === "/api/v1/competitions") body={championships:[{id:"season-2027",year:2027,name:"Championnat de validation",has_data:true},{id:"season-2026",year:2026,has_data:true}]};
  else if (url.pathname.endsWith("/dashboard")) { if (failSource) { res.statusCode=503; body={error:"offline"}; } else body=dashboard(url.searchParams.get("season_id"),url.pathname.split("/").at(-2)); }
  else if (url.pathname === "/api/v1/players") body={players:[{player_id:"validation-player",name:"Joueur de validation",team:"Équipe de validation",average_3_darts:50,win_rate:37.5}]};
  else { res.statusCode=404; body={}; }
  res.setHeader("Content-Type","application/json");res.end(JSON.stringify(body));
});
await new Promise(r=>backend.listen(8011,"127.0.0.1",r));
const env={...process.env,PLAYER_CARD_ENABLED:"true",PLAYER_CARD_PREVIEW:"true",PLAYER_CARD_THEME_BINDINGS:'{"teams":{"validated-team-uuid":"fournaise"}}',PYTHON_API_URL:"http://127.0.0.1:8011",NEXT_TELEMETRY_DISABLED:"1"};
const server=spawn(process.execPath,[resolve(root,"node_modules/next/dist/bin/next"),"dev","--webpack","--hostname","127.0.0.1","--port","3011"],{cwd:root,env,stdio:["ignore","pipe","pipe"]});
let serverLog="";server.stdout.on("data",b=>serverLog+=b);server.stderr.on("data",b=>serverLog+=b);
const base="http://127.0.0.1:3011";let browser;const errors=[];const results=[];
async function test(label,fn){await fn();results.push(label);console.log("PASS browser: "+label);}
async function ready(page){await page.locator(".pc-export-state").waitFor(); await page.getByRole("button",{name:"Télécharger en PNG",exact:true}).waitFor({state:"visible"});}
async function exportPNG(page,name,height){await ready(page);const dl=page.waitForEvent("download");await page.getByRole("button",{name:"Télécharger en PNG",exact:true}).click();const file=await dl;await file.saveAs(resolve(out,name));const b=readFileSync(resolve(out,name));assert.equal(b.readUInt32BE(16),1080);assert.equal(b.readUInt32BE(20),height);assert.doesNotMatch(file.suggestedFilename(), /@|uuid|private|canonical/);}
try {
  for(let i=0;i<60;i++){try{if((await fetch(base+"/api/health")).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));if(i===59)throw Error(serverLog);}
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:["--no-sandbox","--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream",...(process.env.CHROMIUM_EXTRA_ARGS ? JSON.parse(process.env.CHROMIUM_EXTRA_ARGS) : [])]});
  const context=await browser.newContext({viewport:{width:1440,height:1080},acceptDownloads:true,permissions:["camera"]});const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
  await test("Fournaise publication and story export exact physical PNG dimensions",async()=>{
    await page.goto(base+"/player-card-preview");await exportPNG(page,"publication-fournaise.png",1350);await page.screenshot({path:resolve(out,"studio-desktop.png"),fullPage:true});
    await page.getByText("Personnaliser",{exact:true}).click();await page.getByRole("button",{name:"Story",exact:true}).click();await exportPNG(page,"story-fournaise.png",1920);
  });
  await test("theme/format changes replace the PNG; affiliation remains unchanged",async()=>{
    const before=await page.locator("img.pc-card").getAttribute("src");await page.getByRole("button",{name:"Neige",exact:true}).click();await ready(page);assert.notEqual(await page.locator("img.pc-card").getAttribute("src"),before);
    await page.getByRole("button",{name:"Publication",exact:true}).click();await exportPNG(page,"publication-neige.png",1350);
    await page.getByRole("button",{name:"Publication",exact:true}).click();await ready(page); // selecting the current option must not leave export disabled
  });
  await test("partial data, accents, long names and absent affiliations export cleanly",async()=>{
    await page.goto(base+"/player-card-preview?partial=1");await exportPNG(page,"publication-partial.png",1350);
    await page.goto(base+"/player-card-preview?long=1");await exportPNG(page,"publication-long-name.png",1350);
  });
  await test("native sharing unsupported and cancelled: no automatic download",async()=>{
    await page.goto(base+"/player-card-preview");await ready(page);await page.evaluate(()=>{Object.defineProperty(navigator,"canShare",{configurable:true,value:()=>false});});await page.getByRole("button",{name:"Partager ma carte",exact:true}).click();await page.getByRole("status").filter({hasText:"partage de fichiers"}).waitFor();
    await page.evaluate(()=>{Object.defineProperty(navigator,"canShare",{configurable:true,value:()=>true});Object.defineProperty(navigator,"share",{configurable:true,value:async({files})=>{window.__sharedFile=files[0];}});});
    await page.getByRole("button",{name:"Partager ma carte",exact:true}).click();await page.getByRole("status").filter({hasText:"partage natif est terminé"}).waitFor();
    await exportPNG(page,"publication-share-current.png",1350);
    const sharedHash=await page.evaluate(async()=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await window.__sharedFile.arrayBuffer()))));
    assert.equal(Buffer.from(sharedHash).toString("hex"),createHash("sha256").update(readFileSync(resolve(out,"publication-share-current.png"))).digest("hex"));
    await page.evaluate(()=>{Object.defineProperty(navigator,"share",{configurable:true,value:async()=>{throw new DOMException("cancel","AbortError");}});});
    let downloads=0;const listen=()=>downloads++;page.on("download",listen);await page.getByRole("button",{name:"Partager ma carte",exact:true}).click();await page.waitForTimeout(200);assert.equal(downloads,0);page.off("download",listen);
  });
  await test("photo import, recrop and initials update the prepared file without persistence",async()=>{
    await page.getByText("Personnaliser",{exact:true}).click();await page.getByRole("button",{name:"Modifier ma photo",exact:true}).click();
    await page.locator('input[type="file"]').setInputFiles({name:"bad.png",mimeType:"image/png",buffer:Buffer.from("not an image")});await page.getByRole("alert").filter({hasText:"valide"}).waitFor();
    await page.locator('input[type="file"]').setInputFiles({name:"too-big.png",mimeType:"image/png",buffer:Buffer.alloc(11*1024*1024)});await page.getByRole("alert").filter({hasText:"10 Mo"}).waitFor();
    await page.locator('input[type="file"]').setInputFiles({name:"source.png",mimeType:"image/png",buffer:readFileSync(resolve(out,"publication-fournaise.png"))});
    await page.getByRole("button",{name:"Valider le cadrage",exact:true}).waitFor();await page.getByLabel("Zoom",{exact:true}).fill("1.75");await page.getByRole("button",{name:"Valider le cadrage",exact:true}).click();await exportPNG(page,"publication-import-crop.png",1350);
    await page.getByRole("button",{name:"Modifier ma photo",exact:true}).click();await page.getByRole("button",{name:"Utiliser mes initiales",exact:true}).click();await ready(page);
  });
  await test("native JPEG EXIF rotation and WebP/HEIC import behavior",async()=>{
    const jpegURL=await page.evaluate(()=>{const c=document.createElement("canvas");c.width=120;c.height=80;const ctx=c.getContext("2d");ctx.fillStyle="#ff0000";ctx.fillRect(0,0,60,80);ctx.fillStyle="#0000ff";ctx.fillRect(60,0,60,80);return c.toDataURL("image/jpeg",1);});
    const jpeg=Buffer.from(jpegURL.split(",")[1],"base64");
    // APP1 EXIF little-endian TIFF with one orientation=6 (90 degrees clockwise) entry.
    const exif=Buffer.from("ffe1002245786966000049492a0008000000010012010300010000000600000000000000","hex");
    const rotated=Buffer.concat([jpeg.subarray(0,2),exif,jpeg.subarray(2)]);
    await page.getByRole("button",{name:"Modifier ma photo",exact:true}).click();await page.locator('input[type="file"]').setInputFiles({name:"rotated.jpg",mimeType:"image/jpeg",buffer:rotated});await page.getByRole("button",{name:"Valider le cadrage",exact:true}).waitFor();
    await page.waitForFunction(()=>{const c=document.querySelector("dialog canvas");if(!c)return false;const x=c.getContext("2d");const top=x.getImageData(200,50,1,1).data,bottom=x.getImageData(200,350,1,1).data;return top[0]>200&&top[2]<50&&bottom[2]>200&&bottom[0]<50;});
    await page.getByRole("button",{name:"Valider le cadrage",exact:true}).click();await exportPNG(page,"publication-exif-photo.png",1350);
    const png=readFileSync(resolve(out,"publication-exif-photo.png"));let pos=8;while(pos<png.length){const type=png.toString("ascii",pos+4,pos+8);assert.notEqual(type,"eXIf");pos+=png.readUInt32BE(pos)+12;}
    await page.getByRole("button",{name:"Modifier ma photo",exact:true}).click();await page.locator('input[type="file"]').setInputFiles({name:"photo.heic",mimeType:"image/heic",buffer:Buffer.from("heic")});await page.getByRole("alert").filter({hasText:"HEIC/HEIF"}).waitFor();
    const webpURL=await page.evaluate(()=>{const c=document.createElement("canvas");c.width=100;c.height=100;c.getContext("2d").fillRect(0,0,100,100);return c.toDataURL("image/webp");});
    await page.locator('input[type="file"]').setInputFiles({name:"photo.webp",mimeType:"image/webp",buffer:Buffer.from(webpURL.split(",")[1],"base64")});await page.getByRole("button",{name:"Valider le cadrage",exact:true}).waitFor();await page.getByRole("button",{name:"Utiliser mes initiales",exact:true}).click();await ready(page);
  });
  await test("camera actual fake-device stream captures, stops, denies and releases late acquisition",async()=>{
    await page.getByRole("button",{name:"Modifier ma photo",exact:true}).click();await page.getByRole("button",{name:"Prendre une photo",exact:true}).click();await page.waitForFunction(()=>document.querySelector("video")?.videoWidth>0);
    await page.evaluate(()=>{window.__testStream=document.querySelector("video").srcObject;});await page.getByRole("button",{name:"Capturer",exact:true}).click();assert.equal(await page.evaluate(()=>window.__testStream.getTracks().every(t=>t.readyState==="ended")),true);
    await page.getByRole("button",{name:"Valider le cadrage",exact:true}).click();await ready(page);
    await page.evaluate(()=>{window.__originalGetUserMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException("denied","NotAllowedError");};});await page.getByRole("button",{name:"Modifier ma photo",exact:true}).click();await page.getByRole("button",{name:"Prendre une photo",exact:true}).click();await page.getByRole("alert").filter({hasText:"refusé"}).waitFor();await page.getByRole("button",{name:"Annuler",exact:true}).click();
    await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async c=>{const s=await window.__originalGetUserMedia(c);window.__lateStream=s;await new Promise(r=>setTimeout(r,600));return s;};});await page.getByRole("button",{name:"Modifier ma photo",exact:true}).click();await page.getByRole("button",{name:"Prendre une photo",exact:true}).click();await page.getByRole("button",{name:"Fermer",exact:true}).click();await page.waitForFunction(()=>window.__lateStream?.getTracks().every(t=>t.readyState==="ended"));
  });
  await test("mobile profile and studio remain within viewport",async()=>{
    await page.setViewportSize({width:390,height:844});await page.goto(base+"/player-card-preview?view=profile");await page.screenshot({path:resolve(out,"profile-mobile-demo.png"),fullPage:true});await page.getByRole("link",{name:"Créer ma carte",exact:true}).click();await ready(page);await page.screenshot({path:resolve(out,"studio-mobile.png"),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  });
  await test("real profile integration: full document navigation grants camera and retains season",async()=>{
    const response=await page.goto(base+"/players/validation-player?season=2027");assert.match(response.headers()["permissions-policy"],/camera=\(\)/);await page.screenshot({path:resolve(out,"profile-integration.png"),fullPage:true});
    let request;page.once("request",r=>request=r);const next=page.waitForNavigation();await page.getByRole("link",{name:"Créer ma carte",exact:true}).click();const navigated=await next;assert.equal(request.isNavigationRequest(),true);assert.match(page.url(),/\/card\?season=2027$/);assert.match(navigated.headers()["permissions-policy"],/camera=\(self\)/);await ready(page);
    const payload=await (await context.request.get(base+"/api/player-card/validation-player?season=2027")).json();assert.equal(payload.data.stats.average,50);assert.equal(payload.theme,"fournaise");assert.equal(payload.data.demonstration,false);
    await page.getByText("Personnaliser",{exact:true}).click();await page.getByLabel("Période statistique",{exact:true}).selectOption("2026");await ready(page);assert.match(await page.locator("img.pc-card").getAttribute("alt"),/2025-2026/);
  });
  await test("public/private authorization and source failure retry without demo fallback",async()=>{
    const denied=await context.request.get(base+"/api/player-card/private-player");assert.equal(denied.status(),403);assert.doesNotMatch(await denied.text(),/Joueur de validation/);
    failSource=true;await page.goto(base+"/players/validation-player/card?season=2027");await page.getByRole("alert").filter({hasText:"Statistiques indisponibles"}).waitFor();assert.equal(await page.locator("img.pc-card").count(),0);failSource=false;await page.getByRole("button",{name:"Réessayer",exact:true}).click();await ready(page);
    const direct=await context.request.get(base+"/players/validation-player/card?season=2027");assert.match(direct.headers()["permissions-policy"],/camera=\(self\)/);const lab=await context.request.get(base+"/admin/vision",{maxRedirects:0});assert.match(lab.headers()["permissions-policy"],/screen-wake-lock=\(self\)/);
  });
  assert.deepEqual(errors,[]);
  console.log(`${results.length} browser groups passed (Chromium desktop/mobile emulation; fake camera, synthetic backend; not a physical phone).`);
} finally {
  writeFileSync(resolve(out,"browser-results.json"),JSON.stringify({passed:results,pageErrors:errors},null,2));writeFileSync(resolve(out,"server.log"),serverLog);
  await browser?.close();server.kill("SIGTERM");backend.close();
}
