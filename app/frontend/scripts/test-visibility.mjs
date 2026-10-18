import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {NextRequest,NextResponse} from 'next/server.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const nativeRequire=createRequire(import.meta.url);
let authorized=200;
function load(path,mocks={}) {
  const mod={exports:{}};
  const code=ts.transpileModule(readFileSync(resolve(root,path),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',code)(name=>mocks[name]??nativeRequire(name),mod,mod.exports);
  return mod.exports;
}
const {visibilitySelection,signVisibilitySummary}=load('lib/visibility-summary.ts');
const id='f678a113-699e-496e-ae0a-944d37d25893';
assert.deepEqual(visibilitySelection(id,[]),{kind:'interclub',result_id:id});
assert.deepEqual(visibilitySelection('tournament:oc1-2026-10-18',[]),{kind:'tournament',code:'oc1-2026-10-18'});
assert.equal(visibilitySelection('tournament:../ranking',[]),null);
assert.equal(visibilitySelection('tournament:'+'x'.repeat(121),[]),null);
assert.equal(visibilitySelection('bdc-manche-2',[]),null);
const summary={whatsapp:'Texte Comité',facebook:'Bravo !',mode:'statistics',ai_available:false,evening:{url:'https://974darts.re/tournaments/oc1',matches:null,legs:null,players:7,playersLabel:'doublettes'}};
assert.deepEqual(visibilitySelection('bdc-manche-2',[{id:'bdc-manche-2',summary}]),{kind:'bdc',summary});
const signed=signVisibilitySummary(summary);
assert.deepEqual(signVisibilitySummary(signed),signed);
assert.equal(signed.evening.matches,null);
const route=load('app/api/admin/visibility/[action]/route.ts',{
  '@/lib/auth/session':{authorizeAdminApi:async()=>authorized===200?{ok:true}:{ok:false,response:NextResponse.json({error:'Interdit'},{status:authorized})}},
  '@/lib/site-url':{getSiteOrigin:()=> 'https://974darts.re'},
});
const nativeFetch=globalThis.fetch;
const oldEnv={BACKEND_API_URL:process.env.BACKEND_API_URL,INTERNAL_API_TOKEN:process.env.INTERNAL_API_TOKEN};
process.env.BACKEND_API_URL='https://backend.invalid'; process.env.INTERNAL_API_TOKEN='secret-test';
const calls=[];
const request=(action,{method='GET',body,query='',headers={}}={})=>route[method](new NextRequest(`https://974darts.re/api/admin/visibility/${action}${query}`,{
  method,headers:{origin:'https://974darts.re','content-type':'application/json',...headers},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body??{})}:{}),
}),{params:Promise.resolve({action})});
try {
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});return Response.json(summary)};
  for(const status of [401,403]) {authorized=status;assert.equal((await request('tournaments')).status,status)} authorized=200;
  assert.equal((await request('ranking')).status,404);
  assert.equal((await request('tournaments',{method:'POST'})).status,404);
  assert.equal((await request('tournament-summary',{query:'?code=../ranking'})).status,400);
  assert.equal((await request('summary',{query:'?result_id=tournament:oc1'})).status,400);
  assert.equal((await request('summary',{method:'POST',body:{code:'oc1'}})).status,400);
  assert.equal((await request('tournament-summary',{method:'POST',body:{code:'oc1'},headers:{origin:'https://evil.invalid'}})).status,403);
  for(const context of [42,'x'.repeat(1601)]) assert.equal((await request('tournament-summary',{method:'POST',body:{code:'oc1',context}})).status,400);
  assert.equal((await request('tournament-summary',{method:'POST',body:{code:'oc1',points:999}})).status,400);
  assert.equal((await request('tournament-summary',{method:'POST',body:' '.repeat(12001)})).status,413);
  assert.equal((await request('tournament-summary',{method:'POST',body:{code:'oc1'},headers:{'content-type':'text/plain'}})).status,415);
  assert.equal(calls.length,0,'Invalid requests must never reach backend');
  let response=await request('tournaments',{query:'?publish=true'});
  assert.equal(response.status,200); assert.equal(calls.at(-1).url,'https://backend.invalid/api/v1/visibility/tournaments');
  response=await request('tournament-summary',{query:'?code=oc1-2026-10-18&provider=ai'});
  assert.equal(calls.at(-1).url,'https://backend.invalid/api/v1/visibility/tournament-summary?code=oc1-2026-10-18');
  assert.equal(calls.at(-1).options.method,'GET'); assert.equal(calls.at(-1).options.body,undefined);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.doesNotMatch(await response.text(),/secret-test/);
  response=await request('tournament-summary',{method:'POST',body:{code:'oc1-2026-10-18',context:'Merci aux bénévoles.'}});
  assert.equal(response.status,200); assert.deepEqual(JSON.parse(calls.at(-1).options.body),{code:'oc1-2026-10-18',context:'Merci aux bénévoles.'});
  assert.equal(calls.at(-1).options.headers['X-Internal-Token'],'secret-test');
  assert.equal((await request('tournament-summary',{method:'POST',body:{code:'x'.repeat(120),context:null}})).status,200);
  assert.equal((await request('summary',{method:'POST',body:{result_id:id,context:null}})).status,400);
  assert.equal((await request('summary',{query:`?result_id=${id}`})).status,200);
  assert.equal(calls.at(-1).url,`https://backend.invalid/api/v1/visibility/summary?result_id=${id}`);
  globalThis.fetch=async()=>Response.json({detail:'Tournoi non publié.'},{status:404});
  assert.equal((await request('tournament-summary',{query:'?code=unpublished'})).status,404);
  console.log('PASS visibility: typed interclub/BDC/tournament selection, signed drafts, nullable counts, administrator and origin checks, exact routes, bounded context, GET read-only, independent IDs and private responses.');
} finally {
  globalThis.fetch=nativeFetch;
  for(const [key,value] of Object.entries(oldEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value}
}
