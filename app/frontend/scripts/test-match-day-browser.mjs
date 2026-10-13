// Optional local-only suite using tests.match_day_preview (see docs/match-day-v1.md).
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {spawn} from 'node:child_process';
import {fixture} from './match-day-fixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const base=process.env.MATCH_DAY_QA_URL||'http://127.0.0.1:3123',out=process.env.MATCH_DAY_QA_OUTPUT||'/tmp/match-day-qa';mkdirSync(out,{recursive:true});
const root=resolve(dirname(new URL(import.meta.url).pathname),'..'), scratch=mkdtempSync('/tmp/match-day-browser-');
writeFileSync(resolve(scratch,'fixture.json'),JSON.stringify(fixture()));
const env={...process.env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'validation-only',INTERNAL_API_TOKEN:'validation-internal',MATCH_DAY_ENABLED:'true',MATCH_DAY_FACEBOOK_ENABLED:'false',MATCH_DAY_META_PAGES:'[]',NEXT_PUBLIC_DEMO_MODE:'true',NEXT_PUBLIC_SITE_URL:base,ADMIN_USER_ID:'demo-user',BACKEND_API_URL:'http://127.0.0.1:8123',PYTHON_API_URL:'http://127.0.0.1:8123',MATCH_DAY_DB_PATH:resolve(scratch,'queue.sqlite3'),MATCH_DAY_FIXTURE:resolve(scratch,'fixture.json'),MATCH_DAY_CALENDAR:resolve(scratch,'calendar.json'),NEXT_TELEMETRY_DISABLED:'1'};
const api=spawn(process.env.PYTHON_EXECUTABLE||'python',['-m','uvicorn','tests.match_day_preview:app','--host','127.0.0.1','--port','8123'],{cwd:resolve(root,'../backend'),env,stdio:['ignore','pipe','pipe']});
const next=spawn(process.execPath,[resolve(root,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port','3123'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
let log='';for(const p of [api,next]){p.stdout.on('data',b=>log+=b);p.stderr.on('data',b=>log+=b)}
for(let i=0;i<90;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,300));if(i===89){next.kill();api.kill();throw Error(log)}}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--no-zygote','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1480,height:1080},acceptDownloads:true}),errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
 const texts=new WeakMap(),blobTexts=new WeakMap();window.__matchTexts=new Map();
 const fill=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(value,...args){const list=texts.get(this.canvas)||[];list.push(String(value));texts.set(this.canvas,list);return fill.call(this,value,...args)};
 const encode=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(cb,...args){return encode.call(this,b=>{if(b)blobTexts.set(b,texts.get(this)||[]);cb(b)},...args)};
 const create=URL.createObjectURL;URL.createObjectURL=function(b){const url=create.call(this,b);window.__matchTexts.set(url,blobTexts.get(b)||[]);return url};
});
async function ready(old){await page.waitForFunction(old=>{const img=document.querySelector('img[alt^="Match Day"]'),b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Télécharger l’affiche');return img&&img.complete&&b&&!b.disabled&&(!old||img.src!==old)},old)}
async function texts(){return page.evaluate(()=>window.__matchTexts.get(document.querySelector('img[alt^="Match Day"]').src))}
async function step(name){await page.getByRole('button',{name:new RegExp('^[1-5]\\s*'+name)}).click()}
async function exported(name,height){await ready();const event=page.waitForEvent('download');await page.getByRole('button',{name:'Télécharger l’affiche',exact:true}).click();await(await event).saveAs(resolve(out,name));const b=readFileSync(resolve(out,name));assert.equal(b.readUInt32BE(16),1080);assert.equal(b.readUInt32BE(20),height);return b}
async function saved(){await page.getByRole('button',{name:'Enregistrer un brouillon',exact:true}).click();await page.getByRole('status').filter({hasText:'Brouillon enregistré'}).waitFor()}
async function test(name,fn){await fn();results.push(name);console.log('PASS browser Match Day: '+name)}
try{
 await page.goto(base+'/admin/communication/match-day');await ready();
 await test('manual creation with all players, zero KPI and desktop PNG',async()=>{
  await page.getByLabel('Date',{exact:true}).fill('2030-01-02');await page.getByLabel('Heure (Réunion)',{exact:true}).fill('20:00');await page.getByLabel('Lieu',{exact:true}).fill('Papangue Darts Club · Saint-Leu');await ready();
  const t=await texts();assert.ok(t.includes('Nico')&&t.includes('Fabien')&&t.includes('Nico Neige')&&t.includes('Fabien Neige'));assert.ok(t.includes('0,0 %'));assert.equal(t.filter(value=>value==='https://www.youtube.com/@PapangueDartsClub').length,1);
  await exported('duel-publication.png',1350);await page.screenshot({path:resolve(out,'studio-desktop.png'),fullPage:true});
 });
 await test('eight independent variants, same theme, inversion and Story',async()=>{
  await step('Thèmes et design');const a=page.getByRole('group',{name:'Thème A',exact:true}),b=page.getByRole('group',{name:'Thème B',exact:true});assert.equal(await a.getByRole('button').count(),8);assert.equal(await b.getByRole('button').count(),8);
  const images=new Set();for(const label of ['3 Brasseur Club Darts — Bière Ambrée','3 Brasseur Darts Club — Bière Brune','Kaz A Darts A','Kaz A Darts B','TDC Zarboutant','TDC Zarlord']){const old=await page.getByRole('img',{name:/Match Day/}).getAttribute('src');await a.getByRole('button',{name:label,exact:true}).click();await ready(old);images.add((await exported('variant-'+images.size+'.png',1350)).toString('base64'));assert.equal(await b.getByRole('button',{name:'Piton des Neiges',exact:true}).getAttribute('aria-pressed'),'true')};assert.equal(images.size,6);
  await a.getByRole('button',{name:'Piton des Neiges',exact:true}).click();await ready();await exported('same-theme.png',1350);
  await a.getByRole('button',{name:'Piton de la Fournaise',exact:true}).click();await page.getByRole('button',{name:'Inverser les côtés',exact:true}).click();await ready();assert.equal(await b.getByRole('button',{name:'Piton de la Fournaise',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByLabel('Format',{exact:true}).selectOption('story');await ready();await exported('duel-story.png',1920);assert.ok((await texts()).includes('https://www.youtube.com/@PapangueDartsClub'));assert.equal(await b.getByRole('button',{name:'Piton de la Fournaise',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'Réinitialiser les thèmes des équipes',exact:true}).click();await page.getByLabel('Format',{exact:true}).selectOption('publication');await ready();
 });
 await test('real save reload approval and exact durable PNG',async()=>{
  await step('Texte');await page.getByRole('button',{name:'Générer une publication avec les stats',exact:true}).click();await ready();
  const legend=page.getByLabel('Légende Facebook'),generated=await legend.inputValue();
  assert.match(generated,/Moyenne 3 fléchettes/);assert.match(generated,/47,14/);assert.match(generated,/présence non confirmée/);assert.match(generated,/2 janv\. 2030/);assert.match(generated,/20h00/);assert.equal(generated.split('https://www.youtube.com/@PapangueDartsClub').length-1,1);
  const edited=generated+'\nNote ajoutée par l’Admin.';await legend.fill(edited);await ready();await saved();
  await page.reload();await ready();await page.getByRole('button',{name:'Historique',exact:true}).click();await page.getByRole('button',{name:'Réouvrir le brouillon',exact:true}).first().click();await ready();const png=await exported('approved.png',1350);
  await step('Texte');assert.equal(await legend.inputValue(),edited);
  await step('Validation et diffusion');await page.getByRole('button',{name:'Valider ce PNG et ce texte',exact:true}).click();await page.getByRole('status').filter({hasText:'PNG exact'}).waitFor();assert.equal(await page.getByRole('button',{name:'Programmer la publication',exact:true}).isDisabled(),true);
  await step('Texte');await page.getByRole('button',{name:'Générer une publication avec les stats',exact:true}).click();await ready();assert.equal(await legend.inputValue(),generated);await step('Validation et diffusion');assert.ok(await page.getByText('Brouillon à enregistrer et à valider',{exact:true}).count());
  await page.getByRole('button',{name:'Historique',exact:true}).click();const link=page.getByRole('link',{name:/PNG validé/}).first();const r=await page.request.get(base+await link.getAttribute('href'));assert.deepEqual(await r.body(),png);assert.match(r.headers()['cache-control'],/private.*no-store/);
  await page.getByRole('button',{name:'Réouvrir le brouillon',exact:true}).first().click();await ready();await step('Thèmes et design');await page.getByRole('group',{name:'Thème A',exact:true}).getByRole('button',{name:'Kaz A Darts A',exact:true}).click();await ready();await step('Validation et diffusion');assert.ok(await page.getByText('Brouillon à enregistrer et à valider',{exact:true}).count());
 });
 await test('explicit repeated calendar occurrence, inversion keeps home away',async()=>{
  await step('Rencontre');await page.getByLabel('Créer depuis le calendrier / rattacher une rencontre').check();await page.getByLabel('Occurrence de la rencontre').selectOption('calendar-1');await ready();assert.ok((await texts()).includes('Championnat 2026–2027 · J3'));
  await step('Thèmes et design');await page.getByRole('button',{name:'Inverser les côtés',exact:true}).click();await ready();await saved();const h=await(await page.request.get(base+'/api/admin/match-day/history')).json(),s=h.drafts[0].snapshot;assert.equal(s.event.id,'calendar-1');assert.equal(s.event.team_ids[0],'87719ebb-183e-43ac-a96a-5bf4c657939b');assert.notEqual(s.teamA.id,s.event.team_ids[0]);
 });
 await test('explicit photo persistence and KPI change',async()=>{
  await step('Joueurs et statistiques');await page.getByLabel('Photo pour cette affiche uniquement').first().setInputFiles(resolve(out,'duel-publication.png'));await ready();await page.getByRole('checkbox',{name:'Meilleur finish',exact:true}).uncheck();await page.getByRole('checkbox',{name:'First 9',exact:true}).check();await ready();assert.ok((await texts()).includes('FIRST 9'));await saved();const h=await(await page.request.get(base+'/api/admin/match-day/history')).json();assert.ok(h.drafts[0].snapshot.teamA.players[0].photo.startsWith('data:image/png'));
 });
 await test('mobile viewport, historical masking and truthful Meta block',async()=>{
  await page.setViewportSize({width:390,height:844});await step('Thèmes et design');await page.getByRole('button',{name:'Aperçu',exact:true}).click();await ready();await page.screenshot({path:resolve(out,'studio-mobile.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await step('Rencontre');await page.getByLabel('Date',{exact:true}).fill('2020-01-01');await page.getByRole('button',{name:'Aperçu',exact:true}).click();await ready();const t=await texts();assert.ok(t.includes('Historique exact indisponible à cette date · chiffres masqués'));assert.ok(!t.includes('43,14'));await exported('historical-masked.png',1350);
 });
 await test('dense roster is blocked in Publication and complete in Story, long names remain readable',async()=>{
  await page.setViewportSize({width:1480,height:1080});
  await page.route('**/api/admin/match-day/source?season=*',async route=>{
    const response=await route.fetch(),d=await response.json();
    d.teams.forEach((team,i)=>{const template=team.players[0];team.players=Array.from({length:8},(_,j)=>({...template,id:`dense-${i}-${j}`,name:j===7?'Jean François Alexandre de la Montagne':'Joueur '+i+' '+j,photo:null,nickname:null}));});
    await route.fulfill({response,json:d});
  });
  await page.getByRole('button',{name:'Nouvelle affiche / charger la saison',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'trop dense'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Télécharger l’affiche',exact:true}).isDisabled(),true);
  await step('Thèmes et design');await page.getByLabel('Format',{exact:true}).selectOption('story');await ready();
  const t=await texts();assert.ok(t.includes('Joueur 0 6')&&t.includes('Joueur 1 6'));assert.ok(t.some(x=>x.includes('Jean François Alexandre')));
  await exported('dense-story.png',1920);await page.unroute('**/api/admin/match-day/source?season=*');
 });
 await test('Papangue channel is absent for other teams even with a Papangue theme',async()=>{
  await page.route('**/api/admin/match-day/source?season=*',async route=>{
    const response=await route.fetch(),d=await response.json();
    d.teams[0]={...d.teams[0],id:'ea7206d1-bf26-48d1-ae8d-7213ef94884c',name:'3B Darts Club - A(mbrée)',club:'3B Darts Club'};
    d.teams[1]={...d.teams[1],id:'9b85ca85-4c9a-4bb7-8d73-c92e19ae7de3',name:'3B Darts Club - B(rune)',club:'3B Darts Club'};
    await route.fulfill({response,json:d});
  });
  await page.getByRole('button',{name:'Nouvelle affiche / charger la saison',exact:true}).click();await ready();
  await step('Thèmes et design');await page.getByRole('group',{name:'Thème A',exact:true}).getByRole('button',{name:'Piton de la Fournaise',exact:true}).click();await ready();
  assert.ok(!(await texts()).includes('https://www.youtube.com/@PapangueDartsClub'));
  await step('Texte');await page.getByRole('button',{name:'Générer une publication avec les stats',exact:true}).click();await ready();assert.doesNotMatch(await page.getByLabel('Légende Facebook').inputValue(),/youtube/);
  await page.unroute('**/api/admin/match-day/source?season=*');
 });
 assert.deepEqual(errors,[]);writeFileSync(resolve(out,'results.json'),JSON.stringify({results,errors},null,2));
}catch(e){console.error(log.slice(-6000));throw e}finally{await browser.close();next.kill();api.kill()}
