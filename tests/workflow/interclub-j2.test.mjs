import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(resolve(root,p),'utf8');
const load=(module,flag=module==='tests.test_interclub_j2_correction'?'--fixture-result-only':'--fixture')=>{
 const fixture=JSON.parse(execFileSync('python3',['-m',module,flag],{cwd:resolve(root,'app/backend'),encoding:'utf8'}));
 // This suite replays the historical publisher before the scoring-range
 // migration. Its stored audit must retain the original payload shape.
 for(const payload of [fixture.payload,fixture.payload.source_snapshot].filter(Boolean))
  for(const row of payload.stats) delete row.scores_120_139;
 return fixture;
};
const fixture=load('tests.test_interclub_j2_correction'), p=fixture.payload;
const db=new PGlite();
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const publish=async(payload=p)=>(await q('select publish_interclub_match($1::jsonb) data',[JSON.stringify(payload)]))[0].data;
const count=async()=>(await q(`select (select count(*) from matches) matches,(select count(*) from legs) legs,
 (select count(*) from player_leg_stats) stats,(select count(*) from championship_results) results,
 (select count(*) from player_team_memberships) memberships,(select count(*) from player_profiles) profiles,
 (select count(*) from imports) imports,(select count(*) from interclub_auto_publications) audits`))[0];
const migration='supabase/migrations/20261014201802_interclub_j2_result_correction.sql';
try {
 await db.exec(read('tests/workflow/interclub-bootstrap.sql'));
 await db.exec(read('supabase/release_migrations/MIGRATION_SUPABASE_V21_0_24_INTERCLUB_AUTOMATIC.sql'));
 await db.exec(read('supabase/migrations/20260930180153_interclub_evening_schedule.sql'));
 await db.exec(read(migration)); await db.exec(read(migration));
 const season=(await q("insert into seasons(name,is_active) values('2026-2027',true) returning id"))[0].id;
 for(const i of fixture.identities) {
  await q('insert into players values($1,$2)',[i.canonical_player_id,i.canonical_display_name]);
  await q('insert into player_identities values($1,$2,$3,$4)',[i.id,i.canonical_player_id,i.canonical_display_name,i.status]);
 }
 for(const l of fixture.licensed) await q(`insert into committee_licensed_players(season_key,identity_id,license_status,club_code,official_display_name,official_source_name)
  values($1,$2,$3,$4,$5,$6)`,[l.season_key,l.identity_id,l.license_status,l.club_code,l.official_display_name,l.official_source_name]);
 const benoit=p.players.find(x=>x.name==='Benoit BRUNET'), christophe=p.players.find(x=>x.name==='Christophe FERNANDEZ');
 const brune=(await q("insert into teams(id,name,official_club_code) values('9b85ca85-4c9a-4bb7-8d73-c92e19ae7de3','3B Darts Club - B(rune)','3BDC') returning id"))[0].id;
 await q("insert into player_team_memberships(identity_id,team_id,season_id,source,is_current) values($1,$2,$3,'NAKKA_IMPORT',false)",[benoit.identity_id,brune,season]);
 const beforeMembership=await q('select * from player_team_memberships where identity_id=$1',[benoit.identity_id]);
 const historical=(await q("insert into seasons(name,is_active) values('2026',false) returning id"))[0].id;
 await q("insert into player_profiles(player_id,season_id,legs_played,legs_won,summary) values($1,$2,77,32,'Historique')",[benoit.id,historical]);
 const history=await q('select * from player_profiles where season_id=$1',[historical]);
 // Publish an unrelated real J1 first; every row must remain byte-for-byte equal.
 await publish(load('tests.test_interclub_publication').payload);
 const oldTables={};
 for(const t of ['championship_results','matches','legs','player_leg_stats','player_profiles','imports','interclub_auto_publications']) oldTables[t]=await q('select to_jsonb(t) data from '+t+' t order by to_jsonb(t)::text');
 const baseline=await count();
 for(const role of ['anon','authenticated']) {
  await db.exec('set role '+role);
  await assert.rejects(()=>publish(),/permission denied/);
  await assert.rejects(()=>q('select validate_interclub_adjustments($1::jsonb)',[JSON.stringify(p)]),/permission denied/);
  await db.exec('reset role');
 }
 await db.exec('set role service_role');
 await assert.rejects(()=>publish(p.source_snapshot),/INTERCLUB_J2_AUDIT_REQUIRED/);
 const tampered=structuredClone(p);tampered.stats[0].score+=1;
 await assert.rejects(()=>publish(tampered),/INTERCLUB_J2_CORRECTION_MISMATCH/);
 const permuted=structuredClone(p);
 for(const s of permuted.stats) if(s.player_id===benoit.id) s.player_id=christophe.id;
 await assert.rejects(()=>publish(permuted),/INTERCLUB_J2_CORRECTION_MISMATCH/);
 const unauthorized=structuredClone(p.source_snapshot);unauthorized.event_id='t_other_1234';
 await assert.rejects(()=>publish(unauthorized),/INVALID_INTERCLUB_PAYLOAD|INTERCLUB_UNAUTHORIZED_ADJUSTMENT/);
 assert.deepEqual(await count(),baseline,'Rejected adjustments leave no partial writes');
 const first=await publish();assert.equal(first.status,'PUBLISHED');
 const result=(await q('select * from championship_results where id=$1',[first.result_id]))[0];
 assert.deepEqual([result.home_score,result.away_score],[5,15]);
 const enc=(await q('select * from encounters where natural_key=$1',[result.natural_key]))[0];
 const match=(await q('select * from matches where encounter_id=$1 and match_number=18',[enc.id]))[0];
 assert.equal(match.mode,'S');assert.equal(match.winner_team_id,result.away_team_id);
 assert.deepEqual(await q('select winner_team_id,count(*) n from legs where match_id=$1 group by winner_team_id',[match.id]),[{winner_team_id:result.away_team_id,n:2}]);
 const aggregate=await q('select winner_team_id,count(*) n from matches where encounter_id=$1 group by winner_team_id order by n',[enc.id]);
 assert.deepEqual(aggregate.map(x=>x.n),[5,15]);
 for(const [player,won] of [[benoit,5],[christophe,9]]) {
  const profile=(await q('select * from player_profiles where player_id=$1 and season_id=$2',[player.id,season]))[0];
  assert.equal(profile.legs_won,won);assert.equal(profile.legs_played,player.leg);
  assert.equal(Number(profile.average_3_darts),Math.round(300*player.score/player.darts)/100);
  assert.equal(Number(profile.first_9),Math.round(300*player.f9Score/player.f9Darts)/100);
 }
 const audit=(await q('select * from interclub_auto_publications where result_id=$1',[first.result_id]))[0];
 assert.deepEqual(audit.payload,p);assert.deepEqual(audit.payload.source_snapshot.score,[6,14]);
 assert.ok(audit.published_at);assert.equal(audit.payload.result_corrections.length,1);
 assert.deepEqual(await q('select * from player_team_memberships where identity_id=$1',[benoit.identity_id]),beforeMembership);
 const participation=await q(`select distinct st.team_id from player_leg_stats st join legs l on l.id=st.leg_id join matches m on m.id=l.match_id
  where m.encounter_id=$1 and st.player_id=$2`,[enc.id,benoit.id]);
 assert.deepEqual(participation,[{team_id:result.home_team_id}]);
 assert.equal((await q('select count(*) n from players'))[0].n,fixture.identities.length);
 assert.equal((await q('select count(*) n from player_leg_stats group by leg_id,player_id having count(*)>1')).length,0);
 const after=await count();
 const nextFixture=load('tests.test_interclub_j2_correction'); // A fresh import from the erroneous raw Nakka fixture.
 assert.equal((await publish(nextFixture.payload)).status,'UNCHANGED');assert.deepEqual(await count(),after);
 assert.deepEqual(await q('select * from player_profiles where season_id=$1',[historical]),history);
 for(const [table,rows] of Object.entries(oldTables)) {
  const current=await q('select to_jsonb(t) data from '+table+' t');
  for(const row of rows) assert.ok(current.some(x=>JSON.stringify(x)===JSON.stringify(row)),table+' changed an unrelated row');
 }
 const tables={};
 for(const t of ['players','teams','seasons','rounds','encounters','matches','legs','player_leg_stats','player_profiles','player_identities','championship_results','interclub_auto_publications']) tables[t]=(await q('select to_jsonb(t) data from '+t+' t')).map(r=>r.data);
 console.log(execFileSync('python3',['-m','tests.test_interclub_j2_correction','--read-paths'],{cwd:resolve(root,'app/backend'),encoding:'utf8',input:JSON.stringify(tables)}).trim());
 // Execute the real frontend MVP formula on the unchanged scoring and changed
 // result inputs; no copy of the Wilson/weighting formula is introduced here.
 const mvpPlayer=x=>({player_id:x.id,name:x.name,legs_played:x.leg,legs_won:x.winLeg,
  average_3_darts:3*x.score/x.darts,first_9:3*x.f9Score/x.f9Darts,best_finish:x.highOut,
  scores_100:x.ton00,scores_140:x.ton40,scores_180:x.ton80});
 const formulaUrl=pathToFileURL(resolve(root,'app/frontend/lib/records/mvp.ts')).href;
 const mvpScript=`import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
  import {buildMvpPlayers} from ${JSON.stringify(formulaUrl)};
  const data=JSON.parse(readFileSync(0,'utf8'));
  const before=buildMvpPlayers(data.before,1),after=buildMvpPlayers(data.after,1);
  for(const pid of data.ids){const a=before.find(x=>x.player_id===pid),b=after.find(x=>x.player_id===pid);
   for(const field of ['scoringIndex','impactIndex','finishIndex']) assert.equal(a[field],b[field]);
   assert.notEqual(a.resultsIndex,b.resultsIndex);
   if(pid===data.ids[0]) assert.ok(b.resultsIndex<a.resultsIndex);else assert.ok(b.resultsIndex>a.resultsIndex);
  }
  console.log('PASS J2 MVP: real formula updates result component only; scoring, impact and finish components preserved');`;
 console.log(execFileSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',mvpScript],{
  encoding:'utf8',input:JSON.stringify({before:p.source_snapshot.players.map(mvpPlayer),after:p.players.map(mvpPlayer),ids:[benoit.id,christophe.id]})}).trim());
 console.log('PASS J2: 0–2, aggregation 5–15, source audit, Brune affiliation, guest participation, permissions, idempotence, reimport, unchanged J1 and season history');
 await db.exec('reset role');
 await db.exec(read('supabase/operations/verify_j2_fournaise_ambree.sql'));
 await db.exec(read('supabase/operations/rollback_j2_fournaise_ambree.sql'));
 assert.equal((await q("select count(*) n from championship_results where natural_key='2026-2027|J2|nakka:t_uAfU_5679'"))[0].n,0);
 assert.equal((await q("select count(*) n from interclub_auto_publications where source_event_id='t_uAfU_5679'"))[0].n,0);
 assert.deepEqual(await q('select * from player_team_memberships where identity_id=$1',[benoit.identity_id]),beforeMembership);
 assert.deepEqual(await q('select * from player_profiles where season_id=$1',[historical]),history);
 for(const [table,rows] of Object.entries(oldTables)) {
  const current=await q('select to_jsonb(t) data from '+table+' t');
  for(const row of rows) assert.ok(current.some(x=>JSON.stringify(x)===JSON.stringify(row)),table+' rollback changed an unrelated row');
 }
 assert.equal((await publish()).status,'PUBLISHED');
 assert.equal((await publish()).status,'UNCHANGED');
 console.log('PASS J2 rollback: only this publication removed, remaining profiles recomputed, Brune/history/J1 preserved, corrected reapplication idempotent');
 // A second, later organiser confirmation identifies the actual throwing streams.
 const statsMigration='supabase/migrations/20261015052702_interclub_j2_statistics_attribution.sql';
 const latest=load('tests.test_interclub_j2_correction','--fixture').payload;
 // Validate both the original publisher and the Brune compatibility variant
 // actually installed in production; their audit SELECTs are different.
 const originalDb=new PGlite();
 try {
  await originalDb.exec(read('tests/workflow/interclub-bootstrap.sql'));
  await originalDb.exec(read('supabase/release_migrations/MIGRATION_SUPABASE_V21_0_24_INTERCLUB_AUTOMATIC.sql'));
  await originalDb.exec(read(migration));
  await originalDb.exec(read(statsMigration));
  assert.deepEqual((await originalDb.query('select interclub_j2_statistics_payload($1::jsonb) p',[JSON.stringify(p)])).rows[0].p,latest);
 } finally {await originalDb.close();}
 await db.exec(read('supabase/release_migrations/MIGRATION_SUPABASE_V21_0_25_TEAM_BRUNE.sql'));
 await db.exec(read(statsMigration)); await db.exec(read(statsMigration));
 const untouched=await count();
 const beforeStats=await q('select to_jsonb(st) data from player_leg_stats st order by st.id');
 const beforeResults=await q('select to_jsonb(r) data from championship_results r order by r.id');
 const beforeProfiles=await q('select to_jsonb(pf) data from player_profiles pf order by pf.id');
 assert.deepEqual((await q('select interclub_j2_statistics_payload($1::jsonb) p',[JSON.stringify(p)]))[0].p,latest,'SQL and Python derive the same correction');
 for(const role of ['anon','authenticated']) {
  await db.exec('set role '+role);
  await assert.rejects(()=>q('select correct_interclub_j2_statistics()'),/permission denied/);
  await db.exec('reset role');
 }
 await db.exec(`create function fail_statistics_audit() returns trigger language plpgsql as $$ begin raise exception 'TEST_STATISTICS_LATE_FAILURE'; end $$;
  create trigger fail_statistics_audit before update on imports for each row execute function fail_statistics_audit(); set role service_role;`);
 await assert.rejects(()=>q('select correct_interclub_j2_statistics()'),/TEST_STATISTICS_LATE_FAILURE/);
 assert.deepEqual(await q('select to_jsonb(st) data from player_leg_stats st order by st.id'),beforeStats,'Late audit failure rolls back all four rows');
 assert.deepEqual(await q('select to_jsonb(pf) data from player_profiles pf order by pf.id'),beforeProfiles,'Late failure also rolls back cumulative profiles');
 await db.exec('reset role; drop trigger fail_statistics_audit on imports; set role service_role');
 const correction=(await q('select correct_interclub_j2_statistics() data'))[0].data;
 assert.equal(correction.status,'CORRECTED');assert.equal(correction.statistics_updated,4);
 assert.deepEqual(await count(),untouched,'No insertion, deletion, duplication or result change');
 assert.deepEqual(await q('select to_jsonb(r) data from championship_results r order by r.id'),beforeResults);
 const afterStats=await q('select to_jsonb(st) data from player_leg_stats st order by st.id');
 assert.equal(afterStats.filter((r,i)=>JSON.stringify(r)!==JSON.stringify(beforeStats[i])).length,4);
 const correctedAudit=(await q("select payload from interclub_auto_publications where source_event_id='t_uAfU_5679'"))[0].payload;
 assert.deepEqual(correctedAudit,latest);
 const correctedState=await q('select to_jsonb(st) data from player_leg_stats st order by st.id');
 assert.equal((await q('select correct_interclub_j2_statistics() data'))[0].data.status,'UNCHANGED');
 assert.deepEqual(await q('select to_jsonb(st) data from player_leg_stats st order by st.id'),correctedState);
 assert.equal((await publish(p)).status,'UNCHANGED','An older result-only worker cannot undo the statistics correction');
 assert.equal((await publish(latest)).status,'UNCHANGED','A fresh corrected import is idempotent');
 assert.deepEqual(await q('select * from player_team_memberships where identity_id=$1',[benoit.identity_id]),beforeMembership);
 assert.deepEqual(await q('select * from player_profiles where season_id=$1',[historical]),history);
 const badStats=structuredClone(latest);badStats.statistics_corrections[0].confirmed_finishes[0].finish=60;
 await assert.rejects(()=>publish(badStats),/INTERCLUB_J2_STATISTICS_CORRECTION_MISMATCH/);
 const imports=(await q("select i.analysis_json from imports i join encounters e on e.import_id=i.id where e.natural_key='2026-2027|J2|nakka:t_uAfU_5679'"))[0].analysis_json;
 assert.deepEqual(imports.source_snapshot,p.source_snapshot);
 assert.equal(imports.local_statistics_corrections.length,1);
 assert.equal(imports.local_statistics_corrections[0].previous_statistics.length,4);
 for(const t of Object.keys(tables)) tables[t]=(await q('select to_jsonb(t) data from '+t+' t')).map(r=>r.data);
 console.log(execFileSync('python3',['-m','tests.test_interclub_j2_correction','--read-paths-statistics'],{cwd:resolve(root,'app/backend'),encoding:'utf8',input:JSON.stringify(tables)}).trim());
 console.log('PASS J2 statistics: Christophe 40/1 and 6/1, four rows only, cumulative profiles, unchanged 15–5/results/identities/Brune, audit, legacy/fresh reimport and late rollback');
 const statisticsMvpScript=`import assert from 'node:assert/strict'; import {readFileSync} from 'node:fs';
  import {buildMvpPlayers} from ${JSON.stringify(formulaUrl)};
  const data=JSON.parse(readFileSync(0,'utf8'));
  const before=buildMvpPlayers(data.before,1),after=buildMvpPlayers(data.after,1);
  for(const a of before){const b=after.find(x=>x.player_id===a.player_id);
   for(const field of ['resultsIndex','impactIndex','finishIndex']) assert.equal(a[field],b[field]);
   if(!data.ids.includes(a.player_id)) assert.deepEqual(a,b);
   else if(a.player_id===data.ids[0]) assert.ok(b.scoringIndex<a.scoringIndex);else assert.ok(b.scoringIndex>a.scoringIndex);
  } console.log('PASS statistics MVP: scoring follows corrected averages/First 9; results, finishes, volume and other players stay unchanged');`;
 console.log(execFileSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',statisticsMvpScript],{
  encoding:'utf8',input:JSON.stringify({before:p.players.map(mvpPlayer),after:latest.players.map(mvpPlayer),ids:[benoit.id,christophe.id]})}).trim());
 await db.exec('reset role');
 await db.exec(read('supabase/operations/rollback_j2_statistics_attribution.sql'));
 assert.deepEqual(await q('select to_jsonb(st) data from player_leg_stats st order by st.id'),beforeStats,'Statistics rollback restores exact previous rows');
 assert.deepEqual(await q('select to_jsonb(r) data from championship_results r order by r.id'),beforeResults,'15–5 remains corrected during statistics rollback');
 assert.equal((await q('select correct_interclub_j2_statistics() data'))[0].data.status,'CORRECTED');
 assert.equal((await q('select correct_interclub_j2_statistics() data'))[0].data.status,'UNCHANGED');
 assert.deepEqual(await count(),untouched);
 console.log('PASS statistics-only rollback and reapplication: source audit retained, exact old rows restored, 15–5/identities/other results preserved');
} catch(error) {
 console.error('FAIL J2:',error.message,error.where || '',error.position ? 'position '+error.position : '');
 process.exitCode=1;
} finally { await db.close(); }
