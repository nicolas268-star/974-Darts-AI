// Synthetic actors/competitions only. Isolated PostgreSQL engine, no remote database.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const db = new PGlite();
let checks = 0;
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const check = (value, message) => { assert.ok(value, message); checks++; };
const error = async (fn, expected) => { await assert.rejects(fn, expected); checks++; };
const command = async (action, payload) => (await query(
  'select public.france_inventory_command($1,$2::jsonb) as result', [action, JSON.stringify(payload)]))[0].result;
const evidence = target => ({ target, url: 'https://official.example.test/result', kind: 'OFFICIAL_LINK',
  justification: 'Synthetic evidence, tests only', checked_at: '2026-10-19T00:00:00Z' });
const committee = (id = 'fixture-committee') => ({ id, name: 'Comité de test', normalized_name: 'comite de test',
  organism_type: 'COMMITTEE', verification_status: 'VERIFIED', evidence: evidence(id), aliases: ['Test'] });
const record = { n01_id: 't_FIXTURE_001', title: 'Open de test', source_public: true, competition_date: '2026-10-18',
  season: '2026-2027', source_url: 'https://n01darts.com/n01/tournament/comp.php?id=t_FIXTURE_001' };
const observe = (hash = 'fixture-hash-1', title = record.title, extra = {}) => command('observe', {
  record: { ...record, title, ...extra }, source: { n01_id: record.n01_id, source_hash: hash,
    raw: { tournament: { tdid: record.n01_id, private: 0 } } } });
const decide = (status = 'VERIFIED', extra = {}) => command('decide', { n01_id: record.n01_id,
  committee_id: 'fixture-committee', status, actor: 'fixture-admin', reason: 'Evidence checked',
  evidence: evidence(record.n01_id), ...extra });
const count = async table => +(await query('select count(*) as n from public.' + table))[0].n;

try {
  await db.exec(readFileSync(resolve(root, 'tests/workflow/bootstrap.sql'), 'utf8'));
  // A sentinel proves the migration and every command leave historical sporting rows alone.
  await db.exec("create table historical_sporting_sentinel(id int primary key,points int); insert into historical_sporting_sentinel values(1,123)");
  await db.exec(readFileSync(resolve(root, 'supabase/migrations/20261019090000_france_discovery.sql'), 'utf8'));
  await db.exec('set role service_role');
  await command('committee', committee());
  await command('committee', committee());
  await command('committee', committee('second'));
  await command('correct_committee', { id: 'second', actor: 'fixture-admin', reason: 'Territory checked', overrides: { department: 'Test territory' } });
  check((await query("select payload->>'department' as d from france_committees where id='second'"))[0].d === 'Test territory', 'Audited organism correction');
  await error(() => command('committee', committee('second')), /MANUAL_ORGANISM_EXISTS/);
  await observe();
  const initialHistory = await count('france_history');
  check((await observe()).changed === false, 'Repeated source is idempotent');
  check(await count('france_history') === initialHistory, 'Unchanged source adds no duplicate revision');
  check(await count('france_competitions') === 1, 'N01 uniqueness');
  await command('league', { n01_id: 'lg_FIXTURE_001', title: 'Test', committee_id: 'fixture-committee', verification_status: 'REVIEW_REQUIRED' });
  await command('league', { n01_id: 'lg_FIXTURE_001', title: 'New source title', committee_id: 'second' });
  check((await query("select payload->>'committee_id' as c from france_leagues"))[0].c === 'fixture-committee', 'Import preserves manual league mapping');
  await command('suggest', { n01_id: record.n01_id, committee_id: 'fixture-committee', score: 100, status: 'VERIFIED' });
  for (const role of ['anon', 'authenticated']) {
    await db.exec('reset role; set role ' + role);
    check(await count('france_competitions') === 0, role + ' cannot see probable associations');
    check(await count('france_committees') === 2, role + ' can see verified organism identities');
    for (const table of ['france_sources', 'france_candidates', 'france_leagues', 'france_runs', 'france_history'])
      await error(() => query('select * from ' + table), /permission denied/);
    await error(() => command('decide', {}), /permission denied/);
    await error(() => query("update france_competitions set payload='{}'"), /permission denied/);
  }
  await db.exec('reset role; set role service_role');
  await error(() => decide('VERIFIED', { evidence: null }), /EVIDENCE_REQUIRED/);
  await error(() => decide('VERIFIED', { evidence: evidence('wrong-id') }), /EVIDENCE_REQUIRED/);
  await error(() => decide('VERIFIED', { actor: '' }), /INVALID_DECISION/);
  await error(() => command('committee', { ...committee('club'), organism_type: 'CLUB' }), /NOT_A_COMMITTEE/);
  await decide();
  await error(() => decide('VERIFIED', { committee_id: 'second' }), /CONFLICTING_COMMITTEE/);
  await db.exec('reset role; set role anon');
  check(await count('france_competitions') === 1, 'Only a proven association is public');
  await db.exec('reset role; set role service_role');
  await command('correct', { n01_id: record.n01_id, actor: 'fixture-admin', reason: 'Correction checked', overrides: { title: 'Manual title' } });
  await observe('fixture-hash-2', 'Changed at N01', { raw: 'must not leak', evidence: 'must not leak' });
  let current = (await query('select payload from france_competitions'))[0].payload;
  check(current.title === 'Manual title', 'Validated manual correction survives fresh source');
  check(current.verification_status === 'VERIFIED', 'Manual association survives source update');
  check(!('raw' in current) && !('evidence' in current), 'Private envelopes cannot leak into public metadata');
  await error(() => command('correct', { n01_id: record.n01_id, actor: 'fixture-admin', reason: 'Bad patch', overrides: { source_public: true } }), /INVALID_CORRECTION/);
  await command('withdraw', { n01_id: record.n01_id, reason: 'Source now inaccessible' });
  await db.exec('reset role; set role anon');
  check(await count('france_competitions') === 0, 'Private/deleted/inaccessible source is withdrawn');
  await db.exec('reset role; set role service_role');
  await observe('fixture-hash-3');
  await decide('REJECTED');
  await command('suggest', { n01_id: record.n01_id, committee_id: 'fixture-committee', score: 99 });
  check((await query('select payload from france_candidates'))[0].payload.status === 'REJECTED', 'Rejected association is never revived by discovery');
  await db.exec('reset role; set role authenticated');
  check(await count('france_competitions') === 0, 'Rejected association is no longer public');
  await db.exec('reset role');
  await error(() => query("update france_history set payload='{}'"), /IMMUTABLE_HISTORY/);
  // Fail the audit write after the association update: the whole RPC must roll back.
  await db.exec("create function public.test_france_audit_failure() returns trigger language plpgsql as $$ begin raise exception 'TEST_AUDIT_FAILURE'; end $$; create trigger test_france_audit_failure before insert on france_history for each row execute function public.test_france_audit_failure()")
  await db.exec('set role service_role');
  await error(() => decide(), /TEST_AUDIT_FAILURE/);
  current = (await query('select payload from france_competitions'))[0].payload;
  check(current.committee_id === null && current.verification_status === 'UNASSIGNED', 'Failed audit rolls back entire decision');
  await db.exec('reset role');
  check((await query('select points from historical_sporting_sentinel'))[0].points === 123, 'Historical sporting points untouched');
  console.log(JSON.stringify({ suite: 'france-discovery', checks, result: 'passed' }));
} finally {
  await db.close();
}
