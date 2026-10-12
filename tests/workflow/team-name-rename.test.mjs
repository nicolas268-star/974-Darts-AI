import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const fixture = JSON.parse(execFileSync('python3', ['-m', 'tests.test_interclub_publication', '--fixture'], {
  cwd: resolve(root, 'app/backend'), encoding: 'utf8',
}));
const migration = read('supabase/release_migrations/MIGRATION_SUPABASE_V21_0_25_TEAM_BRUNE.sql');
const oldName = '3B Darts Club - B(londe)', newName = '3B Darts Club - B(rune)';
const teamId = '9b85ca85-4c9a-4bb7-8d73-c92e19ae7de3';

// Exercise both home and away lookups, before and after an existing audit.
for (const side of [0, 1]) {
  const db = new PGlite();
  const q = async (sql, args = []) => (await db.query(sql, args)).rows;
  const publish = async p => (await q('select publish_interclub_match($1::jsonb) as result', [JSON.stringify(p)]))[0].result;
  const snapshot = async () => {
    const rows = {};
    for (const table of ['teams', 'rounds', 'encounters', 'matches', 'legs', 'player_leg_stats',
      'championship_results', 'player_profiles', 'player_team_memberships', 'imports', 'interclub_auto_publications']) {
      rows[table] = await q(`select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`);
    }
    return rows;
  };
  try {
    await db.exec(read('tests/workflow/interclub-bootstrap.sql'));
    await db.exec(read('supabase/release_migrations/MIGRATION_SUPABASE_V21_0_24_INTERCLUB_AUTOMATIC.sql'));
    await db.exec(read('supabase/migrations/20260930180153_interclub_evening_schedule.sql'));
    await q("insert into seasons(name,is_active) values('2026-2027',true)");
    const p = structuredClone(fixture.payload);
    p.teams[side].name = oldName;
    p.teams[side].club_code = '3BDC';
    const brunePlayers = new Set(p.players.filter(player => player.team_id === p.teams[side].source_id).map(player => player.identity_id));
    for (const identity of fixture.identities) {
      await q('insert into players values($1,$2)', [identity.canonical_player_id, identity.canonical_display_name]);
      await q('insert into player_identities values($1,$2,$3,$4)',
        [identity.id, identity.canonical_player_id, identity.canonical_display_name, identity.status]);
    }
    for (const licensed of fixture.licensed) {
      await q(`insert into committee_licensed_players(season_key,identity_id,license_status,club_code,official_display_name,official_source_name)
        values($1,$2,$3,$4,$5,$6)`, [licensed.season_key, licensed.identity_id, licensed.license_status,
        brunePlayers.has(licensed.identity_id) ? '3BDC' : licensed.club_code, licensed.official_display_name, licensed.official_source_name]);
    }
    await q('insert into teams(id,name,official_club_code) values($1,$2,$3)', [teamId, oldName, '3BDC']);
    await db.exec('set role service_role');
    const first = await publish(p);
    assert.equal(first.status, 'PUBLISHED');
    const before = await snapshot();
    await db.exec('reset role');
    await db.exec(migration);
    await db.exec(migration); // Safe when the SQL deploy and recorded migration run twice.
    const definition = (await q("select pg_get_functiondef('public.publish_interclub_match(jsonb)'::regprocedure) as definition"))[0].definition;
    assert.ok(definition.includes("time '22:00'"), 'Existing evening schedule is preserved');
    const after = await snapshot();
    assert.deepEqual(after, { ...before, teams: before.teams.map(entry => entry.row.id === teamId
      ? { row: { ...entry.row, name: newName } } : entry) }, 'Only the team label changes; all source audits and sporting rows remain exact');
    for (const role of ['anon', 'authenticated']) {
      await db.exec('set role ' + role);
      await assert.rejects(() => q('select interclub_team_name($1)', [oldName]), /permission denied/);
      await assert.rejects(() => q('select interclub_team_payload($1::jsonb)', [JSON.stringify(p)]), /permission denied/);
      await assert.rejects(() => publish(p), /permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    const current = structuredClone(p); current.teams[side].name = newName;
    for (const payload of [p, current, p, current]) {
      const replay = await publish(payload);
      assert.equal(replay.status, 'UNCHANGED'); assert.equal(replay.result_id, first.result_id);
      assert.deepEqual(await snapshot(), after, 'Old and new labels replay identically without new teams, stats or audit rewrites');
    }
    for (const mutate of [
      payload => payload.stats[0].score++,
      payload => payload.title += ' changed',
      payload => payload.teams[side].source_id += ' changed',
      payload => payload.teams[side].club_code = 'TDC',
      payload => payload.teams[1 - side].name = 'Other team',
    ]) {
      const changed = structuredClone(current); mutate(changed);
      await assert.rejects(() => publish(changed), /INTERCLUB_SOURCE_CHANGED/);
    }
    const next = structuredClone(p); next.round = 'J2'; next.event_id = 't_rename_1234';
    next.source_url = 'https://n01darts.com/n01/league/season.php?id=' + next.event_id;
    assert.equal((await publish(next)).status, 'PUBLISHED', 'A still-running old worker can publish a new match after the rename');
    assert.deepEqual(await q('select id,name from teams where id=$1', [teamId]), [{ id: teamId, name: newName }]);
    assert.equal((await q('select count(*) as count from teams'))[0].count, 2, 'No legacy-name duplicate is inserted');
    const nextCurrent = structuredClone(next); nextCurrent.teams[side].name = newName;
    assert.equal((await publish(nextCurrent)).status, 'UNCHANGED');
    const ambiguous = structuredClone(next); ambiguous.round = 'J3'; ambiguous.event_id = 't_alias_5678';
    ambiguous.source_url = 'https://n01darts.com/n01/league/season.php?id=' + ambiguous.event_id;
    ambiguous.teams[0].name = oldName; ambiguous.teams[1].name = newName;
    await assert.rejects(() => publish(ambiguous), /INTERCLUB_DUPLICATE_OR_FORMAT/);
  } finally {
    await db.close();
  }
}
console.log('PASS team rename: same UUID, old/new home and away aliases, safe migration replay, immutable audits, strict divergence rejection and old worker compatibility');
