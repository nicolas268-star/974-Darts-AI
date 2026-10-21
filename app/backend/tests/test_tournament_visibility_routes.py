"""Exercise the real HTTP boundary without importing the global application."""

import os
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch
from uuid import UUID

os.environ.setdefault("SUPABASE_URL", "https://test.invalid")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-only-key")
os.environ.setdefault("INTERNAL_API_TOKEN", "test-internal-token")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import visibility_router as api
from app.services import tournament_visibility as service
from app.services.visibility_service import SummaryUnavailable


TOKEN = "visibility-route-test-token"
PREFIX = "/api/v1/visibility"
RESULT_ID = "5bdce129-77fe-4bcb-b546-143c447d9d33"


class TournamentVisibilityRouteTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(api.router)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.headers = {"X-Internal-Token": TOKEN}
        self.db = MagicMock(name="database")
        self.db_client = MagicMock(return_value=self.db)
        self.install(patch.object(api, "settings", SimpleNamespace(internal_api_token=TOKEN)))
        self.install(patch.dict(sys.modules, {"app.main": SimpleNamespace(db_client=self.db_client)}))
        self.catalog = self.install(patch.object(api, "list_tournaments", return_value={"tournaments": [], "ai_available": False}))
        self.tournament = self.install(patch.object(api, "tournament_summary", return_value={"kind": "tournament"}))
        self.interclub = self.install(patch.object(api, "summary_payload", return_value={"kind": "interclub"}))

    def install(self, patcher):
        value = patcher.start()
        self.addCleanup(patcher.stop)
        return value

    def request(self, method, path, *, headers=None, **kwargs):
        return self.client.request(method, PREFIX + path, headers=self.headers if headers is None else headers, **kwargs)

    def assert_no_dispatch(self):
        self.db_client.assert_not_called()
        self.db.assert_not_called()
        self.db.table.assert_not_called()
        self.db.rpc.assert_not_called()
        self.catalog.assert_not_called()
        self.tournament.assert_not_called()
        self.interclub.assert_not_called()

    def test_all_new_endpoints_require_the_internal_header_before_database_access(self):
        endpoints = (
            ("GET", "/tournaments", {}),
            ("GET", "/tournament-summary", {"params": {"code": "t5"}}),
            ("POST", "/tournament-summary", {"json": {"code": "t5", "context": "Merci au club."}}),
        )
        for headers in ({}, {"X-Internal-Token": "incorrect"}, {"Authorization": "Bearer user-token"}):
            for method, path, arguments in endpoints:
                with self.subTest(method=method, path=path, headers=headers):
                    response = self.request(method, path, headers=headers, **arguments)
                    self.assertEqual(response.status_code, 401)
                    self.assertEqual(response.json()["detail"], "Internal token invalid")
                    self.assert_no_dispatch()

    def test_catalog_uses_only_the_tournament_reader(self):
        payload = {"tournaments": [{"id": "tournament:t5", "code": "t5", "label": "T5"}], "ai_available": False}
        self.catalog.return_value = payload
        response = self.request("GET", "/tournaments")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), payload)
        self.catalog.assert_called_once_with(self.db)
        self.db_client.assert_called_once_with()
        self.tournament.assert_not_called()
        self.interclub.assert_not_called()

    def test_get_and_post_accept_slug_codes_through_120_characters(self):
        for code in ("a", "T5", "oc1-2026-10-18", "double_test-2", "A" * 119 + "_"):
            for method in ("GET", "POST"):
                with self.subTest(method=method, length=len(code)):
                    self.tournament.reset_mock()
                    arguments = {"params": {"code": code}} if method == "GET" else {"json": {"code": code}}
                    response = self.request(method, "/tournament-summary", **arguments)
                    self.assertEqual(response.status_code, 200, response.text)
                    self.tournament.assert_called_once_with(self.db, code, context=None)
        self.catalog.assert_not_called()
        self.interclub.assert_not_called()

    def test_invalid_or_missing_codes_never_dispatch(self):
        invalid_codes = ("", "a" * 121, "../t5", "t5/oc1", "t5?x=1", "t5 with space", "été", "t5\n")
        for code in invalid_codes:
            for method in ("GET", "POST"):
                with self.subTest(method=method, code=code):
                    arguments = {"params": {"code": code}} if method == "GET" else {"json": {"code": code}}
                    self.assertEqual(self.request(method, "/tournament-summary", **arguments).status_code, 422)
        for method, arguments in (("GET", {}), ("POST", {"json": {}})):
            with self.subTest(method=method, missing=True):
                self.assertEqual(self.request(method, "/tournament-summary", **arguments).status_code, 422)
        self.assert_no_dispatch()

    def test_post_code_is_a_strict_string(self):
        for code in (None, 5, 5.0, True, [], {}):
            with self.subTest(code=code):
                response = self.request("POST", "/tournament-summary", json={"code": code})
                self.assertEqual(response.status_code, 422)
        self.assert_no_dispatch()

    def test_post_accepts_optional_context_and_exactly_1600_characters(self):
        for context in (None, "", "Merci aux bénévoles.", "x" * 1600, "é" * 1600):
            with self.subTest(length=None if context is None else len(context)):
                self.tournament.reset_mock()
                response = self.request("POST", "/tournament-summary", json={"code": "t5", "context": context})
                self.assertEqual(response.status_code, 200, response.text)
                self.tournament.assert_called_once_with(self.db, "t5", context=context)
        self.interclub.assert_not_called()

    def test_post_rejects_oversized_or_non_string_context_without_coercion(self):
        for context in ("x" * 1601, 0, 12.5, False, ["texte"], {"text": "texte"}):
            with self.subTest(context_type=type(context).__name__):
                response = self.request("POST", "/tournament-summary", json={"code": "t5", "context": context})
                self.assertEqual(response.status_code, 422)
        self.assert_no_dispatch()

    def test_post_forbids_unrecognized_fields_including_interclub_and_points_commands(self):
        for extra in ({"result_id": RESULT_ID}, {"points": 999}, {"use_ai": True}, {"published_revision_id": "another"}):
            with self.subTest(extra=next(iter(extra))):
                response = self.request("POST", "/tournament-summary", json={"code": "t5", **extra})
                self.assertEqual(response.status_code, 422)
        self.assert_no_dispatch()

    def test_get_uses_the_real_formatter_and_cannot_save_context(self):
        tournament = {"code": "t5", "name": "Tournoi publié", "players": [], "matches": []}
        self.tournament.side_effect = service.tournament_summary
        with patch.object(service, "load_tournament", return_value=tournament) as loader, \
                patch.object(service, "load_visibility_names", return_value=service.VisibilityNames()), \
                patch.object(service, "load_context", return_value="Contexte déjà enregistré") as context, \
                patch.object(service, "save_context") as save:
            response = self.request("GET", "/tournament-summary", params={"code": "t5", "context": "Ne pas enregistrer"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["context"], "Contexte déjà enregistré")
        self.assertEqual(response.json()["evening"]["result_id"], "tournament:t5")
        self.assertIn("Contexte déjà enregistré", response.json()["whatsapp"])
        self.assertNotIn("Ne pas enregistrer", response.json()["whatsapp"])
        loader.assert_called_once_with(self.db, "t5")
        context.assert_called_once()
        save.assert_not_called()
        self.interclub.assert_not_called()
        self.db.table.assert_not_called()
        self.db.rpc.assert_not_called()

    def test_post_dispatches_tournament_context_without_calling_interclub_summary(self):
        response = self.request("POST", "/tournament-summary", json={"code": "oc1-2026-10-18", "context": "Merci aux bénévoles."})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["kind"], "tournament")
        self.tournament.assert_called_once_with(self.db, "oc1-2026-10-18", context="Merci aux bénévoles.")
        self.interclub.assert_not_called()
        self.catalog.assert_not_called()

    def test_interclub_uuid_get_and_post_retain_their_own_dispatch(self):
        response = self.request("GET", "/summary", params={"result_id": RESULT_ID})
        self.assertEqual(response.status_code, 200)
        self.interclub.assert_called_once_with(UUID(RESULT_ID), False)
        self.interclub.reset_mock()
        response = self.request("POST", "/summary", json={"result_id": RESULT_ID, "context": "Contexte interclub"})
        self.assertEqual(response.status_code, 200)
        self.interclub.assert_called_once_with(UUID(RESULT_ID), True, context="Contexte interclub")
        self.tournament.assert_not_called()
        self.catalog.assert_not_called()
        self.db_client.assert_not_called()

    def test_interclub_and_tournament_identifiers_cannot_cross_request_models(self):
        for path, body in (("/summary", {"code": "t5"}),
                           ("/tournament-summary", {"result_id": RESULT_ID}),
                           ("/summary", {"result_id": "tournament:t5"})):
            with self.subTest(path=path):
                self.assertEqual(self.request("POST", path, json=body).status_code, 422)
        self.assertEqual(self.request("GET", "/summary", params={"result_id": "t5"}).status_code, 422)
        self.assert_no_dispatch()

    def test_unavailable_tournament_returns_409_without_falling_back_to_interclub(self):
        self.tournament.side_effect = SummaryUnavailable("Tournoi officiel ou reconnu publié introuvable.")
        for method in ("GET", "POST"):
            with self.subTest(method=method):
                arguments = {"params": {"code": "unknown"}} if method == "GET" else {"json": {"code": "unknown"}}
                response = self.request(method, "/tournament-summary", **arguments)
                self.assertEqual(response.status_code, 409)
                self.assertEqual(response.json()["detail"], "Tournoi officiel ou reconnu publié introuvable.")
        self.interclub.assert_not_called()

    def test_catalog_and_summary_fail_closed_without_exposing_internal_errors(self):
        secret = "private-db-url-and-service-key"
        self.catalog.side_effect = RuntimeError(secret)
        self.tournament.side_effect = RuntimeError(secret)
        for method, path, arguments in (("GET", "/tournaments", {}),
                                        ("GET", "/tournament-summary", {"params": {"code": "t5"}}),
                                        ("POST", "/tournament-summary", {"json": {"code": "t5"}})):
            with self.subTest(method=method, path=path):
                response = self.request(method, path, **arguments)
                self.assertEqual(response.status_code, 503)
                self.assertNotIn(secret, response.text)
        self.interclub.assert_not_called()


if __name__ == "__main__":
    unittest.main()
