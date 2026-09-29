import copy
import json
import os
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

if "supabase" not in sys.modules:
    stub = types.ModuleType("supabase")
    stub.Client = object
    sys.modules["supabase"] = stub

from app.services.visibility_service import (
    SummaryUnavailable, _ai_selection, _validate_selection, build_facts,
    compose_summary, list_evenings, load_evening,
)


class Query:
    def __init__(self, rows): self.rows = copy.deepcopy(rows)
    def select(self, _): return self
    def eq(self, key, value): self.rows = [r for r in self.rows if r.get(key) == value]; return self
    def in_(self, key, values): self.rows = [r for r in self.rows if r.get(key) in values]; return self
    def range(self, start, end): self.rows = self.rows[start:end + 1]; return self
    def execute(self): return types.SimpleNamespace(data=self.rows)


class DB:
    def __init__(self, rows): self.rows = rows
    def table(self, table): return Query(self.rows.get(table, []))


class VisibilitySummaryTests(unittest.TestCase):
    def setUp(self):
        self.result = {"id": "result", "round_id": "r", "season_id": "s", "home_team_id": "a", "away_team_id": "b", "home_score": 1, "away_score": 0, "quality_status": "VERIFIED", "detail_status": "DETAILED"}
        self.round = {"id": "r", "season_id": "s", "code": "J1", "played_on": "2026-09-28", "published": True}
        self.season = {"id": "s", "name": "2026-2027", "is_active": True}
        self.matches = [{"id": "m", "encounter_id": "e", "match_number": 1, "mode": "S", "winner_team_id": "a"}]
        self.legs = [{"id": "l1", "match_id": "m", "status": "VALID", "winner_team_id": "a"}, {"id": "l2", "match_id": "m", "status": "VALID", "winner_team_id": "a"}]
        self.stats = [
            {"leg_id": "l1", "player_id": "p1", "team_id": "a", "score": 501, "darts_thrown": 30, "finish": 80, "scores_180": 1, "leg_won": True},
            {"leg_id": "l1", "player_id": "p2", "team_id": "b", "score": 410, "darts_thrown": 30, "finish": 0, "scores_180": 0, "leg_won": False},
            {"leg_id": "l2", "player_id": "p1", "team_id": "a", "score": 501, "darts_thrown": 60, "finish": 40, "scores_180": 0, "leg_won": True},
            {"leg_id": "l2", "player_id": "p2", "team_id": "b", "score": 400, "darts_thrown": 57, "finish": 0, "scores_180": 0, "leg_won": False},
        ]
        self.players = {"p1": "Joueur A", "p2": "Joueur B"}
        self.teams = {"a": "Équipe A", "b": "Équipe B"}

    def facts(self):
        return build_facts(self.result, self.round, self.season, self.teams, self.matches, self.legs, self.stats, self.players)

    def db(self):
        return DB({"seasons": [self.season], "rounds": [self.round], "teams": [{"id": k, "name": v} for k, v in self.teams.items()],
                   "championship_results": [self.result], "encounters": [{"id": "e", "round_id": "r", "home_team_id": "a", "away_team_id": "b"}],
                   "matches": self.matches, "legs": self.legs, "player_leg_stats": self.stats, "players": [{"id": k, "display_name": v} for k, v in self.players.items()]})

    def test_published_loader_and_weighted_average(self):
        facts = load_evening(self.db(), "result")
        self.assertEqual(facts["players"], 2)
        by_id = {r["id"]: r["text"] for r in facts["facts"]}
        self.assertIn("33,40", by_id["top_average"])
        self.assertNotIn("37,58", by_id["top_average"])
        self.assertIn("4 points", by_id["points"])
        self.assertIn("80", by_id["finish"])
        self.assertIn("Joueur A × 1", by_id["maximums"])

    def test_only_published_verified_current_matches_are_available(self):
        self.assertEqual(len(list_evenings(self.db())["evenings"]), 1)
        self.round["published"] = False
        self.assertEqual(list_evenings(self.db())["evenings"], [])
        with self.assertRaises(SummaryUnavailable): load_evening(self.db(), "result")
        self.round["published"] = True
        self.result["quality_status"] = "CHECK"
        with self.assertRaises(SummaryUnavailable): load_evening(self.db(), "result")
        self.result["quality_status"] = "VERIFIED"
        self.season["is_active"] = False
        with self.assertRaises(SummaryUnavailable): load_evening(self.db(), "result")

    def test_incomplete_or_inconsistent_detail_never_produces_summary(self):
        self.stats.pop()
        with self.assertRaises(SummaryUnavailable): self.facts()
        self.setUp()
        self.result["home_score"] = 2
        with self.assertRaises(SummaryUnavailable): self.facts()
        self.setUp()
        self.legs[0]["status"] = "INVALID"
        with self.assertRaises(SummaryUnavailable): self.facts()

    def test_no_key_fallback_is_explicit_and_does_not_call_provider(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}), patch("urllib.request.urlopen") as provider:
            result = compose_summary(self.facts())
        provider.assert_not_called()
        self.assertEqual(result["mode"], "statistics")
        self.assertIn("n’est pas activée", result["note"])
        self.assertIn("Équipe A 1–0 Équipe B", result["whatsapp"])
        self.assertNotEqual(result["whatsapp"], result["facebook"])

    def test_ai_cannot_insert_unlisted_claims_and_is_cached_by_facts(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"OPENAI_API_KEY": "test-key", "VISIBILITY_CACHE_DIR": directory}), patch("app.services.visibility_service._ai_selection", return_value={"whatsapp": ["top_average", "finish"], "facebook": ["finish"]}) as provider:
            first = compose_summary(self.facts())
            second = compose_summary(self.facts())
            self.assertEqual(first["mode"], "ai")
            self.assertEqual(first["whatsapp"], second["whatsapp"])
            self.assertEqual(provider.call_count, 1)
            self.stats[0]["finish"] = 100
            changed = compose_summary(self.facts())
            self.assertNotEqual(changed["fingerprint"], first["fingerprint"])
            self.assertEqual(provider.call_count, 2)
        with self.assertRaises(ValueError): _validate_selection({"whatsapp": ["invented_record"], "facebook": ["finish"]}, self.facts()["facts"])

    def test_provider_failure_is_safe_and_falls_back(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"OPENAI_API_KEY": "secret", "VISIBILITY_CACHE_DIR": directory}), patch("app.services.visibility_service._ai_selection", side_effect=RuntimeError("sensitive provider error secret")):
            result = compose_summary(self.facts())
        self.assertEqual(result["mode"], "statistics")
        self.assertNotIn("secret", json.dumps(result))

    def test_responses_contract_and_incomplete_output(self):
        response = {"status": "completed", "output": [{"type": "message", "content": [{"type": "output_text", "text": json.dumps({"whatsapp": ["finish"], "facebook": ["finish"]})}]}]}
        import io
        with patch("urllib.request.urlopen", return_value=io.BytesIO(json.dumps(response).encode())) as provider:
            self.assertEqual(_ai_selection(self.facts()["facts"], "gpt-5-mini", "key")["whatsapp"], ["finish"])
            payload = json.loads(provider.call_args.args[0].data)
            self.assertFalse(payload["store"])
            self.assertEqual(payload["text"]["format"]["type"], "json_schema")
        response["status"] = "incomplete"
        with patch("urllib.request.urlopen", return_value=io.BytesIO(json.dumps(response).encode())):
            with self.assertRaises(ValueError): _ai_selection(self.facts()["facts"], "gpt-5-mini", "key")


if __name__ == "__main__": unittest.main()
