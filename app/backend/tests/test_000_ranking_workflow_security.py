"""Boundary tests use real FastAPI validation; no external database or auth calls."""

import os
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

os.environ.setdefault("SUPABASE_URL", "https://test.invalid")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-only-key")
os.environ.setdefault("INTERNAL_API_TOKEN", "test-internal-token")
import supabase  # Load the real SDK before older optional-SDK test modules.
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api.ranking_workflow_router import router
from app.api.committee_ranking_router import router as legacy_router

ADMIN, DS, PLAYER = (str(uuid4()) for _ in range(3))


class WorkflowApiSecurityTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(
            os.environ, {"RANKING_WORKFLOW_ENABLED": "true", "ADMIN_USER_ID": ADMIN}
        )
        self.environment.start()
        self.addCleanup(self.environment.stop)
        app = FastAPI()
        app.include_router(router)
        app.include_router(legacy_router)
        self.client = TestClient(app)
        self.db = MagicMock()
        self.patch = patch(
            "app.api.ranking_workflow_router.create_client", return_value=self.db
        )
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.headers = {
            "X-Internal-Token": "test-internal-token",
            "Authorization": "Bearer authenticated-token",
        }
        self.role("SPORTS_DIRECTOR", DS)

    def role(self, role, user_id):
        self.db.auth.get_user.return_value = SimpleNamespace(
            user=SimpleNamespace(id=user_id, user_metadata={"role": "ADMIN"})
        )

        def table(name):
            q = MagicMock()
            for method in ("select", "eq", "limit", "order", "in_", "range"):
                getattr(q, method).return_value = q
            data = (
                [{"user_id": user_id, "role": role, "display_name": "Test"}]
                if name == "profiles"
                else (
                    [{"administrator_id": ADMIN}]
                    if name == "ranking_workflow_config"
                    else []
                )
            )
            q.execute.return_value = SimpleNamespace(data=data)
            return q

        self.db.table.side_effect = table

    def test_internal_secret_and_user_token_are_both_required(self):
        self.assertEqual(
            self.client.get(
                "/api/v1/ranking-workflow/events",
                headers={"Authorization": "Bearer jwt"},
            ).status_code,
            401,
        )
        self.assertEqual(
            self.client.get(
                "/api/v1/ranking-workflow/events",
                headers={"X-Internal-Token": "test-internal-token"},
            ).status_code,
            401,
        )

    def test_revoked_session_is_rejected(self):
        self.db.auth.get_user.side_effect = ValueError("deleted or expired")
        self.assertEqual(
            self.client.get(
                "/api/v1/ranking-workflow/events", headers=self.headers
            ).status_code,
            401,
        )

    def test_player_cannot_promote_himself_with_metadata_or_headers(self):
        self.role("PLAYER", PLAYER)
        response = self.client.get(
            "/api/v1/ranking-workflow/events",
            headers={**self.headers, "X-User-Id": ADMIN, "X-Role": "ADMIN"},
        )
        self.assertEqual(response.status_code, 403)
        self.db.rpc.assert_not_called()

    def test_director_cannot_use_admin_options_or_mutations(self):
        self.assertEqual(
            self.client.get(
                "/api/v1/ranking-workflow/options", headers=self.headers
            ).status_code,
            403,
        )
        for action in (
            "SAVE",
            "IMPORT",
            "SUBMIT",
            "APPROVE_ADMIN",
            "PUBLISH",
            "ARCHIVE",
        ):
            response = self.client.post(
                "/api/v1/ranking-workflow/events/test/actions",
                headers=self.headers,
                json={
                    "key": str(uuid4()),
                    "expected_revision": str(uuid4()),
                    "action": action,
                    "confirmed": True,
                },
            )
            self.assertEqual(response.status_code, 403, action)
        self.db.rpc.assert_not_called()

    def test_director_cannot_read_unassigned_event(self):
        self.assertEqual(
            self.client.get(
                "/api/v1/ranking-workflow/events/not-assigned", headers=self.headers
            ).status_code,
            404,
        )

    def test_additional_admin_is_not_sole_administrator(self):
        self.role("ADMIN", PLAYER)
        self.assertEqual(
            self.client.get(
                "/api/v1/ranking-workflow/events", headers=self.headers
            ).status_code,
            403,
        )

    def test_unknown_actor_and_points_fields_are_rejected(self):
        response = self.client.post(
            "/api/v1/ranking-workflow/events/test/actions",
            headers=self.headers,
            json={
                "key": str(uuid4()),
                "expected_revision": str(uuid4()),
                "action": "APPROVE_DS",
                "actor_id": ADMIN,
                "points": 999,
            },
        )
        self.assertEqual(response.status_code, 422)

    def test_legacy_publication_bypass_is_closed(self):
        for path, data in (
            ("validate", {"event_id": "test", "confirmed": True, "results": []}),
            ("publish", {"event_id": "test", "confirmed": True}),
        ):
            self.assertEqual(
                self.client.post(
                    "/api/v1/committee-ranking/" + path, headers=self.headers, json=data
                ).status_code,
                410,
            )

    def test_disabled_feature_fails_closed(self):
        with patch.dict(os.environ, {"RANKING_WORKFLOW_ENABLED": "false"}):
            self.assertEqual(
                self.client.get(
                    "/api/v1/ranking-workflow/events", headers=self.headers
                ).status_code,
                503,
            )

    def test_suspending_actions_keeps_latest_public_reader(self):
        with patch.dict(os.environ, {"RANKING_WORKFLOW_ENABLED": "false"}), patch(
            "app.api.committee_ranking_router.db_client", return_value=self.db
        ):
            self.db.rpc.return_value.execute.return_value = SimpleNamespace(
                data={"events": []}
            )
            response = self.client.get("/api/v1/committee-ranking")
        self.assertEqual(response.status_code, 200)
        self.db.rpc.assert_called_with(
            "ranking_published_snapshot", {"p_season": "2026-2027"}
        )
