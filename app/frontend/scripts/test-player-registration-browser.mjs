// Real admin UI, admin proxy, public team and player pages against disposable data.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const require=createRequire(import.meta.url), root=resolve(dirname(new URL(import.meta.url).pathname),'..');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||resolve(root,'../../tests/workflow/node_modules/playwright'));
const out=process.env.REGISTRATION_QA_OUTPUT||'/tmp/974darts-registration-qa';mkdirSync(out,{recursive:true});
const sid=randomUUID(),tid=randomUUID(),pid=randomUUID(),iid=randomUUID();
const teamName='Papangue Darts Club - Fournaise';
let registrations=[],posts=[],fail=false,emptyStandings=false;
const options=()=>({seasons:[{id:sid,name:'2026-2027',key:'2026-2027',is_active:true}],clubs:[{code:'PDC',name:'Papangue Darts Club'}],
  teams:[{id:tid,name:teamName,official_club_code:'PDC'}],players:registrations.map(r=>({identity_id:iid,player_id:pid,name:r.display_name})),registrations});
const player=()=>({player_id:pid,name:registrations[0]?.display_name,team:teamName,season_id:sid,affiliation_source:'ADMIN_REGISTRATION',
  legs_played:0,legs_won:0,average_3_darts:null,win_rate:0,first_9:null,best_finish:null,elo:null,scores_180:0,scores_170:0,scores_140:0,scores_100:0,finishes:0,nakka_note:''});
const dashboard=()=>({player:{id:pid,name:player().name,team:teamName,team_id:tid,club:'Papangue Darts Club',club_id:null,public_profile:true,affiliation_source:'ADMIN_REGISTRATION'},
  season:{id:sid,name:'2026-2027',is_active:true},kpis:{legs_played:0,legs_won:0,win_rate:0,average_3_darts:null,first_9:null,best_finish:null,average_finish:null},
  scoring:{scores_80_plus:0,scores_100_plus:0,scores_140_plus:0,scores_170_plus:0,scores_180:0,no_score:0},
  trends:[],recent_matches:[],elo:{available:false,value:null,history:[]},meta:{has_data:false,nakka_note:''}});
const backend=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost'); let data={},status=200;
  if(url.pathname==='/api/v1/player-registrations/admin')data=options();
  else if(url.pathname==='/api/v1/player-registrations/save'){
    assert.equal(req.headers['x-internal-token'],'registration-test-token');assert.equal(req.headers['x-user-id'],'demo-user');
    let raw='';for await(const chunk of req)raw+=chunk;const p=JSON.parse(raw);posts.push(p);
    if(fail){status=409;data={detail:'Ce numéro de licence est déjà utilisé pour cette saison.'};}
    else{const row={...p,id:registrations[0]?.id||randomUUID(),identity_id:iid,season_key:'2026-2027',
      display_name:`${p.first_name} ${p.last_name.toUpperCase()}`,license_number:p.license_number||null};
      registrations=[row];data={status:'CREATED',player_id:pid,registration:row};}
  }else if(url.pathname==='/api/v1/player-registrations/rosters')data={rosters:[{id:'pdc-fournaise',team_id:tid,name:teamName,club:'Papangue Darts Club',players:registrations.map(r=>({officialName:r.display_name,nakkaName:r.nakka_name,license:''}))}]};
  else if(url.pathname==='/api/v1/competitions')data={active_championship:{id:sid,year:2027,name:'2026-2027'},championships:[{id:sid,year:2027,name:'2026-2027',has_data:true}]};
  else if(url.pathname==='/api/v1/competitions/championships/2027')data={championship:{year:2027},summary:{},standings:emptyStandings?[]:[{team_id:tid,name:teamName,rank:1,points:0,played:0,wins:0,draws:0,losses:0,sets_won:0,sets_lost:0,set_difference:0,legs_won:0,legs_lost:0,detail_complete:true}],data_quality_notes:[]};
  else if(url.pathname==='/api/v1/players')data={players:registrations.length?[player()]:[]};
  else if(url.pathname.endsWith('/dashboard')&&url.searchParams.get('season_id')!=='2026')data=dashboard();
  else if(url.pathname.endsWith('/matches'))data={matches:[],summary:{detailed:0,played:0},team:{id:tid,name:teamName}};
  else{status=404;}
  res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));
});
await new Promise(r=>backend.listen(8031,'127.0.0.1',r));
const server=spawn(process.execPath,[resolve(root,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port','3031'],{
  cwd:root,env:{...process.env,NEXT_PUBLIC_DEMO_MODE:'true',ADMIN_USER_ID:'demo-user',BACKEND_API_URL:'http://127.0.0.1:8031',PYTHON_API_URL:'http://127.0.0.1:8031',INTERNAL_API_TOKEN:'registration-test-token',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
let logs='',browser;server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
try{
  for(let i=0;i<90;i++){try{if((await fetch('http://127.0.0.1:3031/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,400));if(i===89)throw Error(logs);}
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox',...(process.env.CHROMIUM_EXTRA_ARGS?JSON.parse(process.env.CHROMIUM_EXTRA_ARGS):[])]});
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:3031/admin/players');await page.getByLabel('Prénom',{exact:true}).waitFor();
  await page.getByLabel('Prénom',{exact:true}).fill('Élodie');await page.getByLabel('Nom',{exact:true}).fill('Validation');
  await page.getByLabel(/Pseudo Nakka/).fill('ElodieQA');await page.getByLabel('Club',{exact:true}).selectOption('PDC');
  assert.equal(await page.getByLabel('Équipe',{exact:true}).locator('option').count(),2);
  await page.getByLabel('Équipe',{exact:true}).selectOption(tid);await page.getByLabel('Date d’arrivée',{exact:true}).fill('2026-10-20');
  await page.screenshot({path:resolve(out,'admin-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'Valider l’inscription',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Élodie VALIDATION est enregistré.'}).waitFor();
  assert.equal(posts.length,1);assert.equal(posts[0].license_number,'');assert.equal(registrations.length,1);
  await page.getByRole('button',{name:'Compléter',exact:true}).click();await page.getByLabel(/Numéro de licence/).fill('97402999');
  fail=true;await page.getByRole('button',{name:'Valider l’inscription',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'déjà utilisé'}).waitFor();assert.equal(await page.getByLabel(/Numéro de licence/).inputValue(),'97402999');
  fail=false;await page.getByRole('button',{name:'Valider l’inscription',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Élodie VALIDATION est enregistré.'}).waitFor();
  assert.equal(posts[1].request_id,posts[2].request_id);assert.equal(posts[2].identity_id,iid);assert.equal(registrations.length,1);
  for(const width of [390,768,1440]){
    await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));await page.screenshot({path:resolve(out,`viewport-${width}.png`),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow at ${width}`);
    if(width===390)await page.screenshot({path:resolve(out,'admin-mobile.png'),fullPage:true});
  }
  await page.getByRole('link',{name:'Voir l’équipe →',exact:true}).click();await page.locator('.team-roster').getByText('Élodie VALIDATION',{exact:true}).waitFor();
  emptyStandings=true;await page.reload();await page.locator('.team-roster').getByText('Élodie VALIDATION',{exact:true}).waitFor();
  await page.goto(`http://127.0.0.1:3031/players/${pid}`);await page.getByRole('heading',{name:'Élodie VALIDATION',exact:true}).waitFor();
  assert.match(await page.locator('.player-affiliation-timeline').textContent(),/Papangue Darts Club - Fournaise/);
  assert.deepEqual(errors,[]);console.log('PASS browser registration: admin form, club filtering, pending licence, correction, same retry key, 390/768/1440 layout, live team and player pages');
}finally{writeFileSync(resolve(out,'server.log'),logs);await browser?.close();server.kill('SIGTERM');await new Promise(r=>backend.close(r));}
