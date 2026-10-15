import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const fixture = module => JSON.parse(execFileSync('python3', ['-m', module, '--fixture'], {
  cwd: resolve(root, 'app/backend'), encoding: 'utf8',
}));
const j1 = fixture('tests.test_interclub_publication'), j2 = fixture('tests.test_interclub_j2_correction');
function legacy(payload) {
  const value = structuredClone(payload);
  for (const row of value.stats) delete row.scores_120_139;
  if (value.source_snapshot) for (const row of value.source_snapshot.stats) delete row.scores_120_139;
  return value;
}
const db = new PGlite();
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const publish = async (payload, enriched = true) => (await q(`select public.${enriched ? 'publish_interclub_scoring' : 'publish_interclub_match'}($1::jsonb) data`, [JSON.stringify(payload)]))[0].data;
const snapshot = async () => {
  const result = {};
  for (const table of ['championship_results', 'matches', 'legs', 'player_leg_stats', 'imports', 'interclub_auto_publications', 'player_profiles']) {
    result[table] = await q(`select to_jsonb(t) - 'scores_120_139' data from ${table} t order by id` .replace('order by id', table === 'interclub_auto_publications' ? 'order by source_event_id' : 'order by id'));
  }
  return result;
};
try {
  await db.exec(read('tests/workflow/interclub-bootstrap.sql'));
  for (const migration of [
    'supabase/release_migrations/MIGRATION_SUPABASE_V21_0_24_INTERCLUB_AUTOMATIC.sql',
    'supabase/migrations/20260930180153_interclub_evening_schedule.sql',
    'supabase/migrations/20261014201802_interclub_j2_result_correction.sql',
    'supabase/migrations/20261015052702_interclub_j2_statistics_attribution.sql',
  ]) await db.exec(read(migration));
  await q("insert into seasons(name,is_active) values('2026-2027',true)");
  const identities = new Map([...j1.identities, ...j2.identities].map(i => [i.id, i]));
  for (const i of identities.values()) {
    await q('insert into players values($1,$2)', [i.canonical_player_id, i.canonical_display_name]);
    await q('insert into player_identities values($1,$2,$3,$4)', [i.id, i.canonical_player_id, i.canonical_display_name, i.status]);
  }
  for (const l of new Map([...j1.licensed, ...j2.licensed].map(l => [l.identity_id, l])).values()) {
    await q('insert into committee_licensed_players(season_key,identity_id,license_status,club_code,official_display_name,official_source_name) values($1,$2,$3,$4,$5,$6)',
      [l.season_key, l.identity_id, l.license_status, l.club_code, l.official_display_name, l.official_source_name]);
  }
  await db.exec('set role service_role');
  for (const f of [j1, j2]) assert.equal((await publish(legacy(f.payload), false)).status, 'PUBLISHED');
  const before = await snapshot();
  await db.exec('reset role');
  await db.exec(read('supabase/migrations/20261015103031_scoring_120_139.sql'));
  assert.equal((await q('select count(*) n from player_leg_stats where scores_120_139 is not null'))[0].n, 0);
  for (const role of ['anon', 'authenticated']) {
    await db.exec('set role ' + role);
    await assert.rejects(() => publish(j1.payload), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  for (const f of [j1, j2]) {
    assert.equal((await publish(f.payload)).status, 'UNCHANGED');
    const expected = f.payload.stats.reduce((n, s) => n + s.scores_120_139, 0);
    const totals = await q(`select sum(st.scores_120_139)::int n, count(st.scores_120_139)::int covered
      from player_leg_stats st join legs l on l.id=st.leg_id join matches m on m.id=l.match_id
      join encounters e on e.id=m.encounter_id where e.natural_key=$1`,
    [f.payload.season + '|' + f.payload.round + '|nakka:' + f.payload.event_id]);
    assert.deepEqual(totals, [{ n: expected, covered: f.payload.stats.length }]);
    const first = await q('select id,scores_120_139 from player_leg_stats order by id');
    await publish(f.payload);
    assert.deepEqual(await q('select id,scores_120_139 from player_leg_stats order by id'), first, 'No accumulation on reimport');
  }
  assert.deepEqual(await snapshot(), before, 'Every historical metric, score, import, audit hash and profile is unchanged');
  for (const bad of [-1, 0.5, null, '2', 9999]) {
    const payload = structuredClone(j1.payload);
    // Use a late row to prove earlier enrichment changes roll back too.
    const early = payload.stats.find(row => row.scores_100 > 0);
    early.scores_120_139 = early.scores_120_139 ? 0 : 1;
    payload.stats.at(-1).scores_120_139 = bad;
    const stored = await q('select id,scores_120_139 from player_leg_stats order by id');
    await assert.rejects(() => publish(payload), /INTERCLUB_INVALID_SCORING_RANGE/);
    assert.deepEqual(await q('select id,scores_120_139 from player_leg_stats order by id'), stored);
  }
  const changed = structuredClone(j1.payload); changed.stats[0].score++;
  await assert.rejects(() => publish(changed), /INTERCLUB_SOURCE_CHANGED/);
  // A fresh automatic import receives the new range in its initial transaction.
  const next = structuredClone(j1.payload);
  next.event_id = 't_next_5678'; next.round = 'J3'; next.date = '2026-10-12';
  next.source_url = 'https://n01darts.com/n01/league/season.php?id=' + next.event_id;
  assert.equal((await publish(next)).status, 'PUBLISHED');
  assert.equal((await q('select count(*) n from player_leg_stats where scores_120_139 is null'))[0].n, 0);
  console.log('PASS scoring SQL: nullable migration, service-only RPC, exact historical backfill, J2 correction, unchanged hashes/results/MVP inputs, idempotent reimport, rollback and new automatic import.');
} finally { await db.close(); }
