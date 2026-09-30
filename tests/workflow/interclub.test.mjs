import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(resolve(root,p),'utf8');
const fixture=JSON.parse(execFileSync('python3',['-m','tests.test_interclub_publication','--fixture'],{cwd:resolve(root,'app/backend'),encoding:'utf8'}));
const p=fixture.payload;
const db=new PGlite();
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const publish=async(payload=p)=>(await q('select publish_interclub_match($1::jsonb) as data',[JSON.stringify(payload)]))[0].data;
const reject=async(fn,pattern)=>assert.rejects(fn,pattern);
const counts=async()=>(await q(`select (select count(*) from championship_results) results,(select count(*) from matches) matches,
 (select count(*) from legs) legs,(select count(*) from player_leg_stats) stats,(select count(*) from imports) imports,
 (select count(*) from player_profiles) profiles,(select count(*) from rounds) rounds,(select count(*) from teams) teams`))[0];
try {
 await db.exec(read('tests/workflow/interclub-bootstrap.sql'));
 await db.exec(read('supabase/release_migrations/MIGRATION_SUPABASE_V21_0_24_INTERCLUB_AUTOMATIC.sql'));
 const scheduleMigration=read('supabase/migrations/20260930180153_interclub_evening_schedule.sql');
 await db.exec(scheduleMigration);
 await db.exec(scheduleMigration);
 const definition=(await q("select pg_get_functiondef('public.publish_interclub_match(jsonb)'::regprocedure) definition"))[0].definition;
 assert.ok(definition.includes("time '22:00'"));
 assert.ok(!definition.includes("time '23:50'"));
 const boundaries=await q(`select
  '2026-09-28 17:59:59+00'::timestamptz < (date '2026-09-28' + time '22:00') at time zone 'Indian/Reunion' as too_early,
  '2026-09-28 18:00:00+00'::timestamptz = (date '2026-09-28' + time '22:00') at time zone 'Indian/Reunion' as start`);
 assert.deepEqual(boundaries,[{too_early:true,start:true}]);
 const season=(await q("insert into seasons(name,is_active) values('2026-2027',true) returning id"))[0].id;
 for(const i of fixture.identities) {
   await q('insert into players values($1,$2)',[i.canonical_player_id,i.canonical_display_name]);
   await q('insert into player_identities values($1,$2,$3,$4)',[i.id,i.canonical_player_id,i.canonical_display_name,i.status]);
 }
 for(const l of fixture.licensed) await q(`insert into committee_licensed_players(season_key,identity_id,license_status,club_code,official_display_name,official_source_name)
 values($1,$2,$3,$4,$5,$6)`,[l.season_key,l.identity_id,l.license_status,l.club_code,l.official_display_name,l.official_source_name]);
 const historic=(await q("insert into seasons(name,is_active) values('2026',false) returning id"))[0].id;
 await q("insert into player_profiles(player_id,season_id,legs_played,first_9,summary) values($1,$2,77,51.23,'Historique conservé')",[p.players[0].id,historic]);
 const old=await q('select * from player_profiles where season_id=$1',[historic]);
 for(const role of ['anon','authenticated']) {
   await db.exec('set role '+role);
   await reject(()=>publish(),/permission denied/);
   await reject(()=>q('select * from interclub_auto_publications'),/permission denied/);
   await db.exec('reset role');
 }
 const baseline=await counts();
 await db.exec(`create function fail_commit() returns trigger language plpgsql as $$ begin raise exception 'TEST_LATE_FAILURE'; end $$;
 create trigger fail_commit before insert on interclub_auto_publications for each row execute function fail_commit(); set role service_role;`);
 await reject(()=>publish(),/TEST_LATE_FAILURE/);
 assert.deepEqual(await counts(),baseline,'A failure at the final audit rolls back results, stats, teams and profiles');
 await db.exec('reset role; drop trigger fail_commit on interclub_auto_publications; set role service_role');
 const future=structuredClone(p); future.date='2099-01-01';
 await reject(()=>publish(future),/INTERCLUB_TOO_EARLY/);
 const incomplete=structuredClone(p);incomplete.matches.pop();
 await reject(()=>publish(incomplete),/INVALID_INTERCLUB_PAYLOAD/);
 const wrong=structuredClone(p);wrong.stats[0].score+=1;
 await reject(()=>publish(wrong),/INTERCLUB_PLAYER_TOTALS_CONFLICT/);
 assert.deepEqual(await counts(),baseline,'Invalid details leave no partial result');
 const first=await publish();
 assert.equal(first.status,'PUBLISHED');
 assert.deepEqual(await counts(),{results:1,matches:20,legs:45,stats:108,imports:1,profiles:11,rounds:1,teams:2});
 assert.equal((await q('select published from rounds'))[0].published,true);
 const same=await publish();assert.equal(same.status,'UNCHANGED');assert.equal(same.result_id,first.result_id);
 assert.equal((await q('select count(*) n from interclub_auto_publications'))[0].n,1);
 const changed=structuredClone(p);changed.score=[18,2];
 await reject(()=>publish(changed),/INTERCLUB_SOURCE_CHANGED/);
 const duplicate=structuredClone(p);duplicate.event_id='t_duplicate_1234';duplicate.source_url='https://n01darts.com/n01/league/season.php?id='+duplicate.event_id;
 await reject(()=>publish(duplicate),/INTERCLUB_EXISTING_RESULT_CONFLICT/);
 for(const player of p.players) {
   const profile=(await q('select * from player_profiles where player_id=$1 and season_id=$2',[player.id,season]))[0];
   assert.equal(profile.legs_played,player.leg);
   assert.equal(Number(profile.average_3_darts),Math.round(300*player.score/player.darts)/100);
   assert.equal(Number(profile.first_9),Math.round(300*player.f9Score/player.f9Darts)/100);
 }
 // Legacy J1 existed before the audit table and exact First 9 component columns.
 await db.exec('reset role; delete from interclub_auto_publications; update player_leg_stats set first_9_score=null,first_9_darts=null; set role service_role');
 const adopted=await publish();assert.equal(adopted.status,'UNCHANGED');assert.equal(adopted.result_id,first.result_id);
 assert.equal((await q('select count(*) n from imports'))[0].n,1);
 assert.equal((await q('select count(*) n from player_leg_stats where first_9_darts is not null'))[0].n,108);
 // A second night updates cumulative profiles, including different First 9 weights.
 const next=structuredClone(p);next.event_id='t_next_5678';next.round='J2';next.date='2026-09-29';
 next.source_url='https://n01darts.com/n01/league/season.php?id='+next.event_id;
 for(const row of next.stats) row.first_9_score-=1;
 for(const player of next.players) player.f9Score-=next.stats.filter(r=>r.player_id===player.id).length;
 assert.equal((await publish(next)).status,'PUBLISHED');
 for(const player of next.players) {
   const profile=(await q('select * from player_profiles where player_id=$1 and season_id=$2',[player.id,season]))[0];
   const previous=p.players.find(x=>x.id===player.id);
   assert.equal(profile.legs_played,previous.leg+player.leg);
   assert.equal(Number(profile.first_9),Math.round(300*(previous.f9Score+player.f9Score)/(previous.f9Darts+player.f9Darts))/100);
 }
 assert.deepEqual(await q('select * from player_profiles where season_id=$1',[historic]),old,'Historical profiles remain identical');
 assert.equal((await q('select count(*) n from players'))[0].n,fixture.identities.length,'No player creation or merge');
 const tables={};
 for(const name of ['players','teams','seasons','rounds','encounters','matches','legs','player_leg_stats','player_profiles','player_identities','championship_results']) tables[name]=(await q('select to_jsonb(t) data from '+name+' t')).map(r=>r.data);
 console.log(execFileSync('python3',['-m','tests.test_interclub_publication','--read-paths'],{cwd:resolve(root,'app/backend'),encoding:'utf8',input:JSON.stringify(tables)}).trim());
 console.log('PASS interclub: atomic rollback, permissions, timing, reconciliation, identity, idempotence, legacy J1, cumulative profiles and history');
} finally { await db.close(); }
