/** Loopback-only test fixture: real PostgreSQL workflow RPCs, fictitious Auth.
 * Never deploy this server, reuse a real key or bind it to a public address. */
import {PGlite} from '@electric-sql/pglite';
import {createServer} from 'node:http';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const db=new PGlite();
const ids={admin:'00000000-0000-0000-0000-000000000001',director:'00000000-0000-0000-0000-000000000002',player:'00000000-0000-0000-0000-000000000003'};
const read=p=>readFileSync(resolve(root,p),'utf8');
await db.exec(read('tests/workflow/bootstrap.sql'));
await db.exec(read('supabase/release_migrations/MIGRATION_SUPABASE_V21_0_19_COMMITTEE_RANKING.sql'));
await db.exec('alter table committee_ranking_results add column identity_id uuid');
for(const file of readdirSync(resolve(root,'supabase/migrations')).sort()) await db.exec(read('supabase/migrations/'+file));
await db.query("update profiles set role='SPORTS_DIRECTOR',display_name='Directeur sportif · Démonstration' where user_id=$1",[ids.director]);
await db.exec('alter table profiles add column player_id uuid; alter table profiles add column captain_team_id uuid; create table player_aliases(identity_id uuid,alias_name text,confirmed boolean); create table committee_clubs(code text,name text); create table committee_licensed_players(identity_id uuid,club_code text,season_key text,license_status text); grant select on player_identities,player_aliases,committee_clubs,committee_licensed_players to service_role;');
await db.exec("insert into committee_clubs values('TEST','Club Démonstration')");
const results=[];
for(let i=0;i<4;i++){
 const id=randomUUID(),name=['Alice Exemple','Bruno Exemple','Camille Exemple','David Exemple'][i];
 await db.query("insert into player_identities values($1,$2,'ACTIVE')",[id,name]);
 await db.query("insert into player_aliases values($1,$2,true)",[id,name]);
 await db.query("insert into committee_licensed_players values($1,'TEST','2026-2027','ACTIVE')",[id]);
 results.push({source_ref:`${i<2?'a':'b'}:${i%2+1}`,identity_id:id,player_name:name,source_name:i<2?'Alice / Bruno':'Camille / David',club:'Club Démonstration',gender:i%2?'M':'F',placement:i<2?'WINNER':'RUNNER_UP',eligibility:'ELIGIBLE',reason:'',points:i<2?10:8,duo_id:i<2?'a':'b'});
}
const metadata={title:'Open Club Double · Démonstration',event_date:'2026-09-13',kind:'CLUB_DOUBLE',category:'E',organizer:'Club Démonstration',season_key:'2026-2027',source_url:'https://n01darts.com/n01/tournament/comp.php?id=t_preview'};
const source={sourceId:'t_preview',sourceUrl:metadata.source_url,format:'SINGLE_ELIMINATION',collectedAt:'2026-09-14T08:00:00Z',summary:{matches:1,completeMatches:1},blockingReasons:[],participants:[{sourceId:'a',name:'Alice / Bruno',matchesPlayed:1,matchesWon:1,average3Darts:52.4},{sourceId:'b',name:'Camille / David',matchesPlayed:1,matchesWon:0,average3Darts:49.1}],matches:[{id:'match-1',stage_label:'Finale',stage_code:'ko_1',home:'Alice / Bruno',away:'Camille / David',home_score:3,away_score:1,winner:'Alice / Bruno',result_complete:true}]};
const snapshot={metadata,results,source,ruleset:'committee-2026-2027-v1-double-10-8-6-4-2',blockers:[],point_scale:[10,8,6,4,2],summary:{players:4,points:36},recognition:{declared_on:'2026-08-20',received_at:'2026-09-14T10:00:00+04:00',ended_at:'2026-09-13T18:00:00+04:00',logo_confirmed:true,format_confirmed:true,eligibility_confirmed:true,classification_confirmed:true,evidence:'Affiche et accusé de réception fictifs pour la démonstration.',classification_basis:'Classement de la finale fictive vérifié : 3–1.'}};
await db.exec('set role service_role');
const cmd=async(action,expected,payload)=>(await db.query('select ranking_workflow_command($1,$2,$3,$4,$5,$6::jsonb) as result',[ids.admin,'demo-double',expected,randomUUID(),action,JSON.stringify(payload)])).rows[0].result;
const draft=await cmd('CREATE',null,{source_id:'t_preview',discipline:'DOUBLE',season_key:'2026-2027',snapshot,director_id:ids.director});
await cmd('SAVE',draft.revision_id,{snapshot,director_id:ids.director,reason:'Préparation de la démonstration'});
const exp=Math.floor(Date.now()/1000)+86400;
const tokens={};
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
for(const [role,id] of Object.entries(ids))tokens[role]=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:id,aud:'authenticated',role:'authenticated',exp,session_id:randomUUID()})}.test-fixture-signature`;
const user=role=>({id:ids[role],aud:'authenticated',role:'authenticated',email:`${role}@example.invalid`,email_confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-01-01T00:00:00Z',identities:[]});
const allowedTables=new Set(['profiles','ranking_workflow_events','ranking_workflow_revisions','ranking_workflow_config','ranking_workflow_decisions','ranking_workflow_audit','ranking_workflow_jobs','ranking_notification_outbox','player_identities','player_aliases','committee_clubs','committee_licensed_players']);
const ident=s=>{if(!/^[a-z_][a-z_0-9]*$/.test(s))throw new Error('Invalid identifier');return '"'+s+'"'};
const server=createServer(async(req,res)=>{
 const send=(code,data,headers={})=>{res.writeHead(code,{'Content-Type':'application/json','Access-Control-Allow-Origin':'http://127.0.0.1:3008','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS',...headers});res.end(JSON.stringify(data));};
 if(req.method==='OPTIONS')return send(200,{});
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2e6)return send(413,{});}
 let body;try{body=raw?JSON.parse(raw):{};}catch{return send(400,{})}
 const url=new URL(req.url,'http://localhost'), token=(req.headers.authorization||'').replace(/^Bearer /,'');
 const role=Object.keys(tokens).find(r=>tokens[r]===token), service=req.headers.apikey==='test-service-role-key';
 try{
  if(url.pathname==='/auth/v1/token'){
   const r=String(body.email||'').split('@')[0];
   if(!ids[r]||body.password!=='preview-only')return send(400,{msg:'Identifiants fictifs invalides'});
   return send(200,{access_token:tokens[r],token_type:'bearer',expires_in:86400,expires_at:exp,refresh_token:'fixture-'+r,user:user(r)});
  }
  if(url.pathname==='/auth/v1/user')return role?send(200,user(role)):send(401,{msg:'Invalid test token'});
  if(url.pathname==='/auth/v1/logout')return send(200,{});
  if(url.pathname.startsWith('/rest/v1/rpc/')){
   if(!service)return send(403,{message:'Denied'});
   const name=url.pathname.split('/').at(-1);
   if(!['ranking_workflow_command','ranking_published_snapshot','ranking_claim_work'].includes(name))return send(404,{});
   const entries=Object.entries(body);const sql=`select ${ident(name)}(${entries.map(([key],i)=>ident(key)+' => $'+(i+1)).join(',')}) as data`;
   const values=entries.map(([,v])=>v!==null&&typeof v==='object'?JSON.stringify(v):v);
   return send(200,(await db.query(sql,values)).rows[0].data);
  }
  const table=url.pathname.split('/').at(-1);
  if(!allowedTables.has(table)||(!service&&!(table==='profiles'&&role&&req.method==='GET')))return send(403,{message:'Denied'});
  const values=[],conditions=[];
  for(const [key,value] of url.searchParams){
   if(['select','order','limit','offset'].includes(key))continue;
   if(value.startsWith('eq.')){values.push(['confirmed','singleton'].includes(key)?value.slice(3).toLowerCase()==='true':value.slice(3));conditions.push(`${ident(key)}=$${values.length}`);}
   else if(value.startsWith('in.(')){const list=value.slice(4,-1).split(',').map(s=>s.replace(/^"|"$/g,''));const args=list.map(v=>{values.push(v);return '$'+values.length});conditions.push(`${ident(key)} in (${args.join(',')})`);}
   else throw new Error('Unsupported fixture filter');
  }
  if(!service){values.push(ids[role]);conditions.push(`user_id=$${values.length}`);}
  const where=conditions.length?' where '+conditions.join(' and '):'';
  if(req.method==='GET'){
   const select=url.searchParams.get('select')||'*';
   const columns=select==='*'?'*':select.split(',').map(ident).join(',');
   const order=url.searchParams.get('order');const ordering=order?' order by '+order.split(',').map(s=>{const [col,dir]=s.split('.');return ident(col)+(dir==='desc'?' desc':' asc')}).join(','):'';
   const limit=Math.min(10000,Math.max(0,Number(url.searchParams.get('limit')||1000))),offset=Math.max(0,Number(url.searchParams.get('offset')||0));
   const data=(await db.query(`select ${columns} from ${ident(table)}${where}${ordering} limit ${limit} offset ${offset}`,values)).rows;
   if(req.headers.accept?.includes('vnd.pgrst.object'))return data.length===1?send(200,data[0]):send(406,{code:'PGRST116',message:'Object expected'});
   return send(200,data,{'Content-Range':`0-${Math.max(0,data.length-1)}/*`});
  }
  if(req.method==='PATCH'&&service){const assignments=Object.entries(body).map(([k,v])=>{values.push(v);return ident(k)+'=$'+values.length});const data=(await db.query(`update ${ident(table)} set ${assignments.join(',')}${where} returning *`,values)).rows;return send(200,data);}
  return send(405,{});
 }catch(e){return send(400,{message:e.message,code:e.code||'FIXTURE_ERROR',details:null,hint:null});}
});
server.listen(55321,'127.0.0.1',()=>console.log('Isolated test fixture listening on 127.0.0.1:55321; fictitious users only.'));
