import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => readFileSync(resolve(root, p), 'utf8');
const db = new PGlite();
const q = async (sql, args=[]) => (await db.query(sql, args)).rows;
const actor = randomUUID();
const save = async p => (await q('select register_club_player($1::jsonb,$2::uuid) data', [JSON.stringify(p), actor]))[0].data;
const counts = async () => (await q(`select (select count(*) from players) players,(select count(*) from player_identities) identities,
  (select count(*) from player_aliases) aliases,(select count(*) from player_registrations) registrations,
  (select count(*) from player_team_memberships) memberships,(select count(*) from committee_licensed_players) licensed`))[0];
try {
  await db.exec(read('tests/workflow/interclub-bootstrap.sql'));
  await db.exec(`
    alter table players alter column id set default gen_random_uuid();
    alter table players add column public_profile boolean default true, add column team_id uuid references teams;
    alter table teams add column club_id uuid;
    create table clubs(id uuid primary key,name text);
    alter table committee_clubs add column name text,add column is_active boolean default true;
    update committee_clubs set name=code;
    alter table player_identities alter column id set default gen_random_uuid();
    alter table player_identities alter column status set default 'ACTIVE';
    alter table player_identities add column notes text,add column merged_into_identity_id uuid;
    alter table player_team_memberships add column valid_to date,add column created_by uuid,add column updated_at timestamptz default now();
    alter table committee_licensed_players add column official_first_name text,add column official_last_name text,
      add column normalized_official_name text,add column source_label text,add column updated_at timestamptz default now();
    create unique index licensed_name_idx on committee_licensed_players(season_key,normalized_official_name);
    create function normalize_player_alias(text) returns text language sql immutable as $$
      select regexp_replace(translate(lower($1),'éèêëàâäîïôöùûüç','eeeeaaaiioouuuc'),'[^a-z0-9]','','g'); $$;
    create table player_aliases(id uuid primary key default gen_random_uuid(),identity_id uuid references player_identities,
      source_player_id uuid references players,alias_name text,normalized_alias text,source text,confidence numeric,
      confirmed boolean,created_by uuid,unique(identity_id,normalized_alias));
    create function norm_alias() returns trigger language plpgsql as $$ begin new.normalized_alias=normalize_player_alias(new.alias_name);return new;end $$;
    create trigger norm_alias before insert or update on player_aliases for each row execute function norm_alias();
    create table player_identity_events(id uuid primary key default gen_random_uuid(),identity_id uuid references player_identities,
      event_type text,actor_id uuid,payload jsonb);
    grant select,insert,update on all tables in schema public to service_role;
  `);
  await db.exec(read('supabase/migrations/20261021133209_admin_player_registration.sql'));
  const season = (await q("insert into seasons(name,is_active) values('2026-2027',true) returning id"))[0].id;
  const old = (await q("insert into seasons(name,is_active) values('2026',false) returning id"))[0].id;
  const team = (await q("insert into teams(name,official_club_code) values('Papangue Darts Club - Fournaise','PDC') returning id"))[0].id;
  const other = (await q("insert into teams(name,official_club_code) values('Papangue Darts Club - Neige','PDC') returning id"))[0].id;
  let p = { request_id:randomUUID(), season_id:season, club_code:'PDC', team_id:team, identity_id:null,
    first_name:'Élodie',last_name:'Validation',nakka_name:'ElodieQA',license_number:'',joined_on:'2026-10-20' };
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(() => save(p), /permission denied/);
    await assert.rejects(() => q('select * from player_registrations'), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec(`create function late_failure() returns trigger language plpgsql as $$ begin raise exception 'TEST_ROLLBACK';end $$;
    create trigger late_failure before insert on player_registrations for each row execute function late_failure(); set role service_role;`);
  const before = await counts();
  await assert.rejects(() => save(p), /TEST_ROLLBACK/);
  assert.deepEqual(await counts(), before, 'Late failure rolls back identity, membership, alias and licence');
  await db.exec('reset role; drop trigger late_failure on player_registrations; set role service_role');
  for (const bad of [{club_code:'KAD'}, {license_number:'974020'}, {first_name:' '}, {joined_on:'2099-01-01'}, {season_id:randomUUID()}]) {
    await assert.rejects(() => save({...p,...bad}), /REG_INVALID/);
    assert.deepEqual(await counts(),before);
  }
  const first = await save(p);
  assert.equal(first.status,'CREATED');
  assert.equal(first.registration.license_number,null);
  assert.equal((await q('select license_status from committee_licensed_players'))[0].license_status,'INACTIVE');
  const after = await counts();
  assert.equal((await save(p)).status,'UNCHANGED');
  assert.deepEqual(await counts(), after);
  await assert.rejects(() => save({...p,first_name:'Changed'}), /REG_REQUEST_CONFLICT/);
  await assert.rejects(() => save({...p,request_id:randomUUID(),first_name:'Elodie'}), /REG_DUPLICATE_PLAYER/);
  await assert.rejects(() => save({...p,request_id:randomUUID(),first_name:'Other'}), /REG_ALIAS_CONFLICT/);
  const complete = {...p,request_id:randomUUID(),identity_id:first.registration.identity_id,license_number:'97402999'};
  await save(complete);
  assert.equal((await q('select license_status from committee_licensed_players'))[0].license_status,'ACTIVE');
  assert.deepEqual(await counts(),after,'Completing the licence reuses all canonical rows');
  await assert.rejects(() => save({...complete,request_id:randomUUID(),team_id:other}), /REG_TEAM_CONFLICT/);
  await assert.rejects(() => save({...p,request_id:randomUUID(),first_name:'Autre',nakka_name:'Other',license_number:'97402999'}), /REG_DUPLICATE_LICENSE/);
  // Reuse an existing player at the start of a new season, preserving historical stats and team.
  const veteran=(await q("insert into players(display_name,team_id) values('Joueur ANCIEN',$1) returning id",[other]))[0].id;
  const identity=(await q("insert into player_identities(canonical_player_id,canonical_display_name) values($1,'Joueur ANCIEN') returning id",[veteran]))[0].id;
  await q('insert into player_profiles(player_id,season_id,legs_played,average_3_darts) values($1,$2,12,48.5)',[veteran,old]);
  const history=await q('select * from player_profiles');
  await save({...p,request_id:randomUUID(),identity_id:identity,first_name:'Joueur',last_name:'ANCIEN',nakka_name:'VeteranQA'});
  assert.deepEqual(await q('select * from player_profiles'),history);
  assert.equal((await q('select team_id from players where id=$1',[veteran]))[0].team_id,other);
  const tables={};
  for (const name of ['players','teams','clubs','committee_clubs','seasons','rounds','encounters','matches','legs','player_leg_stats','player_profiles',
    'player_identities','player_aliases','player_team_memberships','player_registrations']) tables[name]=await q(`select * from ${name}`);
  console.log(execFileSync('python3',['-m','tests.test_player_registration','--read-paths'],{
    cwd:resolve(root,'app/backend'),encoding:'utf8',input:JSON.stringify({tables,player:first.player_id,season,old,team,veteran})}).trim());
  console.log('PASS registration database: permissions, validation, atomic rollback, duplicates, retries, licence updates, existing identity and history');
} finally { await db.close(); }
