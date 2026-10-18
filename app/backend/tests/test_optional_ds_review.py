"""Optional review projections and worker boundaries; no remote services."""
import os
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

os.environ.setdefault('SUPABASE_URL', 'https://test.invalid')
os.environ.setdefault('SUPABASE_SERVICE_ROLE_KEY', 'test-only-key')
os.environ.setdefault('INTERNAL_API_TOKEN', 'test-internal-token')
from app.services.ranking_workflow import director_review
from app.api.ranking_workflow_router import detail, historical_revision, list_events
from app.services import ranking_workflow_worker as worker


class OptionalDirectorReviewTests(unittest.TestCase):
    def setUp(self):
        self.director = str(uuid4())
        self.revision = dict(id=str(uuid4()), event_id='test', number=2, status='PUBLISHED',
                             fingerprint='immutable-content', director_id=self.director,
                             created_at='2026-10-15T12:00:00Z', historical=False,
                             snapshot={'metadata': {}, 'results': [], 'blockers': []})
        self.decision = dict(id=str(uuid4()), revision_id=self.revision['id'],
                             fingerprint=self.revision['fingerprint'], actor_id=self.director,
                             actor_role='SPORTS_DIRECTOR', actor_name='DS test',
                             action='APPROVE_DS', created_at='2026-10-15T13:00:00Z')

    def test_publication_never_implies_review(self):
        for status in ('ANALYZED', 'READY_TO_PUBLISH', 'PUBLISHED', 'DS_VALIDATED'):
            self.assertEqual(director_review({**self.revision, 'status': status}, []),
                             {'status': 'NOT_REVIEWED'})

    def test_only_matching_authorized_signature_counts(self):
        for field, value in [('revision_id', str(uuid4())), ('fingerprint', 'old'),
                             ('actor_id', str(uuid4())), ('actor_role', 'ADMIN')]:
            with self.subTest(field=field):
                self.assertEqual(director_review(self.revision, [{**self.decision, field: value}]),
                                 {'status': 'NOT_REVIEWED'})
        self.assertEqual(director_review(self.revision, [self.decision]), {
            'status': 'VALIDATED', 'actor_name': 'DS test', 'at': self.decision['created_at']})

    def test_explicit_correction_is_distinct_from_unreviewed(self):
        correction = {**self.decision, 'action': 'REQUEST_CORRECTION',
                      'created_at': '2026-10-15T14:00:00Z'}
        self.assertEqual(director_review(self.revision, [self.decision, correction])['status'],
                         'CORRECTION_REQUESTED')

    def test_new_revision_does_not_inherit_review(self):
        current = {**self.revision, 'id': str(uuid4()), 'fingerprint': 'new-data'}
        self.assertEqual(director_review(current, [self.decision]), {'status': 'NOT_REVIEWED'})
        self.assertEqual(director_review(self.revision, [self.decision])['at'],
                         self.decision['created_at'])

    def db(self, decisions):
        db = MagicMock()
        def table(name):
            q = MagicMock()
            for method in ('select', 'eq', 'limit', 'order', 'in_', 'range'):
                getattr(q, method).return_value = q
            data = {'ranking_workflow_revisions': [self.revision],
                    'ranking_workflow_events': [{'id': 'test', 'current_revision_id': self.revision['id'],
                                                 'published_revision_id': self.revision['id']}],
                    'ranking_workflow_decisions': decisions}[name]
            q.execute.return_value = SimpleNamespace(data=data)
            return q
        db.table.side_effect = table
        return db

    def test_api_list_detail_and_history_project_the_same_review(self):
        for decisions in ([], [self.decision]):
            db = self.db(decisions)
            ctx = db, {'role': 'SPORTS_DIRECTOR', 'user_id': self.director}
            expected = director_review(self.revision, decisions)
            self.assertEqual(list_events(offset=0, ctx=ctx)['events'][0]['ds_review'], expected)
            self.assertEqual(detail('test', ctx=ctx)['revision']['ds_review'], expected)
            self.assertEqual(historical_revision('test', self.revision['id'], ctx=ctx)['revision']['ds_review'], expected)

    def test_assigned_analyzed_results_are_available_without_submit(self):
        self.revision['status'] = 'ANALYZED'
        ctx = self.db([]), {'role': 'SPORTS_DIRECTOR', 'user_id': self.director}
        self.assertEqual(detail('test', ctx=ctx)['revision']['id'], self.revision['id'])

    def test_worker_never_scans_or_publishes_waiting_results(self):
        db = MagicMock()
        db.rpc.return_value.execute.return_value = SimpleNamespace(data=None)
        with patch.dict(os.environ, {'RANKING_EMAIL_ENABLED': 'false'}):
            worker.run_once(db)
        self.assertEqual(db.rpc.call_args_list[0].args, ('ranking_claim_work', {'p_queue': 'analysis'}))
        self.assertEqual(db.rpc.call_args_list[1].args, ('tournament_page_claim', {}))
        self.assertEqual(db.rpc.call_count, 2)
        db.table.assert_not_called()

    def test_analysis_worker_uses_shared_command_without_ds_approval(self):
        db = MagicMock()
        revision = {**self.revision, 'director_id': None, 'snapshot': {
            'metadata': {'title': 'Open de test', 'event_date': '2026-10-14',
                         'kind': 'COMMITTEE_OPEN', 'season_key': '2026-2027',
                         'organizer': 'Comité',
                         'source_url': 'https://n01darts.com/n01/tournament/comp.php?id=t_test'}}}
        db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = SimpleNamespace(data=[revision])
        job = {'id': str(uuid4()), 'actor_id': str(uuid4()), 'event_id': 'test',
               'expected_revision': revision['id'], 'lease_id': str(uuid4())}
        with patch.object(worker, 'collect_private', return_value={}), \
             patch.object(worker, 'registry', return_value=({}, {}, [])), \
             patch.object(worker, 'suggested_results', return_value=[]), \
             patch.object(worker, 'build_snapshot', return_value={'blockers': []}):
            worker.process_analysis(db, job)
        name, payload = db.rpc.call_args.args
        self.assertEqual(name, 'ranking_workflow_command')
        self.assertEqual(payload['p_action'], 'ANALYZE')
        self.assertIsNone(payload['p_payload']['director_id'])
        self.assertNotIn('APPROVE_DS', str(db.rpc.call_args_list))
        self.assertNotIn('PUBLISH', str(db.rpc.call_args_list))
