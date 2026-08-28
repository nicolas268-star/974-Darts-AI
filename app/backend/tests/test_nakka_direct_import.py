from __future__ import annotations

import json
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

from app.services import nakka_direct_import as direct
from app.services.tournament_workbook_service import available_tournament_codes


EVENT = {
    "tdid": "t_direct_123",
    "title": "Dimanche des Légendes nº1",
    "status": 40,
    "t_date": 1785646800,
    "updateTime": 1785672606481,
    "entry_list": [
        {"tpid": "p1", "name": "Alex"},
        {"tpid": "p2", "name": "Pierre"},
    ],
    "rr_result": [{
        "p1": {"p2": {"r": 3, "a": 52.5}},
        "p2": {"p1": {"r": 1, "a": 47.2}},
    }],
    "t_result": [{
        "p1": {"p2": {"r": 3}},
        "p2": {"p1": {"r": 1}},
    }],
    "t_setting": {"match_type": "x01"},
}
STATS = {
    "p1": {
        "score": 1503,
        "darts": 90,
        "winLeg": 3,
        "leg": 4,
        "winMatch": 1,
        "match": 1,
        "f9Score": 540,
        "f9Darts": 27,
        "highOut": 80,
        "ton00": 3,
        "ton40": 1,
        "ton80": 1,
        "best": 20,
        "worst": 30,
    },
    "p2": {
        "score": 1200,
        "darts": 78,
        "winLeg": 1,
        "leg": 4,
        "winMatch": 0,
        "match": 1,
        "f9Score": 450,
        "f9Darts": 27,
        "highOut": 40,
        "ton00": 1,
        "ton40": 0,
        "ton80": 0,
        "best": 25,
        "worst": 33,
    },
}


class NakkaDirectImportTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.state_path = root / "direct.json"
        self.registry_path = root / "tournaments.json"
        self.lock_path = root / "import.lock"
        self.registry_path.write_text(
            json.dumps({
                "contract_version": "14.1",
                "tournaments": [{
                    "code": "T1",
                    "source_tournament_id": "t_existing",
                    "event_name": "Tournoi existant",
                }],
            }),
            encoding="utf-8",
        )
        self.globals = patch.multiple(
            direct,
            STATE_PATH=self.state_path,
            TOURNAMENT_CACHE=self.registry_path,
            LOCK_PATH=self.lock_path,
        )
        self.globals.start()

    def tearDown(self) -> None:
        self.globals.stop()
        self.temp.cleanup()

    def _analyse(self) -> dict:
        with patch.object(
            direct,
            "_request_json",
            side_effect=[EVENT, STATS],
        ):
            return direct.analyze_direct_event(
                "https://n01darts.com/n01/league/season.php?id=t_direct_123",
                2026,
                [{"id": "official-alex", "name": "Alex"}],
            )

    def test_url_validation_rejects_untrusted_hosts(self) -> None:
        with self.assertRaises(ValueError):
            direct.validate_direct_event_url(
                "https://example.com/n01/league/season.php?id=t_direct_123"
            )

    def test_analysis_builds_preview_without_modifying_registry(self) -> None:
        before = self.registry_path.read_text(encoding="utf-8")
        state = self._analyse()
        preview = state["lastPreview"]
        self.assertEqual(preview["status"], "REVIEW")
        self.assertEqual(preview["summary"]["participants"], 2)
        self.assertEqual(preview["summary"]["matches"], 2)
        self.assertEqual(preview["summary"]["poolMatches"], 1)
        self.assertEqual(preview["summary"]["knockoutMatches"], 1)
        self.assertEqual(preview["summary"]["legs"], 8)
        self.assertEqual(preview["matches"][0]["phase"], "KNOCKOUT")
        self.assertEqual(preview["matches"][0]["stage_label"], "Finale")
        self.assertEqual(preview["summary"]["scores180"], 1)
        self.assertEqual(preview["participants"][0]["name"], "Alex")
        self.assertEqual(preview["participants"][0]["identity"]["status"], "EXACT")
        self.assertEqual(self.registry_path.read_text(encoding="utf-8"), before)

    def test_round_robin_uses_official_group_membership(self) -> None:
        payload = deepcopy(EVENT)
        payload["entry_list"].append({"tpid": "p3", "name": "Chloé"})
        payload["rr_table"] = [["p1", "p2"]]
        payload["rr_result"][0]["p1"]["p3"] = {"r": 2, "a": 50.0}
        payload["rr_result"][0]["p3"] = {
            "p1": {"r": 0, "a": 40.0}
        }
        with patch.object(direct, "_request_json", side_effect=[payload, STATS]):
            preview = direct.analyze_direct_event(
                "https://n01darts.com/n01/league/season.php?id=t_direct_123",
                2026,
                [],
            )["lastPreview"]

        pool_matches = [
            match for match in preview["matches"] if match["phase"] == "POOL"
        ]
        self.assertEqual(len(pool_matches), 1)
        self.assertEqual(
            {pool_matches[0]["home"], pool_matches[0]["away"]},
            {"Alex", "Pierre"},
        )

    def test_double_elimination_reads_winner_loser_and_final_reset(self) -> None:
        payload = deepcopy(EVENT)
        payload.pop("rr_result")
        payload.pop("t_result")
        payload["d_setting"] = {"match_type": "01", "no_reset": 0}
        payload["dw_result"] = [
            {
                "p1": {"p2": {"r": 3, "a": 54.0}},
                "p2": {"p1": {"r": 1, "a": 48.0}},
            },
            {
                "p1": {"p2": {"r": 1, "a": 49.0}},
                "p2": {"p1": {"r": 3, "a": 55.0}},
            },
            {
                "p1": {"p2": {"r": 1, "a": 50.0}},
                "p2": {"p1": {"r": 3, "a": 56.0}},
            },
        ]
        payload["dl_result"] = [{
            "p1": {"p2": {"r": 2, "a": 52.0}},
            "p2": {"p1": {"r": 0, "a": 45.0}},
        }]

        with patch.object(direct, "_request_json", side_effect=[payload, STATS]):
            preview = direct.analyze_direct_event(
                "https://n01darts.com/n01/league/season.php?id=t_direct_123",
                2026,
                [],
            )["lastPreview"]

        self.assertEqual(preview["format"], "DOUBLE_ELIMINATION")
        self.assertEqual(preview["summary"]["matches"], 4)
        self.assertEqual(
            [match["stage_label"] for match in preview["matches"]],
            [
                "Winner Bracket · Finale",
                "Loser Bracket · Finale",
                "Grand Final",
                "Grand Final Reset",
            ],
        )

    def test_import_requires_explicit_confirmation(self) -> None:
        preview = self._analyse()["lastPreview"]
        with self.assertRaises(ValueError):
            direct.import_direct_event(preview["snapshotHash"], False, "admin")

    def test_confirmed_import_creates_separate_t2_and_is_idempotent(self) -> None:
        preview = self._analyse()["lastPreview"]
        state = direct.import_direct_event(
            preview["snapshotHash"],
            True,
            "admin-id",
        )
        self.assertEqual(state["lastPreview"]["importedTournamentCode"], "T2")
        registry = json.loads(self.registry_path.read_text(encoding="utf-8"))
        imported = registry["tournaments"][-1]
        self.assertEqual(imported["code"], "T2")
        self.assertEqual(imported["summary"]["matches"], 2)
        self.assertEqual(imported["summary"]["pool_matches"], 1)
        self.assertEqual(imported["summary"]["knockout_matches"], 1)
        self.assertEqual(imported["bracket"][0]["name"], "Finale")
        self.assertFalse(imported["affects_official_ranking"])
        self.assertFalse(imported["affects_official_points"])
        self.assertFalse(imported["affects_elo"])
        self.assertEqual(available_tournament_codes(registry), {"T1", "T2"})

        direct.import_direct_event(preview["snapshotHash"], True, "admin-id")
        registry = json.loads(self.registry_path.read_text(encoding="utf-8"))
        self.assertEqual(len(registry["tournaments"]), 2)
        refreshed = registry["tournaments"][-1]
        self.assertEqual(refreshed["summary"]["knockout_matches"], 1)


if __name__ == "__main__":
    unittest.main()
