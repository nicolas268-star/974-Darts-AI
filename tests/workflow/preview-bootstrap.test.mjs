import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const migration = read('supabase/preview_migrations/20260923123248_ranking_preview_auth_bootstrap.sql');
const own = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const denied = async sql => { await assert.rejects(() => db.query(sql), /permission denied/); checks++; };
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    create table public.players(id uuid primary key);
    create table public.teams(id uuid primary key);
    create table public.committee_licensed_players(id uuid primary key);
    create table public.committee_ranking_results(id uuid primary key);
  `);
  await db.exec(migration);
  await db.exec(read('supabase/migrations/20260923103732_sports_director_role.sql'));
  check((await db.query('select count(*) as n from auth.users')).rows[0].n === 0,
    'Bootstrap creates no account');
  await assert.rejects(() => db.exec(migration), /PREVIEW_BOOTSTRAP_PRECONDITION_FAILED/);
  checks++;
  await db.exec('rollback');
  // Synthetic accounts exist only inside this disposable local database.
  await db.exec(`insert into auth.users values ('${own}'),('${other}');
    insert into public.profiles(user_id,role,display_name) values
      ('${own}','ADMIN','Admin test'),('${other}','SPORTS_DIRECTOR','DS test');
    set role anon;`);
  await denied('select * from public.profiles');
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${own}';`);
  const profiles = (await db.query('select * from public.profiles')).rows;
  check(profiles.length === 1 && profiles[0].user_id === own, 'Only own profile is visible');
  check((await db.query("update public.profiles set display_name='Updated' returning user_id")).rows.length === 1,
    'Only own display name can change');
  await denied("update public.profiles set role='SPORTS_DIRECTOR'");
  await denied('update public.profiles set player_id=null');
  await denied('update public.profiles set captain_team_id=null');
  await denied(`insert into public.profiles(user_id) values ('${other}')`);
  check((await db.query(`update public.profiles set display_name='Forbidden' where user_id='${other}' returning user_id`)).rows.length === 0,
    'Another profile cannot be edited');
  await db.exec('reset role; set role service_role;');
  check((await db.query('select * from public.profiles')).rows.length === 2, 'Server can resolve roles');
  console.log(`PASS: ${checks} preview bootstrap and profile access checks`);
} finally {
  await db.close();
}
