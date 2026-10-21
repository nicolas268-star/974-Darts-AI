import json
import sys
import unittest
from unittest.mock import patch
from types import SimpleNamespace

from app.services.player_statistics_engine import PlayerStatisticsEngine
from app.services.player_registration_service import official_rosters, save_registration


class Query:
    def __init__(self, rows): self.rows = rows
    def select(self, *_): return self
    def range(self, start, end): self.rows = self.rows[start:end + 1]; return self
    def execute(self): return SimpleNamespace(data=self.rows)


class Database:
    def __init__(self, tables): self.tables = tables
    def table(self, name): return Query(list(self.tables.get(name, [])))


def read_paths(payload):
    db = Database(payload['tables'])
    engine = PlayerStatisticsEngine.from_db(db)
    newcomer = next(p for p in engine.overview('2027') if p['player_id'] == payload['player'])
    assert newcomer['legs_played'] == 0
    assert newcomer['average_3_darts'] is None
    assert newcomer['affiliation_source'] == 'ADMIN_REGISTRATION'
    assert newcomer['team'] == 'Papangue Darts Club - Fournaise'
    assert payload['player'] not in {p['player_id'] for p in engine.overview('2026')}
    dashboard = engine.dashboard(payload['player'], '2027')
    assert dashboard['player']['team'] == newcomer['team']
    assert dashboard['meta']['has_data'] is False
    assert engine.dashboard(payload['veteran'], '2026')['kpis']['legs_played'] == 12
    assert engine.dashboard(payload['player'])['player']['team'] == newcomer['team']
    from app.services.player_transfer_service import player_directory
    assert next(p for p in player_directory(db) if p['id'] == payload['player'])['team'] == newcomer['team']
    rosters = official_rosters(db)
    team = next(t for t in rosters if t['id'] == 'pdc-fournaise')
    assert any(p.get('player_id') == payload['player'] for p in team['players'])
    assert not any(p.get('player_id') == payload['player'] for t in official_rosters(db, as_of='2026-10-19') for p in t['players'])
    print('PASS registration public reads: zero-match directory, player dashboard, season isolation, historical stats, live roster and arrival date')


class RegistrationTests(unittest.TestCase):
    def test_errors_do_not_expose_database_details(self):
        db = SimpleNamespace(rpc=lambda *_: (_ for _ in ()).throw(RuntimeError('secret REG_DUPLICATE_LICENSE')))
        with self.assertRaisesRegex(ValueError, 'numéro de licence'):
            save_registration(db, {}, 'actor')

    def test_unconfirmed_save_is_never_success(self):
        db = SimpleNamespace(rpc=lambda *_: SimpleNamespace(execute=lambda: SimpleNamespace(data=None)))
        with self.assertRaises(RuntimeError): save_registration(db, {}, 'actor')

    def test_admin_api_requires_both_internal_token_and_sole_admin(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from app.api.player_registration_router import router
        from app.config import settings
        app = FastAPI(); app.include_router(router)
        with patch.dict('os.environ', {'ADMIN_USER_ID': '00000000-0000-0000-0000-000000000001'}), \
             patch.object(settings, 'internal_api_token', 'test-token'):
            client = TestClient(app)
            assert client.get('/api/v1/player-registrations/admin').status_code == 401
            assert client.get('/api/v1/player-registrations/admin', headers={'X-Internal-Token':'test-token','X-User-Id':'other'}).status_code == 403
            with patch('app.api.player_registration_router.admin_options', return_value={'seasons':[]}), \
                 patch('app.api.player_registration_router.database', return_value=object()):
                assert client.get('/api/v1/player-registrations/admin', headers={'X-Internal-Token':'test-token','X-User-Id':'00000000-0000-0000-0000-000000000001'}).status_code == 200


if __name__ == '__main__':
    if '--read-paths' in sys.argv: read_paths(json.load(sys.stdin))
    else: unittest.main()
