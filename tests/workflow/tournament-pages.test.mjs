import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

// Isolated PostgreSQL semantics. No production database or Nakka network calls.
const db = new PGlite();
const read = p => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const admin = '00000000-0000-0000-0000-000000000001';
let checks = 0;
const same = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
const denied = async (fn, error) => { await assert.rejects(fn, error); checks++; };
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) => (await query(sql, args))[0].value;
const command = (event, expected, action, payload = {}, key = randomUUID()) => scalar(
  'select ranking_workflow_command($1,$2,$3,$4,$5,$6::jsonb) as value',
  [admin, event, expected, key, action, JSON.stringify(payload)]
);
const sportsSnapshot = {
  metadata: { title: 'Public tournament test', event_date: '2026-10-18', kind: 'COMMITTEE_OPEN', category: 'D', season_key: '2026-2027', organizer: 'Comité' },
  results: [{ identity_id: randomUUID(), player_name: 'Test public', placement: 'WINNER', points: 30 }], blockers: []
};
const create = async (event, source = event) => {
  const draft = await command(event, null, 'CREATE', { source_id: source, discipline: 'SINGLE', season_key: '2026-2027', snapshot: sportsSnapshot });
  return command(event, draft.revision_id, 'SAVE', { reason: 'Source vérifiée', snapshot: sportsSnapshot });
};
const approve = async (event, revision) => command(event, revision, 'APPROVE_ADMIN', { confirmed: true });
const publish = (event, revision, key = randomUUID()) => command(event, revision, 'PUBLISH', { confirmed: true }, key);
const page = (source, extra = {}) => ({
  source_tournament_id: source, code: source, discipline: 'SINGLE', classification: 'FRIENDLY',
  affects_committee_ranking: false, affects_official_points: false, affects_elo: false,
  official_results: [], event_name: 'Public source fixture', participants: [], matches: [], ...extra
});
const commit = (payload, hash, expected = null, event = null, revision = null, code = payload.code) => scalar(
  'select tournament_page_commit($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9) as value',
  [payload.source_tournament_id, payload.discipline, code, JSON.stringify(payload), hash, expected, event, revision, admin]
);
const claim = () => scalar('select tournament_page_claim() as value');
const history = id => query('select * from tournament_page_revisions where page_id=$1 order by id', [id]);
const jobs = () => query('select * from tournament_page_jobs order by event_id');
const publicRanking = () => scalar("select ranking_published_snapshot('2026-2027') as value");
const officialRows = async () => {
  const tables = ['committee_ranking_events', 'committee_ranking_results', 'ranking_workflow_events',
    'ranking_workflow_revisions', 'ranking_workflow_decisions', 'ranking_workflow_audit', 'ranking_notification_outbox'];
  return Promise.all(tables.map(table => query('select to_jsonb(t) as row from ' + table + ' t order by to_jsonb(t)::text')));
};

try {
  await db.exec(read('tests/workflow/bootstrap.sql'));
  await db.exec(read('supabase/release_migrations/MIGRATION_SUPABASE_V21_0_19_COMMITTEE_RANKING.sql'));
  await db.exec('alter table committee_ranking_results add column identity_id uuid');
  await db.exec(read('supabase/migrations/20260923103732_sports_director_role.sql'));
  await db.exec(read('supabase/migrations/20260923103743_ranking_workflow.sql'));
  await db.exec(read('supabase/migrations/20261015172851_optional_ds_review.sql'));
  await db.exec('set role service_role');
  const legacy = await create('published-before-migration', 't_legacy');
  await approve('published-before-migration', legacy.revision_id);
  await publish('published-before-migration', legacy.revision_id);
  const beforeMigration = await officialRows();
  await db.exec('reset role');
  await db.exec(read('supabase/migrations/20261018165909_universal_tournament_pages.sql'));
  await db.exec('set role service_role');
  same(await officialRows(), beforeMigration, 'Upgrade preserves every existing sporting row, signature and ranking pointer');
  same((await jobs()).map(j => [j.event_id, j.state, j.attempts]), [['published-before-migration', 'QUEUED', 0]], 'Upgrade queues already published stock for recovery');
  const upgradeRanking = await publicRanking();

  // Friendly projection is a separate store; the official contribution stays byte-for-byte intact.
  const friendly = page('t_friendly');
  const first = await commit(friendly, 'friendly-v1', 'ABSENT');
  same(await commit(friendly, 'friendly-v1', 'ABSENT'), first, 'Lost response replay is idempotent despite its old baseline');
  same((await history(first.id)).length, 1, 'Replay creates no second revision');
  await denied(() => commit({ ...friendly, event_name: 'Changed' }, 'friendly-v2', 'wrong-version'), /STALE_TOURNAMENT_PAGE/);
  same((await history(first.id)).length, 1, 'Stale preview neither changes the page nor appends history');
  const second = await commit({ ...friendly, code: 'requested-new-url', event_name: 'Changed' }, 'friendly-v2', 'friendly-v1');
  same([second.id, second.code, second.payload.code], [first.id, friendly.code, friendly.code], 'Refresh retains the original public URL');
  same((await history(first.id)).map(r => r.source_hash), ['friendly-v1', 'friendly-v2'], 'Successful refresh appends an immutable revision');
  await denied(() => commit(page('other-source', { code: friendly.code }), 'duplicate-code'), /duplicate key/);
  same(await scalar('select count(*)::int as value from tournament_pages where source_id=$1', ['other-source']), 0, 'Duplicate code failure leaves no half-created page');
  const double = await commit(page('t_friendly', { code: 't_friendly-double', discipline: 'DOUBLE' }), 'double-v1', 'ABSENT');
  same(double.id === first.id, false, 'Singles and doubles have separate source identities');
  same(await scalar('select count(*)::int as value from tournament_pages where source_id=$1', ['t_friendly']), 2, 'Exactly one page per source and discipline');
  for (const payload of [
    page('points-classification', { classification: 'OFFICIAL' }),
    page('points-flag', { affects_committee_ranking: true }),
    page('points-results', { official_results: [{ player_name: 'Invented', points: 30 }] })
  ]) await denied(() => commit(payload, 'blocked'), /FRIENDLY_POINTS_FORBIDDEN/);
  await denied(() => commit({ ...page('mismatched-source'), source_tournament_id: null }, 'invalid'), /INVALID_PAGE/);
  await denied(() => commit(page('fake-association'), 'invalid', null, 'published-before-migration', legacy.revision_id), /INVALID_OFFICIAL_ASSOCIATION/);
  same(await officialRows(), beforeMigration, 'Friendly operations never mutate points, workflow history or mail');
  same(await publicRanking(), upgradeRanking, 'Friendly operations contribute no official ranking points');

  // A reserved official source cannot bypass the publication workflow through friendly import.
  const unpublished = await create('reserved-unpublished', 't_reserved');
  await denied(() => commit(page('t_reserved'), 'reserved-v1'), /OFFICIAL_WORKFLOW_REQUIRED/);
  await denied(() => commit(page('t_reserved'), 'reserved-v1', null, 'reserved-unpublished', unpublished.revision_id), /OFFICIAL_WORKFLOW_REQUIRED/);
  same((await jobs()).length, 1, 'Draft creation and analysis do not queue public pages');
  const official = page('t_legacy', { code: 'legacy-public', classification: 'OFFICIAL', affects_committee_ranking: true,
    official_results: sportsSnapshot.results });
  await denied(() => commit(official, 'official-v1'), /OFFICIAL_WORKFLOW_REQUIRED/);
  const officialBefore = await officialRows();
  const officialFirst = await commit(official, 'official-v1', 'ABSENT', 'published-before-migration', legacy.revision_id);
  same(await officialRows(), officialBefore, 'Official page generation reads the published contribution without rewriting it');
  same(await commit(official, 'official-v1', 'ABSENT', 'published-before-migration', legacy.revision_id), officialFirst, 'Official retry also appends no revision');

  // Claim once, avoid parallel double-processing, and reclaim only after the lease expires.
  const initialLease = await claim();
  same([initialLease.event_id, initialLease.state, initialLease.attempts], ['published-before-migration', 'RUNNING', 1], 'Worker claims queued publication');
  assert.ok(initialLease.lease_id && initialLease.lease_until); checks++;
  same(await claim(), null, 'A live lease cannot be claimed by another worker');
  await query("update tournament_page_jobs set lease_until=now()-interval '1 second' where id=$1", [initialLease.id]);
  const replacementLease = await claim();
  same([replacementLease.id, replacementLease.attempts], [initialLease.id, 2], 'Crashed worker job is resumed after lease expiry');
  same(replacementLease.lease_id === initialLease.lease_id, false, 'Reclaim invalidates the stale worker token');
  same((await query("update tournament_page_jobs set state='SUCCEEDED' where id=$1 and state='RUNNING' and lease_id=$2 returning id", [initialLease.id, initialLease.lease_id])).length, 0, 'A stale worker cannot complete the replacement lease');

  // A new private revision keeps both public page and ranking on the last published version.
  const revisedSnapshot = { ...sportsSnapshot, results: [{ ...sportsSnapshot.results[0], points: 24 }] };
  const replacement = await command('published-before-migration', legacy.revision_id, 'SAVE', { reason: 'Correction vérifiée', snapshot: revisedSnapshot });
  same(await publicRanking(), upgradeRanking, 'A private replacement does not affect the published ranking');
  same((await jobs())[0].state, 'RUNNING', 'Saving a private revision does not invalidate a live page lease');
  await approve('published-before-migration', replacement.revision_id);
  const publishKey = randomUUID();
  await publish('published-before-migration', replacement.revision_id, publishKey);
  const requeued = (await jobs())[0];
  same([requeued.id, requeued.state, requeued.attempts, requeued.lease_id, requeued.lease_until], [initialLease.id, 'QUEUED', 0, null, null], 'Publication atomically requeues the same event and cancels older work');
  await denied(() => commit(official, 'official-v1', null, 'published-before-migration', legacy.revision_id), /OFFICIAL_WORKFLOW_REQUIRED/);
  same((await history(officialFirst.id)).length, 1, 'Stale official revision is rejected even for an otherwise idempotent page hash');
  const newestLease = await claim();
  const beforePublishReplay = await jobs();
  await publish('published-before-migration', replacement.revision_id, publishKey);
  same(await jobs(), beforePublishReplay, 'Replaying a completed PUBLISH command does not reset the worker lease');
  const updatedOfficial = await commit({ ...official, official_results: revisedSnapshot.results }, 'official-v1', 'official-v1', 'published-before-migration', replacement.revision_id);
  same([updatedOfficial.id, updatedOfficial.code, updatedOfficial.official_revision_id], [officialFirst.id, officialFirst.code, replacement.revision_id], 'A changed official version replaces one stable public page even when source hash is unchanged');
  same((await history(officialFirst.id)).length, 2, 'New official publication has its own projection history');
  same((await publicRanking()).events.find(e => e.id === 'published-before-migration').results.map(r => r.points), [24], 'Replacement has exactly one official contribution');
  await query("update tournament_page_jobs set state='FAILED',error='Simulated source outage',lease_id=null,lease_until=null where id=$1", [newestLease.id]);
  same(await claim(), null, 'Failure stays visible and does not retry in a tight loop');
  await query("update tournament_page_jobs set state='QUEUED',error=null where id=$1", [newestLease.id]);
  same((await claim()).attempts, 2, 'Explicit retry resumes the failed job');

  // Defense in depth: raw payloads and write RPCs stay private even to authenticated players.
  for (const role of ['anon', 'authenticated']) {
    await db.exec('reset role; set role ' + role);
    for (const table of ['tournament_pages', 'tournament_page_revisions', 'tournament_page_previews', 'tournament_page_jobs']) {
      await denied(() => query('select * from ' + table), /permission denied/);
      await denied(() => query('delete from ' + table), /permission denied/);
    }
    await denied(claim, /permission denied/);
    await denied(() => commit(friendly, 'forged-admin'), /permission denied/);
  }
  await db.exec('reset role');
  same(await query("select relname,relrowsecurity from pg_class where relname in ('tournament_pages','tournament_page_revisions','tournament_page_previews','tournament_page_jobs') order by relname"), [
    { relname: 'tournament_page_jobs', relrowsecurity: true }, { relname: 'tournament_page_previews', relrowsecurity: true },
    { relname: 'tournament_page_revisions', relrowsecurity: true }, { relname: 'tournament_pages', relrowsecurity: true }
  ], 'RLS is enabled on every projection table');
  await denied(() => query('update tournament_page_revisions set source_hash=$1 where page_id=$2', ['tampered', first.id]), /IMMUTABLE_RECORD/);
  await denied(() => query('delete from tournament_page_revisions where page_id=$1', [first.id]), /IMMUTABLE_RECORD/);
  console.log(`PASS: ${checks} tournament page, publication recovery, CAS, lease, ranking isolation and RLS checks`);
} finally {
  await db.close();
}
