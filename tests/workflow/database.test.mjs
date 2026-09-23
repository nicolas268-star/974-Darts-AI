import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const db=new PGlite();
const admin='00000000-0000-0000-0000-000000000001', ds='00000000-0000-0000-0000-000000000002', player='00000000-0000-0000-0000-000000000003', otherDS='00000000-0000-0000-0000-000000000004';
let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const query=async(sql,args=[])=> (await db.query(sql,args)).rows;
const expectError=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++;};
async function command(event,expected,action,payload={},actor=admin,key=randomUUID()) {
 return (await query('select ranking_workflow_command($1,$2,$3,$4,$5,$6::jsonb) as result',[actor,event,expected,key,action,JSON.stringify(payload)]))[0].result;
}
const meta={title:'Open de test',event_date:'2026-09-13',kind:'COMMITTEE_OPEN',category:'D',season_key:'2026-2027',organizer:'Comité',source_url:'https://n01darts.com/n01/tournament/comp.php?id=t_fixture'};
const snapshot={metadata:meta,results:[{source_ref:'a:1',identity_id:randomUUID(),player_name:'Alice Test',club:'Club test',gender:'F',points:30,placement:'WINNER'},{source_ref:'b:1',identity_id:randomUUID(),player_name:'Bruno Test',club:'Club test',gender:'M',points:24,placement:'RUNNER_UP'}],blockers:[]};
const pub=async(season='2026-2027')=>(await query('select ranking_published_snapshot($1) as data',[season]))[0].data;
const rev=async(id)=>(await query('select * from ranking_workflow_revisions where id=$1',[id]))[0];
try {
 await db.exec(read('tests/workflow/bootstrap.sql'));
 await db.exec(read('supabase/release_migrations/MIGRATION_SUPABASE_V21_0_19_COMMITTEE_RANKING.sql'));
 await db.exec('alter table committee_ranking_results add column identity_id uuid');
 await db.exec(`insert into committee_ranking_events(id,tournament_code,season_key,title,event_date,ranking_category,ranking_kind,source_url,status,published_by,published_at) values ('club-open-kaz-2026-09-13','T5','2026-2027','Historique T5','2026-09-13','E','CLUB_SINGLE','https://n01darts.com/n01/tournament/comp.php?id=t_historical','PUBLISHED','${admin}','2026-09-15T10:57:00Z')`);
 for (const [i,points] of [10,8,6,6,4,4,4,4,2,2,0,0,0,0,0,0].entries()) await query("insert into committee_ranking_results(event_id,player_name,club,gender,placement,points,display_order,identity_id) values('club-open-kaz-2026-09-13',$1,'Kaz A Darts 974','M','ROUND_OF_16',$2,$3,$4)",['Historique '+i,points,i+1,i<13?randomUUID():null]);
 await db.exec("insert into player_identities select identity_id,'Nom officiel historique','ACTIVE' from committee_ranking_results where display_order=1");
 for(const file of readdirSync(resolve(root,'supabase/migrations')).sort()) await db.exec(read('supabase/migrations/'+file));
 await query("update profiles set role='SPORTS_DIRECTOR' where user_id in ($1,$2)",[ds,otherDS]);
 const initial=await pub();
 check(initial.events[0].results.length===16 && initial.events[0].results.reduce((a,b)=>a+b.points,0)===50,'Historical 16 rows / 50 points preserved');
 check(initial.events[0].results[0].player_name==='Nom officiel historique','Previously displayed canonical name preserved');
 check((await query('select count(*) as n from ranking_workflow_decisions'))[0].n===0,'No invented DS decision');
 check((await pub('2027-2028')).events.length===0,'Season isolation');
 for(const role of ['anon','authenticated']) {
  await db.exec('set role '+role);
  await expectError(()=>query('select * from ranking_workflow_revisions'),/permission denied/);
  await expectError(()=>command('x',null,'CREATE'),/permission denied/);
  await expectError(()=>pub(),/permission denied/);
  await expectError(()=>query("update profiles set role='ADMIN' where user_id=$1",[ds]),/permission denied/);
  await db.exec('reset role');
 }
 await db.exec('set role service_role');
 await expectError(()=>command('unauthorized',null,'CREATE',{},player),/FORBIDDEN/);
 let created=await command('event-test',null,'CREATE',{source_id:'t_fixture',discipline:'SINGLE',season_key:'2026-2027',snapshot:{...snapshot,results:[],blockers:['Analyse requise']},director_id:ds});
 let id=created.revision_id;
 await expectError(()=>command('event-test',id,'PUBLISH',{confirmed:true}),/INVALID_TRANSITION/);
 await expectError(()=>command('event-test',id,'SAVE',{reason:'changement',snapshot,director_id:ds},ds),/FORBIDDEN/);
 await expectError(()=>command('event-test',id,'SAVE',{snapshot,director_id:ds}),/REASON_REQUIRED/);
 await expectError(()=>query("update ranking_workflow_revisions set snapshot='{}'::jsonb where id=$1",[id]),/IMMUTABLE_REVISION/);
 let saved=await command('event-test',id,'SAVE',{reason:'Contrôle de la source',snapshot,director_id:ds});
 id=saved.revision_id;
 await expectError(()=>command('event-test',created.revision_id,'SUBMIT',{confirmed:true}),/STALE_REVISION/);
 await expectError(()=>command('event-test',id,'SUBMIT',{}),/CONFIRMATION_REQUIRED/);
 await command('event-test',id,'SUBMIT',{confirmed:true});
 check((await query('select count(*) as n from ranking_notification_outbox'))[0].n===1,'SUBMIT queues exactly one email');
 await expectError(()=>command('event-test',id,'APPROVE_DS',{confirmed:true}),/SEPARATE_DIRECTOR_REQUIRED/);
 await expectError(()=>command('event-test',id,'APPROVE_DS',{confirmed:true},otherDS),/FORBIDDEN/);
 await expectError(()=>command('event-test',id,'REQUEST_CORRECTION',{reason:''},ds),/INVALID_TRANSITION/);
 await command('event-test',id,'REQUEST_CORRECTION',{reason:'Vérifier la finale'},ds);
 const corrected=await command('event-test',id,'SAVE',{reason:'Finale vérifiée',snapshot,director_id:ds});
 id=corrected.revision_id;
 await command('event-test',id,'SUBMIT',{confirmed:true});
 await command('event-test',id,'APPROVE_DS',{confirmed:true,reason:'Résultats contrôlés'},ds);
 await expectError(()=>command('event-test',id,'PUBLISH',{confirmed:true},ds),/FORBIDDEN/);
 await expectError(()=>command('event-test',id,'PUBLISH',{confirmed:true}),/INVALID_TRANSITION/);
 await command('event-test',id,'APPROVE_ADMIN',{confirmed:true});
 // Force failure at the final audit insertion: every earlier write must roll back.
 await db.exec('reset role');
 await db.exec("create function public.test_audit_failure() returns trigger language plpgsql as $$ begin if new.action='PUBLISH' then raise exception 'TEST_STORAGE_FAILURE'; end if; return new; end $$; create trigger test_audit_failure before insert on ranking_workflow_audit for each row execute function test_audit_failure();");
 await db.exec('set role service_role');
 await expectError(()=>command('event-test',id,'PUBLISH',{confirmed:true}),/TEST_STORAGE_FAILURE/);
 check((await pub()).events.length===1 && (await rev(id)).status==='READY_TO_PUBLISH','Publication rollback preserves all public data and state');
 await db.exec('reset role; drop trigger test_audit_failure on ranking_workflow_audit; drop function test_audit_failure(); set role service_role');
 const key=randomUUID();
 const published=await command('event-test',id,'PUBLISH',{confirmed:true},admin,key);
 assert.deepEqual(await command('event-test',id,'PUBLISH',{confirmed:true},admin,key),published);checks++;
 await expectError(()=>command('event-test',id,'PUBLISH',{confirmed:true,reason:'différent'},admin,key),/IDEMPOTENCY_CONFLICT/);
 check((await pub()).events.length===2,'Exactly one public contribution per event');
 // A correction keeps the old public snapshot throughout the new review.
 const snapshot2=structuredClone(snapshot);snapshot2.results[0].points=24;snapshot2.results[1].points=30;
 const v4=await command('event-test',id,'SAVE',{reason:'Correction sportive',snapshot:snapshot2,director_id:ds});
 check((await pub()).events.find(e=>e.id==='event-test').results[0].points===30,'Old publication stays public during correction');
 await expectError(()=>command('event-test',id,'PUBLISH',{confirmed:true}),/STALE_REVISION/);
 await command('event-test',v4.revision_id,'SUBMIT',{confirmed:true});
 await command('event-test',v4.revision_id,'APPROVE_DS',{confirmed:true},ds);
 await command('event-test',v4.revision_id,'APPROVE_ADMIN',{confirmed:true});
 await db.exec('reset role');await query("update profiles set role='PLAYER' where user_id=$1",[ds]);await db.exec('set role service_role');
 await expectError(()=>command('event-test',v4.revision_id,'PUBLISH',{confirmed:true}),/INVALID_DIRECTOR/);
 await db.exec('reset role');await query("update profiles set role='SPORTS_DIRECTOR' where user_id=$1",[ds]);await db.exec('set role service_role');
 await command('event-test',v4.revision_id,'PUBLISH',{confirmed:true});
 const final=await pub();
 check(final.events.length===2 && final.events.find(e=>e.id==='event-test').results[0].points===24,'Replacement never adds duplicate points');
 check(JSON.stringify(final.events[0])===JSON.stringify(initial.events[0]),'Historical snapshot unchanged');
 check(!JSON.stringify(final).includes('reason')&&!JSON.stringify(final).includes('director_id'),'Public projection contains no private audit/identity of staff');
 await expectError(()=>query('delete from ranking_workflow_decisions'),/permission denied/);
 await expectError(()=>query("update ranking_workflow_audit set reason='faux'"),/permission denied/);
 // Global club limit includes previously published contribution during correction.
 for(let n=1;n<=2;n++) {
  const clubSnap={...snapshot,metadata:{...meta,kind:'CLUB_SINGLE',category:'E',organizer:'Kaz A Darts 974'}};
  const c=await command('club-'+n,null,'CREATE',{source_id:'t_club_'+n,discipline:'SINGLE',season_key:'2026-2027',snapshot:clubSnap,director_id:ds});
  const s=await command('club-'+n,c.revision_id,'SAVE',{reason:'Contrôle',snapshot:clubSnap,director_id:ds});
  if(n===1) await command('club-'+n,s.revision_id,'SUBMIT',{confirmed:true});
  else await expectError(()=>command('club-'+n,s.revision_id,'SUBMIT',{confirmed:true}),/CLUB_EVENT_LIMIT/);
 }
 // Job deduplication, lease and atomically sealed analysis result.
 const jobCommand=await command('event-test',v4.revision_id,'IMPORT');
 await expectError(()=>command('event-test',v4.revision_id,'IMPORT'),/duplicate key/);
 const job=(await query("select ranking_claim_work('analysis') as job"))[0].job;
 check(job.id===jobCommand.job_id && job.state==='RUNNING','Durable job claimed');
 await expectError(()=>command('event-test',v4.revision_id,'ANALYZE',{snapshot,director_id:ds,job_id:job.id,lease_id:randomUUID()}),/STALE_JOB/);
 await command('event-test',v4.revision_id,'ANALYZE',{snapshot,director_id:ds,job_id:job.id,lease_id:job.lease_id});
 check((await query('select state from ranking_workflow_jobs where id=$1',[job.id]))[0].state==='SUCCEEDED','Analysis and job completion commit together');
 const mail=(await query("select ranking_claim_work('email') as item"))[0].item;
 check(mail.state==='SENDING' && mail.attempts===1 && !!mail.lease_id,'Outbox lease');
 check((await query("select ranking_claim_work('email') as item"))[0].item.id!==mail.id,'Claimed email not claimed twice');
 console.log(`PASS: ${checks} database integrity, role, revision, rollback and queue checks`);
} catch (e) { console.error("FAILED",e.message, e.detail ?? "",e.where ?? ""); process.exitCode=1; } finally { await db.close(); }
