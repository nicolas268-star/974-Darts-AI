from __future__ import annotations

import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch

from app.services import nakka_sync_agent
from app.services.nakka_sync_agent import (
    KNOWN_MISSING_DETAIL_IDS,
    NakkaSyncError,
    _collect_official_event_list,
    _events_from_api_payload,
    accept_current_reference,
    compare_events,
    save_state,
    status_from_issues,
    validate_snapshot,
    validate_source_url,
)


class NakkaSyncAgentTests(unittest.TestCase):
    def test_accepts_official_2026_url(self) -> None:
        url = "https://n01darts.com/n01/league/portal.php?lgid=lg_QqGB_7154"
        self.assertEqual(validate_source_url(url), url)

    def test_rejects_unknown_host(self) -> None:
        with self.assertRaises(ValueError):
            validate_source_url(
                "https://example.com/n01/league/portal.php?lgid=lg_QqGB_7154"
            )

    def test_empty_snapshot_is_blocked(self) -> None:
        issues = validate_snapshot([])
        self.assertEqual(status_from_issues(issues), "BLOCKED")
        self.assertEqual(issues[0].code, "NO_EVENTS")

    def test_known_j1_missing_details_is_informational(self) -> None:
        known_id = next(iter(KNOWN_MISSING_DETAIL_IDS))
        issues = validate_snapshot(
            [
                {
                    "id": known_id,
                    "deepChecked": True,
                    "detail": {"statsText": ""},
                }
            ]
        )
        self.assertEqual(status_from_issues(issues), "READY")
        self.assertEqual(issues[0].code, "KNOWN_J1_COLLECTIVE_ONLY")

    def test_unknown_missing_details_requires_review(self) -> None:
        issues = validate_snapshot(
            [
                {
                    "id": "t_example_123",
                    "deepChecked": True,
                    "detail": {"statsText": ""},
                }
            ]
        )
        self.assertEqual(status_from_issues(issues), "CHECK")

    def test_builds_events_from_official_api_payload(self) -> None:
        source_url = (
            "https://n01darts.com/n01/league/portal.php?lgid=lg_QqGB_7154"
        )
        events = _events_from_api_payload(
            source_url,
            [
                {
                    "tdid": "t_alpha_001",
                    "title": "J1 Équipe A vs Équipe B",
                    "status": 40,
                    "t_date": 1772550000,
                    "s": 46201,
                    "d": 2905,
                },
                {"tdid": "t_beta_002", "title": "J1 Équipe C vs Équipe D"},
            ],
        )
        self.assertEqual(len(events), 2)
        self.assertEqual(events[0]["id"], "t_alpha_001")
        self.assertEqual(
            events[0]["url"],
            "https://n01darts.com/n01/league/season.php?id=t_alpha_001",
        )
        self.assertEqual(events[0]["sourceMeta"]["status"], 40)
        self.assertEqual(events[0]["sourceMeta"]["singlesMarker"], 46201)
        self.assertEqual(events[0]["sourceMeta"]["doublesMarker"], 2905)

    def test_comparison_reports_added_modified_removed_and_unchanged(self) -> None:
        reference = [
            {
                "id": "t_same_001",
                "label": "J1 A vs B",
                "sourceMeta": {"s": None, "singlesMarker": 10},
            },
            {
                "id": "t_changed_002",
                "label": "J2 C vs D",
                "sourceMeta": {"singlesMarker": 20, "doublesMarker": 2},
            },
            {"id": "t_removed_003", "label": "J3 E vs F"},
        ]
        current = [
            {
                "id": "t_same_001",
                "label": "J1 A vs B",
                "sourceMeta": {"singlesMarker": 10},
            },
            {
                "id": "t_changed_002",
                "label": "J2 C vs D",
                "sourceMeta": {"singlesMarker": 21, "doublesMarker": 2},
            },
            {"id": "t_added_004", "label": "J4 G vs H"},
        ]
        comparison = compare_events(reference, current)
        self.assertEqual(comparison["addedCount"], 1)
        self.assertEqual(comparison["modifiedCount"], 1)
        self.assertEqual(comparison["removedCount"], 1)
        self.assertEqual(comparison["unchangedCount"], 1)
        self.assertEqual(comparison["status"], "BLOCKED")
        self.assertTrue(comparison["acceptBlocked"])
        self.assertIn(
            "résultats simples",
            comparison["modified"][0]["changedFields"],
        )

    def test_comparison_ignores_deep_detail_when_current_run_is_quick(self) -> None:
        reference = [
            {
                "id": "t_event_001",
                "label": "J1 A vs B",
                "deepChecked": True,
                "detail": {"statsText": "détail de référence suffisamment long"},
            }
        ]
        current = [
            {
                "id": "t_event_001",
                "label": "J1 A vs B",
                "deepChecked": False,
                "detail": None,
            }
        ]
        comparison = compare_events(reference, current)
        self.assertFalse(comparison["hasChanges"])
        self.assertEqual(comparison["status"], "UNCHANGED")

    def test_reference_acceptance_is_blocked_when_an_event_disappears(self) -> None:
        snapshot_hash = "a" * 64
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(
                nakka_sync_agent,
                "STATE_PATH",
                Path(temp_dir) / "state.json",
            ):
                save_state(
                    {
                        "version": 2,
                        "source": {
                            "season": 2026,
                            "url": "https://n01darts.com/n01/league/portal.php?lgid=lg_QqGB_7154",
                            "active": True,
                        },
                        "reference": None,
                        "lastRun": {
                            "status": "READY",
                            "snapshotHash": snapshot_hash,
                            "comparison": {
                                "acceptBlocked": True,
                                "acceptBlockedReason": "Suppression à vérifier.",
                            },
                        },
                        "history": [],
                    }
                )
                with self.assertRaisesRegex(ValueError, "Suppression"):
                    accept_current_reference(
                        snapshot_hash,
                        confirmed=True,
                        accepted_by="test-admin",
                    )

    def test_rejects_non_list_event_payload(self) -> None:
        with self.assertRaises(NakkaSyncError):
            _events_from_api_payload(
                "https://n01darts.com/n01/league/portal.php?lgid=lg_QqGB_7154",
                {"events": []},
            )

    @patch("app.services.nakka_sync_agent._request_nakka_json")
    def test_official_api_uses_league_sort_and_returns_all_events(
        self,
        request_json,
    ) -> None:
        request_json.side_effect = [
            {
                "title": "Championnat 974 (2026)",
                "sort": "manual",
                "sort_order": 1,
            },
            [
                {"tdid": f"t_event_{index:02d}", "title": f"J{index}"}
                for index in range(1, 31)
            ],
        ]
        title, events = _collect_official_event_list(
            "https://n01darts.com/n01/league/portal.php?lgid=lg_QqGB_7154"
        )
        self.assertEqual(title, "Championnat 974 (2026)")
        self.assertEqual(len(events), 30)
        request_json.assert_called_with(
            "get_season_list",
            "lg_QqGB_7154",
            body={
                "skip": 0,
                "count": 81,
                "keyword": "",
                "status": [10, 20, 25, 30, 40],
                "sort": "manual",
                "sort_order": 1,
            },
        )


if __name__ == "__main__":
    unittest.main()
