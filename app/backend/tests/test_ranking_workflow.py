import copy
import unittest
from unittest.mock import patch
from uuid import uuid4
from app.services.ranking_workflow import (
    RevisionInput,
    ResultInput,
    build_snapshot,
    suggested_results,
    aggregate_public,
    SCALES,
)
from app.services.ranking_nakka import checked_addresses


class WorkflowSportingTests(unittest.TestCase):
    def setUp(self):
        self.ids = [str(uuid4()) for _ in range(4)]
        self.registry = {
            key: {
                "id": key,
                "canonical_display_name": f"Joueur {i}",
                "club": "Club test",
                "licensed": True,
            }
            for i, key in enumerate(self.ids)
        }
        self.source = {
            "sourceId": "t_test",
            "participants": [
                {"sourceId": "a", "name": "Duo A"},
                {"sourceId": "b", "name": "Duo B"},
            ],
            "blockingReasons": [],
            "format": "DOUBLE_ELIMINATION",
            "matches": [],
        }
        self.data = RevisionInput.model_validate(
            {
                "metadata": {
                    "title": "Double test",
                    "event_date": "2026-09-13",
                    "kind": "CLUB_DOUBLE",
                    "organizer": "Club test",
                    "source_url": "https://n01darts.com/n01/tournament/comp.php?id=t_test",
                },
                "recognition": {
                    "declared_on": "2026-08-20",
                    "received_at": "2026-09-14T10:00:00+04:00",
                    "ended_at": "2026-09-13T18:00:00+04:00",
                    "logo_confirmed": True,
                    "format_confirmed": True,
                    "eligibility_confirmed": True,
                    "classification_confirmed": True,
                    "evidence": "Affiche et accusé de réception test",
                    "classification_basis": "Classement officiel signé test",
                },
                "results": [
                    {
                        "source_ref": f"{'a' if i<2 else 'b'}:{i%2+1}",
                        "identity_id": key,
                        "eligibility": "ELIGIBLE",
                        "placement": "WINNER" if i < 2 else "RUNNER_UP",
                        "gender": "M",
                    }
                    for i, key in enumerate(self.ids)
                ],
            }
        )

    def build(self):
        return build_snapshot(self.data, self.source, self.registry, ["Club test"])

    def test_double_assigns_each_player_10_8_6_4_2(self):
        result = self.build()
        self.assertEqual(result["blockers"], [])
        self.assertEqual([r["points"] for r in result["results"]], [10, 10, 8, 8])
        self.assertEqual(SCALES["E"][:5], (10, 8, 6, 4, 2))
        self.assertEqual(result["summary"]["points"], 36)

    def test_unresolved_identity_and_duplicates_block(self):
        self.data.results[0].identity_id = None
        self.data.results[1].identity_id = self.data.results[2].identity_id
        blockers = self.build()["blockers"]
        self.assertTrue(any("Identité" in b for b in blockers))
        self.assertTrue(any("plusieurs" in b for b in blockers))

    def test_nonlicensed_zero_requires_reason(self):
        self.data.results[0].identity_id = None
        self.data.results[0].eligibility = "INELIGIBLE"
        self.data.results[0].player_name = "Invité test"
        self.assertTrue(any("Motiver" in b for b in self.build()["blockers"]))
        self.data.results[0].reason = "Pas de licence pour cette saison"
        result = self.build()
        self.assertEqual(result["blockers"], [])
        self.assertEqual(result["results"][0]["points"], 0)

    def test_incomplete_source_and_invalid_recognition_block(self):
        self.source["blockingReasons"] = ["Finale incomplète"]
        self.data.recognition.declared_on = self.data.metadata.event_date
        self.assertIn("Finale incomplète", self.build()["blockers"])
        self.assertTrue(any("15 jours" in b for b in self.build()["blockers"]))

    def test_missing_participant_and_mismatched_duo_rejected(self):
        self.data.results.pop()
        with self.assertRaisesRegex(ValueError, "exactement"):
            self.build()

    def test_double_elimination_is_not_inferred_from_winner_bracket(self):
        proposed = suggested_results(self.source, self.registry, {}, True)
        self.assertEqual(len(proposed), 4)
        self.assertTrue(all(r["placement"] == "UNCONFIRMED" for r in proposed))
        self.assertTrue(all(r["identity_id"] is None for r in proposed))

    def test_points_and_source_cannot_be_forged_in_input(self):
        with self.assertRaises(ValueError):
            ResultInput(source_ref="x", points=999)
        self.source["sourceId"] = "t_other"
        with self.assertRaisesRegex(ValueError, "source"):
            self.build()

    def test_snapshot_is_frozen_against_later_registry_changes(self):
        result = self.build()
        self.registry[self.ids[0]]["canonical_display_name"] = "Nom changé"
        self.assertEqual(result["results"][0]["player_name"], "Joueur 0")

    def test_public_projection_aggregates_canonical_id_not_alias(self):
        results = self.build()["results"]
        second = copy.deepcopy(results[:1])
        second[0]["player_name"] = "Autre alias"
        payload = {
            "events": [{"id": "a", "results": results}, {"id": "b", "results": second}]
        }
        ranking = aggregate_public(payload, "2026-2027")
        self.assertEqual(len(ranking["rankings"]["mixed"]), 4)
        self.assertEqual(ranking["rankings"]["mixed"][0]["total"], 20)
        self.assertEqual(len(ranking["events"]), 2)

    def test_private_and_mixed_dns_addresses_rejected(self):
        for address in ("127.0.0.1", "10.1.2.3", "169.254.169.254", "::1", "fc00::1"):
            with patch(
                "app.services.ranking_nakka.socket.getaddrinfo",
                return_value=[(None, None, None, None, (address, 443))],
            ):
                with self.assertRaises(ValueError):
                    checked_addresses("allowed-host")
