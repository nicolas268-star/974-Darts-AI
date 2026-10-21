import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const db = new PGlite();
const read = p => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const admin = '00000000-0000-0000-0000-000000000001';
const ds = '00000000-0000-0000-0000-000000000002';
const player = '00000000-0000-0000-0000-000000000003';
const otherDS = '00000000-0000-0000-0000-000000000004';
const migration = '20261015172851_optional_ds_review.sql';
const unrelated = ['20260930121932_fix_x01_creation_returning.sql','20260930180153_interclub_evening_schedule.sql','20261014201802_interclub_j2_result_correction.sql','20261015052702_interclub_j2_statistics_attribution.sql','20261015103031_scoring_120_139.sql','20261021133209_admin_player_registration.sql'];
let checks = 0;
const same = (a,b,message) => { assert.deepEqual(a,b,message); checks++; };
const denied = async (fn,error) => { await assert.rejects(fn,error); checks++; };
const query = async (sql,args=[]) => (await db.query(sql,args)).rows;
const command = async (event,expected,action,payload={},actor=admin,key=randomUUID()) =>
  (await query('select ranking_workflow_command($1,$2,$3,$4,$5,$6::jsonb) as value',[actor,event,expected,key,action,JSON.stringify(payload)]))[0].value;
const snapshot = {
  metadata: {title:'Test relecture DS', event_date:'2026-10-14',kind:'COMMITTEE_OPEN',category:'D',season_key:'2026-2027',organizer:'Comité'},
  results: [{identity_id:randomUUID(), player_name:'Test', points:30}], blockers:[]
};
const create = async (id, snap=snapshot, director_id=null) => {
  const draft = await command(id,null,'CREATE',{source_id:id,discipline:'SINGLE',season_key:'2026-2027',snapshot:snap,director_id});
  return command(id,draft.revision_id,'SAVE',{reason:'Résultats contrôlés',snapshot:snap,director_id});
};
const published = async () => (await query("select ranking_published_snapshot('2026-2027') as value"))[0].value;
const state = async (id) => (await query('select * from ranking_workflow_revisions where id=$1',[id]))[0];
const count = async (table) => (await query('select count(*) as n from '+table))[0].n;
try {
  await db.exec(read('tests/workflow/bootstrap.sql'));
  await db.exec(read('supabase/release_migrations/MIGRATION_SUPABASE_V21_0_19_COMMITTEE_RANKING.sql'));
  await db.exec('alter table committee_ranking_results add column identity_id uuid');
  for (const file of readdirSync(new URL('../../supabase/migrations/',import.meta.url)).sort()) {
    if (!unrelated.includes(file) && file !== migration) await db.exec(read('supabase/migrations/'+file));
  }
  await query("update profiles set role='SPORTS_DIRECTOR' where user_id in ($1,$2)",[ds,otherDS]);
  await db.exec('set role service_role');
  const pending = await create('legacy-pending',snapshot,ds);
  await command('legacy-pending',pending.revision_id,'SUBMIT',{confirmed:true});
  const refused = await create('legacy-correction',snapshot,ds);
  await command('legacy-correction',refused.revision_id,'SUBMIT',{confirmed:true});
  await command('legacy-correction',refused.revision_id,'REQUEST_CORRECTION',{reason:'Finale contestée'},ds);
  const reviewed = await create('legacy-reviewed',snapshot,ds);
  await command('legacy-reviewed',reviewed.revision_id,'SUBMIT',{confirmed:true});
  await command('legacy-reviewed',reviewed.revision_id,'APPROVE_DS',{confirmed:true},ds);
  const tables = ['ranking_workflow_events','ranking_workflow_revisions','ranking_workflow_decisions','ranking_workflow_audit','ranking_workflow_jobs','ranking_notification_outbox','ranking_workflow_config'];
  const dump = async () => Promise.all(tables.map(t => query('select to_jsonb(t) as row from '+t+' t order by to_jsonb(t)::text')));
  const before = await dump();
  await db.exec('reset role');
  await db.exec(read('supabase/migrations/'+migration));
  await db.exec('set role service_role');
  same(await dump(),before,'Upgrade preserves all rows, signatures, queues and public pointers');
  await db.exec(read('supabase/operations/inventory_optional_ds_review.sql'));
  same(await dump(),before,'Inventory is read-only and valid on pending/corrected/reviewed data');
  same(await published(),{events:[]},'Upgrade publishes no legacy backlog');
  await denied(()=>command('legacy-correction',refused.revision_id,'APPROVE_ADMIN',{confirmed:true}),/INVALID_TRANSITION/);
  await denied(()=>command('legacy-correction',refused.revision_id,'PUBLISH',{confirmed:true}),/INVALID_TRANSITION/);
  // Explicit per-event resumption: an unreviewed legacy item needs both Admin actions.
  await command('legacy-pending',pending.revision_id,'APPROVE_ADMIN',{confirmed:true});
  same(await published(),{events:[]},'Admin approval alone remains private');
  await command('legacy-pending',pending.revision_id,'PUBLISH',{confirmed:true});
  const fresh = await create('no-director');
  await denied(()=>command('no-director',fresh.revision_id,'PUBLISH',{confirmed:true}),/INVALID_TRANSITION/);
  await denied(()=>command('no-director',fresh.revision_id,'APPROVE_ADMIN',{}),/CONFIRMATION_REQUIRED/);
  await command('no-director',fresh.revision_id,'APPROVE_ADMIN',{confirmed:true});
  await command('no-director',fresh.revision_id,'PUBLISH',{confirmed:true});
  same((await state(fresh.revision_id)).status,'PUBLISHED','Conforming data publishes with no director assignment or decision');
  same(await query("select * from ranking_workflow_decisions where revision_id=$1 and action='APPROVE_DS'",[fresh.revision_id]),[],'Publication never fabricates a DS review');
  // A real Admin signature is still required even if status was tampered with.
  const forged = await create('forged-admin');
  await query("update ranking_workflow_revisions set status='READY_TO_PUBLISH' where id=$1",[forged.revision_id]);
  await denied(()=>command('forged-admin',forged.revision_id,'PUBLISH',{confirmed:true}),/ADMIN_APPROVAL_REQUIRED/);
  for (const [name,snap,error] of [
    ['incomplete',{...snapshot,blockers:['Rencontre non terminée']},/BLOCKING_ANOMALIES/],
    ['empty',{...snapshot,results:[]},/BLOCKING_ANOMALIES/],
    ['unmapped',{...snapshot,results:[{points:30}]},/IDENTITY_REQUIRED/],
    ['duplicate',{...snapshot,results:[snapshot.results[0],snapshot.results[0]]},/DUPLICATE_IDENTITY/]
  ]) {
    const r = await create(name,snap);
    await denied(()=>command(name,r.revision_id,'APPROVE_ADMIN',{confirmed:true}),error);
  }
  await denied(()=>command('legacy-pending',pending.revision_id,'APPROVE_DS',{confirmed:true},player),/FORBIDDEN/);
  await denied(()=>command('legacy-pending',pending.revision_id,'APPROVE_DS',{confirmed:true},otherDS),/FORBIDDEN/);
  await denied(()=>command('legacy-pending',pending.revision_id,'APPROVE_DS',{confirmed:true}),/SEPARATE_DIRECTOR_REQUIRED/);
  await denied(()=>command('legacy-pending',pending.revision_id,'PUBLISH',{confirmed:true},ds),/FORBIDDEN/);
  const publicBefore = await published();
  const revisionBefore = await state(pending.revision_id);
  const mailBefore = await count('ranking_notification_outbox');
  const jobsBefore = await count('ranking_workflow_jobs');
  const key = randomUUID();
  const late = await command('legacy-pending',pending.revision_id,'APPROVE_DS',{confirmed:true},ds,key);
  same(await command('legacy-pending',pending.revision_id,'APPROVE_DS',{confirmed:true},ds,key),late,'Same key replays late review');
  await command('legacy-pending',pending.revision_id,'APPROVE_DS',{confirmed:true},ds);
  same(await published(),publicBefore,'Late and repeated reviews never change public content');
  same(await state(pending.revision_id),revisionBefore,'Late review preserves revision status, author, timestamps and fingerprint');
  same(await count('ranking_notification_outbox'),mailBefore,'No late or duplicate review emails');
  same(await count('ranking_workflow_jobs'),jobsBefore,'No analysis or publication job created');
  const decisions = await query("select * from ranking_workflow_decisions where revision_id=$1 and action='APPROVE_DS'",[pending.revision_id]);
  same(decisions.length,1,'One real DS decision despite different retry keys');
  same(decisions[0].actor_id,ds,'Real reviewer identity retained');
  assert.ok(decisions[0].created_at); checks++;
  // Review after Admin approval must not remove the approval or require another one.
  const ready = await create('late-ready',snapshot,ds);
  await command('late-ready',ready.revision_id,'APPROVE_ADMIN',{confirmed:true});
  await command('late-ready',ready.revision_id,'APPROVE_DS',{confirmed:true},ds);
  same((await state(ready.revision_id)).status,'READY_TO_PUBLISH','Late review preserves final Admin approval');
  await command('late-ready',ready.revision_id,'PUBLISH',{confirmed:true});
  // A later explicit correction blocks future transitions and keeps the public snapshot.
  await command('legacy-pending',pending.revision_id,'REQUEST_CORRECTION',{reason:'Classement contesté'},ds);
  await denied(()=>command('legacy-pending',pending.revision_id,'APPROVE_ADMIN',{confirmed:true}),/INVALID_TRANSITION/);
  await denied(()=>command('legacy-pending',pending.revision_id,'PUBLISH',{confirmed:true}),/INVALID_TRANSITION/);
  const replacement = await command('legacy-pending',pending.revision_id,'SAVE',{reason:'Correction vérifiée',snapshot:{...snapshot,results:[{...snapshot.results[0],points:24}]},director_id:ds});
  same(await query("select * from ranking_workflow_decisions where revision_id=$1 and action='APPROVE_DS'",[replacement.revision_id]),[],'New revision never inherits an old signature');
  same((await published()).events.find(e=>e.id==='legacy-pending').results[0].points,30,'Old public version retained until replacement');
  await denied(()=>command('legacy-pending',pending.revision_id,'APPROVE_DS',{confirmed:true},ds),/STALE_REVISION/);
  await command('legacy-pending',replacement.revision_id,'APPROVE_ADMIN',{confirmed:true});
  await command('legacy-pending',replacement.revision_id,'PUBLISH',{confirmed:true});
  same((await published()).events.filter(e=>e.id==='legacy-pending').map(e=>e.results[0].points),[24],'Replacement contributes once');
  for (const role of ['anon','authenticated']) {
    await db.exec('reset role; set role '+role);
    await denied(()=>command('legacy-pending',replacement.revision_id,'APPROVE_DS',{confirmed:true},ds),/permission denied/);
  }
  // Rollback restores the old gate while leaving every row/public snapshot intact.
  await db.exec('reset role; set role service_role');
  const rollbackBefore = await dump();
  await db.exec('reset role');
  await db.exec(read('supabase/operations/rollback_optional_ds_review.sql'));
  await db.exec('set role service_role');
  same(await dump(),rollbackBefore,'Rollback preserves every existing row');
  const rollbackEvent = await create('rollback-gate');
  await denied(()=>command('rollback-gate',rollbackEvent.revision_id,'APPROVE_ADMIN',{confirmed:true}),/INVALID_TRANSITION/);
  console.log(`PASS: ${checks} optional DS, upgrade, stock, permissions, late review and rollback checks`);
} finally { await db.close(); }
