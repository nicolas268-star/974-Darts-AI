// Disposable browser data only, loaded by the loopback test server.
export async function franceFixture(db) {
  const command = async (action, payload) => (await db.query('select france_inventory_command($1,$2::jsonb) as data', [action, JSON.stringify(payload)])).rows[0].data;
  const evidence = target => ({ target, url: 'https://example.test/source', kind: 'OFFICIAL_LINK', justification: 'Preuve fictive pour test isolé', checked_at: '2026-10-19T00:00:00Z' });
  for (let i = 1; i <= 11; i++) {
    const id = 'fixture-' + i;
    await command('committee', { id, name: 'Comité Démonstration ' + String(i).padStart(2, '0'), parent_organization: i % 2 ? 'Ligue Exemple A' : 'Ligue Exemple B', organism_type: 'COMMITTEE', verification_status: 'VERIFIED', reference_url: 'https://example.test/source', evidence: evidence(id) });
  }
  for (let i = 1; i <= 2; i++) {
    const n01_id = 't_FRANCE_FIXTURE_' + i;
    await command('observe', { record: { n01_id, title: 'Observation privée fictive ' + i, source_public: true, competition_date: '2026-10-18', season: '2026-2027', source_url: 'https://n01darts.com/n01/tournament/comp.php?id=' + n01_id }, source: { n01_id, source_hash: 'fixture-' + i, raw: { marker: 'PRIVATE_RAW_MUST_NOT_LEAK' } } });
    await command('suggest', { n01_id, committee_id: 'fixture-1', reason: 'N01 league relation', score: 80 });
  }
  const tables = new Set(['france_committees', 'france_competitions', 'france_candidates', 'france_runs', 'france_leagues']);
  return async ({ req, url, body, service, role, userId, send }) => {
    if (url.pathname === '/rest/v1/rpc/france_inventory_command') {
      if (!service || req.method !== 'POST') send(403, { message: 'Denied' });
      else send(200, await command(body.p_action, body.p_payload));
      return true;
    }
    const table = url.pathname.split('/').at(-1);
    if (!tables.has(table)) return false;
    if (!['GET', 'HEAD'].includes(req.method)) { send(405, {}); return true; }
    const columns = url.searchParams.get('select') === 'id' ? 'id' : 'id,payload';
    const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
    const limit = Math.min(500, Math.max(0, Number(url.searchParams.get('limit') || 500)));
    const result = await db.transaction(async tx => {
      await tx.exec('set local role ' + (service ? 'service_role' : role ? 'authenticated' : 'anon'));
      if (userId) await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [userId]);
      const rows = (await tx.query(`select ${columns} from ${table} order by id limit $1 offset $2`, [limit, offset])).rows;
      const count = (await tx.query(`select count(*)::int as n from ${table}`)).rows[0].n;
      return { rows, count };
    });
    send(200, req.method === 'HEAD' ? null : result.rows, { 'Content-Range': `${offset}-${offset + result.rows.length - 1}/${result.count}` });
    return true;
  };
}
