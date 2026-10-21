from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from app.services.nakka_direct_import import normalize_direct_event
from app.services.tournament_engine import build_tournament_payload
from app.services import tournament_page_service as pages


FIXTURES = Path(__file__).parent / "fixtures"


def read_fixture(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def current_oc1():
    return normalize_direct_event(read_fixture("nakka_oc1_event.json"), read_fixture("nakka_oc1_stats.json"),
                                  "https://n01darts.com/n01/tournament/comp.php?id=t_ssSW_4561", 2027)


def legacy_t5():
    url = "https://n01darts.com/n01/tournament/comp.php?id=t_aKyY_3246"
    source = normalize_direct_event(read_fixture("nakka_t5_event.json"), read_fixture("nakka_t5_stats.json"), url, 2026)
    cache = build_tournament_payload(source, code="T5")
    cache.update(season="2026", imported_by="PRIVATE-ADMIN", display_aliases={"Manu (KAD)": "Emmanuel GRASSET"})
    for player in cache["players"]:
        player.pop("identity_status", None)
    cache["players"][0]["canonical_player_id"] = "legacy-confirmed-player"
    cache["matches"][0]["imported_by"] = "PRIVATE-MATCH-ADMIN"
    for key in ("pool_settings", "source_pool_standings", "pool_participants", "pool_qualifiers", "round_robin"):
        cache.pop(key, None)
    placements = list(cache["final_standings"])
    used = {row["name"] for row in placements}
    placements.extend({"name": row["name"], "placement": "ROUND_OF_16"} for row in cache["players"] if row["name"] not in used)
    results = [{"identity_id": f"identity-{index}", "player_name": "Emmanuel GRASSET" if row["name"] == "Manu (KAD)" else row["name"],
                "placement": row["placement"], "points": 41 - index}
               for index, row in enumerate(placements[:16])]
    snapshot = {"metadata": {"kind": "CLUB_SINGLE", "title": "Open de club · Kaz A Darts 974", "organizer": "Kaz A Darts",
                              "event_date": "2026-09-13", "season_key": "2026-2027", "source_url": url}, "results": results}
    db = Database()
    db.event.update(id="club-open-kaz-2026-09-13", source_id="t_aKyY_3246", published_revision_id="published-t5")
    db.tables["ranking_workflow_revisions"] = [{"id": "published-t5", "event_id": db.event["id"], "number": 1,
                                                 "status": "PUBLISHED", "historical": True, "snapshot": snapshot}]
    db.tables["player_identities"] = [{"id": row["identity_id"], "canonical_player_id": f"current-{index}", "status": "ACTIVE"}
                                     for index, row in enumerate(results)]
    return db, source, cache, results


class Query:
    def __init__(self, db, table):
        self.db, self.name = db, table
        self.filters, self.operation, self.value, self.maximum = [], "select", None, None
        self.offset = 0

    def select(self, _="*"):
        return self

    def eq(self, key, value):
        self.filters.append(lambda row: row.get(key) == value)
        return self

    def in_(self, key, values):
        self.filters.append(lambda row: row.get(key) in values)
        return self

    def limit(self, count):
        self.maximum = count
        return self

    def range(self, start, end):
        self.offset, self.maximum = start, end - start + 1
        return self

    def insert(self, value):
        self.operation, self.value = "insert", deepcopy(value)
        return self

    def update(self, value):
        self.operation, self.value = "update", deepcopy(value)
        return self

    def execute(self):
        self.db.operations.append((self.name, self.operation))
        table = self.db.tables.setdefault(self.name, [])
        if self.operation == "insert":
            self.value.setdefault("created_at", datetime.now(timezone.utc).isoformat())
            table.append(self.value)
            result = [self.value]
        else:
            result = [row for row in table if all(test(row) for test in self.filters)]
            if self.operation == "update":
                for row in result:
                    row.update(self.value)
        result = result[self.offset:]
        return SimpleNamespace(data=deepcopy(result[:self.maximum] if self.maximum is not None else result))


class Database:
    """Query fixture; SQL transaction/idempotence is tested in workflow/*.test.mjs."""
    def __init__(self, snapshot=None):
        snapshot = snapshot or read_fixture("oc1_published.json")
        self.event = {"id": "oc1-event", "source_id": "t_ssSW_4561", "discipline": "SINGLE",
                      "season_key": "2026-2027", "published_revision_id": "published-14", "revision_id": "draft-15", "status": "ADMIN_DRAFT"}
        self.tables = {
            "ranking_workflow_events": [self.event],
            "ranking_workflow_revisions": [
                {"id": "published-14", "event_id": "oc1-event", "number": 14, "status": "PUBLISHED", "snapshot": deepcopy(snapshot)},
                {"id": "draft-15", "event_id": "oc1-event", "number": 15, "status": "ADMIN_DRAFT", "snapshot": {"results": [{"points": 999999}]}},
            ],
            "player_identities": [{"id": row["identity_id"], "canonical_player_id": f"player-{index}", "status": "ACTIVE"}
                                  for index, row in enumerate(snapshot["results"]) if row.get("identity_id")],
            "tournament_pages": [], "tournament_page_previews": [],
            "teams": [], "player_aliases": [], "player_registrations": [],
        }
        self.operations, self.commits = [], []

    def table(self, name):
        return Query(self, name)

    def rpc(self, name, arguments):
        if name != "tournament_page_commit":
            raise AssertionError(name)
        self.commits.append(deepcopy(arguments))
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=deepcopy(arguments)))

    def save(self, payload):
        self.tables["tournament_pages"] = [{"source_id": payload["source_tournament_id"], "discipline": payload.get("discipline") or "SINGLE",
                                            "payload": deepcopy(payload), "source_hash": pages.fingerprint(payload), "code": str(payload["code"]).lower()}]


class TournamentPageServiceTests(unittest.TestCase):
    def setUp(self):
        self.cache = patch.object(pages, "load_tournament_cache", return_value={"tournaments": []})
        self.cache.start()

    def tearDown(self):
        self.cache.stop()

    def test_fingerprint_ignores_collection_and_provenance_timestamps(self):
        original = {"winner": "Alice", "source_snapshot_hash": "old", "source_updated_at": 1,
                    "nested": {"collectedAt": "yesterday", "snapshotHash": "before"}}
        changed = deepcopy(original)
        changed.update(source_snapshot_hash="new", source_updated_at=2, refreshed_at="today")
        changed["nested"].update(collectedAt="today", snapshotHash="after")
        self.assertEqual(pages.fingerprint(original), pages.fingerprint(changed))
        changed["winner"] = "Bob"
        self.assertNotEqual(pages.fingerprint(original), pages.fingerprint(changed))

    def test_official_payload_reads_active_publication_despite_new_draft(self):
        db = Database()
        before = deepcopy(db.tables)
        payload, revision = pages.official_payload(db, db.event)
        self.assertEqual(revision["id"], "published-14")
        self.assertEqual(payload["code"], "oc1-2026-10-18")
        self.assertEqual(sum(row["points"] for row in payload["official_results"]), 150)
        self.assertEqual(payload["players"][0]["canonical_player_id"], "player-0")
        self.assertFalse(payload["affects_official_points"])
        self.assertEqual(db.tables, before)
        self.assertTrue(all(operation == "select" for _, operation in db.operations))

    def test_inactive_identity_never_becomes_a_canonical_player_id(self):
        db = Database()
        db.tables["player_identities"][0]["status"] = "INACTIVE"
        payload, _ = pages.official_payload(db, db.event)
        self.assertIsNone(payload["players"][0]["canonical_player_id"])
        self.assertIsNone(payload["official_results"][0]["canonical_player_id"])

    def test_oc1_legacy_recovery_enriches_rules_without_mutating_150_points(self):
        db, collected = Database(), current_oc1()
        before = deepcopy(db.tables["ranking_workflow_revisions"])
        self.assertTrue(pages.same_source_content(collected, before[0]["snapshot"]["source"]))
        with patch("app.services.ranking_nakka.collect_private", return_value=collected) as collect:
            result = pages.sync_official(db, db.event["id"], collect_missing=True,
                                         display_metadata={"location": "Saint-Leu, La Réunion", "results": [{"points": 999}]})
        collect.assert_called_once()
        payload = result["p_payload"]
        self.assertEqual(payload["code"], "oc1-2026-10-18")
        self.assertEqual(payload["location"], "Saint-Leu, La Réunion")
        self.assertEqual(payload["summary"]["matches"], 83)
        self.assertEqual(len(payload["round_robin"]), 6)
        self.assertTrue(all(group["ranking_confirmed"] for group in payload["round_robin"]))
        self.assertEqual([row["points"] for row in payload["official_results"]], [row["points"] for row in before[0]["snapshot"]["results"]])
        self.assertEqual(sum(row["points"] for row in payload["official_results"]), 150)
        self.assertEqual(db.tables["ranking_workflow_revisions"], before)
        db.save(payload)
        with patch("app.services.ranking_nakka.collect_private", side_effect=AssertionError("No recollection")):
            repeated = pages.sync_official(db, db.event["id"], collect_missing=True)
        self.assertEqual(result["p_hash"], repeated["p_hash"])

    def test_modern_complete_snapshot_needs_no_collection(self):
        snapshot = read_fixture("oc1_published.json")
        snapshot["source"] = current_oc1()
        db = Database(snapshot)
        with patch("app.services.ranking_nakka.collect_private", side_effect=AssertionError("No network")):
            first = pages.sync_official(db, db.event["id"], collect_missing=True)
            second = pages.sync_official(db, db.event["id"], collect_missing=True)
        self.assertEqual(first["p_hash"], second["p_hash"])
        self.assertEqual(first["p_revision_id"], "published-14")

    def test_legacy_source_drift_blocks_enrichment_without_writing(self):
        db, collected = Database(), current_oc1()
        collected["matches"][0]["home_score"] += 1
        with patch("app.services.ranking_nakka.collect_private", return_value=collected):
            with self.assertRaisesRegex(ValueError, "diffère"):
                pages.sync_official(db, db.event["id"], collect_missing=True)
        self.assertFalse(db.commits)
        self.assertTrue(all(operation == "select" for _, operation in db.operations))

    def test_unchanged_modern_official_refresh_allows_only_page_projection(self):
        source = current_oc1()
        snapshot = read_fixture("oc1_published.json")
        snapshot["source"] = source
        db = Database(snapshot)
        payload, _ = pages.official_payload(db, db.event)
        db.save(payload)
        fresh = deepcopy(source)
        fresh.update(collectedAt="2099-01-01", snapshotHash="other", sourceUpdatedAt=9999999)
        with patch("app.services.ranking_nakka.collect_private", return_value=fresh):
            preview = pages.preview_refresh(db, payload["code"], "admin")
        self.assertTrue(preview["can_apply"])
        result = pages.apply_refresh(db, preview["preview_id"], "admin", True, code=payload["code"])
        self.assertEqual(result["p_expected_hash"], db.tables["tournament_pages"][0]["source_hash"])
        self.assertEqual(result["p_revision_id"], "published-14")
        self.assertEqual(sum(row["points"] for row in result["p_payload"]["official_results"]), 150)

    def test_official_source_correction_requires_new_official_validation(self):
        db = Database()
        before, _ = pages.official_payload(db, db.event)
        db.save(before)
        corrected = current_oc1()
        corrected["participants"][0]["average3Darts"] += 0.25
        with patch("app.services.ranking_nakka.collect_private", return_value=corrected):
            preview = pages.preview_refresh(db, before["code"], "admin")
        self.assertFalse(preview["can_apply"])
        self.assertTrue(preview["warnings"])
        with self.assertRaises(ValueError):
            pages.apply_refresh(db, preview["preview_id"], "admin", True)
        self.assertFalse(db.commits)

    def test_new_published_correction_keeps_url_location_and_official_points(self):
        snapshot = read_fixture("oc1_published.json")
        snapshot["source"] = current_oc1()
        db = Database(snapshot)
        existing, _ = pages.official_payload(db, db.event)
        existing["location"] = "Saint-Leu"
        db.save(existing)
        revised_snapshot = deepcopy(snapshot)
        revised_snapshot["source"]["participants"][0]["average3Darts"] += 0.25
        db.tables["ranking_workflow_revisions"].append({"id": "published-16", "event_id": "oc1-event", "number": 16,
                                                       "status": "PUBLISHED", "snapshot": revised_snapshot})
        db.event["published_revision_id"] = "published-16"
        before = deepcopy(db.tables["ranking_workflow_revisions"])
        with patch("app.services.ranking_nakka.collect_private", side_effect=AssertionError("No collection")):
            result = pages.sync_official(db, db.event["id"], collect_missing=True)
        self.assertEqual(result["p_code"], existing["code"])
        self.assertEqual(result["p_payload"]["location"], "Saint-Leu")
        self.assertEqual(result["p_revision_id"], "published-16")
        self.assertEqual(sum(row["points"] for row in result["p_payload"]["official_results"]), 150)
        self.assertEqual(db.tables["ranking_workflow_revisions"], before)

    def test_refresh_preview_is_bound_to_actor_code_expiry_and_publication(self):
        snapshot = read_fixture("oc1_published.json")
        snapshot["source"] = current_oc1()
        db = Database(snapshot)
        before, _ = pages.official_payload(db, db.event)
        db.save(before)
        with patch("app.services.ranking_nakka.collect_private", return_value=snapshot["source"]):
            preview = pages.preview_refresh(db, before["code"], "admin")
        preview_id = preview["preview_id"]
        with self.assertRaises(ValueError):
            pages.apply_refresh(db, preview_id, "other-admin", True)
        with self.assertRaises(ValueError):
            pages.apply_refresh(db, preview_id, "admin", True, code="different-event")
        db.event["published_revision_id"] = "published-16"
        with self.assertRaisesRegex(ValueError, "publication officielle a changé"):
            pages.apply_refresh(db, preview_id, "admin", True)
        db.event["published_revision_id"] = "published-14"
        db.tables["tournament_page_previews"][0]["created_at"] = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        with self.assertRaisesRegex(ValueError, "expiré"):
            pages.apply_refresh(db, preview_id, "admin", True)
        self.assertFalse(db.commits)

    def test_friendly_refresh_preserves_identity_and_does_not_read_points(self):
        db = Database()
        db.tables["ranking_workflow_events"] = []
        source = current_oc1()
        source["participants"][0]["identity"] = {"status": "EXACT", "canonicalPlayerId": "confirmed-player", "canonicalName": "Nom confirmé"}
        saved = build_tournament_payload(source, code="friendly")
        db.save(saved)
        refreshed = current_oc1()
        result = pages.sync_friendly(db, refreshed, "new-code", "admin")
        payload = result["p_payload"]
        self.assertEqual(payload["code"], "friendly")
        self.assertEqual(payload["players"][0]["canonical_player_id"], "confirmed-player")
        self.assertEqual(payload["href"], "/tournaments/friendly")
        self.assertFalse(payload["official_results"])
        self.assertFalse(payload["affects_committee_ranking"])
        self.assertIsNone(result["p_revision_id"])
        refreshed["participants"][0]["identity"] = {"status": "AMBIGUOUS", "canonicalPlayerId": None}
        ambiguous = pages.sync_friendly(db, refreshed, "friendly")["p_payload"]
        self.assertIsNone(ambiguous["players"][0]["canonical_player_id"])
        self.assertNotIn(source["participants"][0]["name"], ambiguous["display_aliases"])

    def test_friendly_refresh_preview_and_apply_only_commit_the_public_projection(self):
        db = Database()
        db.tables["ranking_workflow_events"] = []
        source = current_oc1()
        before = build_tournament_payload(source, code="friendly")
        db.save(before)
        corrected = deepcopy(source)
        corrected["participants"][0]["average3Darts"] += 0.25
        with patch("app.services.ranking_nakka.collect_private", return_value=corrected):
            preview = pages.preview_refresh(db, "friendly", "admin")
        self.assertTrue(preview["can_apply"])
        self.assertTrue(any(change["field"] == "players" for change in preview["changes"]))
        with self.assertRaises(ValueError):
            pages.apply_refresh(db, preview["preview_id"], "admin", False)
        committed = pages.apply_refresh(db, preview["preview_id"], "admin", True, code="friendly")
        self.assertIsNone(committed["p_event_id"])
        self.assertIsNone(committed["p_revision_id"])
        self.assertFalse(committed["p_payload"]["official_results"])
        self.assertFalse(committed["p_payload"]["affects_official_points"])
        self.assertFalse(committed["p_payload"]["affects_elo"])

    def test_blocked_friendly_preview_cannot_be_published(self):
        db, source = Database(), current_oc1()
        source["status"] = "BLOCKED"
        with self.assertRaisesRegex(ValueError, "incomplète"):
            pages.sync_friendly(db, source, "friendly")
        self.assertFalse(db.commits)

    def test_legacy_doublette_recovery_compares_two_members_without_splitting_statistics(self):
        raw = {"tdid": "t_duos", "title": "Doublettes", "entry_list": [
            {"tpid": "a", "name": "Duo A", "num_part": 4},
            {"tpid": "b", "name": "Duo B", "num_part": 4},
        ], "t_result": [{"a": {"b": {"r": 3}}, "b": {"a": {"r": 1}}}]}
        source = normalize_direct_event(raw, {}, "https://n01darts.com/n01/tournament/comp.php?id=t_duos", 2027)
        snapshot = {"metadata": {"kind": "CLUB_DOUBLE"}, "results": [
            {"source_ref": "a:1", "source_name": "Duo A", "player_name": "Alice", "placement": "WINNER"},
            {"source_ref": "a:2", "source_name": "Duo A", "player_name": "Bob", "placement": "WINNER"},
            {"source_ref": "b:1", "source_name": "Duo B", "player_name": "Chloé", "placement": "RUNNER_UP"},
            {"source_ref": "b:2", "source_name": "Duo B", "player_name": "Dan", "placement": "RUNNER_UP"},
        ]}
        pages._validate_source_against_official(source, snapshot)
        source["participants"][0]["sourceId"] = "different-player-id"
        with self.assertRaisesRegex(ValueError, "Participants différents"):
            pages._validate_source_against_official(source, snapshot)

    def test_commit_hash_describes_the_canonical_stable_url_payload(self):
        db = Database()
        payload = build_tournament_payload(current_oc1(), code="T99")
        result = pages.commit_page(db, payload)
        self.assertEqual(result["p_payload"]["code"], "t99")
        self.assertEqual(result["p_payload"]["href"], "/tournaments/t99")
        self.assertEqual(result["p_hash"], pages.fingerprint(result["p_payload"]))
        self.assertEqual(payload["code"], "T99")

    def test_stale_import_replay_cannot_undo_a_newer_admin_refresh(self):
        db, original = Database(), current_oc1()
        db.tables["ranking_workflow_events"] = []
        newer = deepcopy(original)
        newer["sourceUpdatedAt"] += 1
        newer["snapshotHash"] = "newer-snapshot"
        saved = build_tournament_payload(newer, code="friendly")
        db.save(saved)
        replay = {**original, "imported": True}
        with self.assertRaisesRegex(ValueError, "périmée"):
            pages.sync_friendly(db, replay, "friendly")
        replay["sourceUpdatedAt"] = newer["sourceUpdatedAt"]
        with self.assertRaisesRegex(ValueError, "ancienne version"):
            pages.sync_friendly(db, replay, "friendly")
        self.assertFalse(db.commits)
        idempotent = {**newer, "imported": True}
        self.assertEqual(pages.sync_friendly(db, idempotent, "friendly")["p_payload"]["source_snapshot_hash"], "newer-snapshot")

    def test_t5_historical_public_read_keeps_90_matches_35_players_and_official_points(self):
        db, _, cache, results = legacy_t5()
        with patch.object(pages, "load_tournament_cache", return_value={"tournaments": [cache]}):
            payload = pages.public_pages(db)[0]
        self.assertEqual(payload["code"], "T5")
        self.assertEqual(payload["summary"]["matches"], 90)
        self.assertEqual(len(payload["players"]), 35)
        self.assertEqual(payload["season"], "2026")
        self.assertEqual(payload["season_key"], "2026-2027")
        self.assertEqual([row["points"] for row in payload["official_results"]], [row["points"] for row in results])
        self.assertNotIn("PRIVATE-", json.dumps(payload))
        self.assertTrue(all("identity_status" not in row for row in payload["players"] if not row["canonical_player_id"]))
        self.assertEqual(payload["players"][0]["canonical_player_id"], "legacy-confirmed-player")
        self.assertEqual(payload["display_aliases"]["Manu (KAD)"], "Emmanuel GRASSET")
        self.assertFalse(payload["has_double_elimination"])
        self.assertTrue(payload["has_secondary_bracket"])

    def test_t5_legacy_worker_enriches_only_identical_cache_core_without_source_refs(self):
        db, source, cache, results = legacy_t5()
        self.assertTrue(pages.same_source_content(source, pages._cache_source(cache)))
        with patch.object(pages, "load_tournament_cache", return_value={"tournaments": [cache]}), \
             patch("app.services.ranking_nakka.collect_private", return_value=source) as collect:
            committed = pages.sync_official(db, db.event["id"], collect_missing=True)
        collect.assert_called_once()
        payload = committed["p_payload"]
        self.assertEqual(payload["summary"]["matches"], 90)
        self.assertEqual(payload["season"], "2026")
        self.assertTrue(all(group["ranking_confirmed"] for group in payload["round_robin"]))
        self.assertEqual([row["points"] for row in payload["official_results"]], [row["points"] for row in results])
        self.assertNotIn("PRIVATE-", json.dumps(payload))
        db.save(payload)
        with patch("app.services.ranking_nakka.collect_private", side_effect=AssertionError("No recollection")):
            repeated = pages.sync_official(db, db.event["id"], collect_missing=True)
        self.assertEqual(committed["p_hash"], repeated["p_hash"])

    def test_t5_legacy_worker_preserves_valid_cache_when_nakka_is_unavailable(self):
        db, _, cache, results = legacy_t5()
        with patch.object(pages, "load_tournament_cache", return_value={"tournaments": [cache]}), \
             patch("app.services.ranking_nakka.collect_private", side_effect=TimeoutError("Nakka offline")):
            payload = pages.sync_official(db, db.event["id"], collect_missing=True)["p_payload"]
        self.assertEqual(payload["summary"]["matches"], 90)
        self.assertEqual(len(payload["players"]), 35)
        self.assertEqual(payload["season"], "2026")
        self.assertEqual([row["points"] for row in payload["official_results"]], [row["points"] for row in results])
        self.assertTrue(any("indisponible" in note for note in payload["data_quality_notes"]))

    def test_t5_legacy_refresh_compares_cache_core_before_accepting_new_pool_metadata(self):
        db, source, cache, _ = legacy_t5()
        with patch.object(pages, "load_tournament_cache", return_value={"tournaments": [cache]}), \
             patch("app.services.ranking_nakka.collect_private", return_value=source):
            preview = pages.preview_refresh(db, "T5", "admin")
        self.assertTrue(preview["can_apply"])
        source["participants"][0]["scores100"] += 1
        with patch.object(pages, "load_tournament_cache", return_value={"tournaments": [cache]}), \
             patch("app.services.ranking_nakka.collect_private", return_value=source):
            rejected = pages.preview_refresh(db, "T5", "admin")
        self.assertFalse(rejected["can_apply"])

    def test_reserved_official_source_cannot_be_imported_as_friendly(self):
        db = Database()
        db.event["published_revision_id"] = None
        with self.assertRaisesRegex(ValueError, "réservée"):
            pages.sync_friendly(db, current_oc1(), "friendly", "admin")
        self.assertFalse(db.commits)

    def test_historical_t5_recognition_cannot_be_downgraded_by_friendly_import_or_refresh(self):
        db = Database()
        db.tables["ranking_workflow_events"] = []
        historical = {"code": "T5", "source_tournament_id": "t_aKyY_3246", "source_url": "https://n01darts.com/n01/tournament/comp.php?id=t_aKyY_3246"}
        source = {"sourceId": "t_aKyY_3246", "discipline": "SINGLE"}
        with patch.object(pages, "load_tournament_cache", return_value={"tournaments": [historical]}):
            with self.assertRaisesRegex(ValueError, "workflow officiel"):
                pages.sync_friendly(db, source, "T99")
            with patch("app.services.ranking_nakka.collect_private") as collect:
                with self.assertRaisesRegex(ValueError, "workflow officiel"):
                    pages.preview_refresh(db, "T5", "admin")
            collect.assert_not_called()
        self.assertFalse(db.commits)

    def test_reserved_official_draft_does_not_reappear_from_legacy_friendly_cache(self):
        db = Database()
        db.event["published_revision_id"] = None
        old_friendly = {"code": "T8", "source_tournament_id": "t_ssSW_4561", "classification": "FRIENDLY"}
        historical_t5 = {"code": "T5", "source_tournament_id": "t_aKyY_3246", "classification": "COMMITTEE_RECOGNIZED"}
        with patch.object(pages, "load_tournament_cache", return_value={"tournaments": [old_friendly, historical_t5]}):
            result = pages.all_tournaments(db)
        self.assertEqual([row["code"] for row in result], ["T5"])

    def test_nakka_outage_retains_last_valid_page_and_creates_no_preview(self):
        db = Database()
        payload, _ = pages.official_payload(db, db.event)
        db.save(payload)
        with patch("app.services.ranking_nakka.collect_private", side_effect=TimeoutError("Nakka unavailable")):
            self.assertEqual(pages.public_pages(db), [payload])
            with self.assertRaises(TimeoutError):
                pages.preview_refresh(db, payload["code"], "admin")
        self.assertFalse(db.tables["tournament_page_previews"])
        self.assertFalse(db.commits)

    def test_location_survives_new_official_revision_and_display_override_is_whitelisted(self):
        db = Database()
        existing, _ = pages.official_payload(db, db.event)
        existing["location"] = "Saint-Leu"
        payload, _ = pages.official_payload(db, db.event, existing, display_metadata={"location": "Saint-Leu, La Réunion", "title": "Forbidden title"})
        self.assertEqual(payload["location"], "Saint-Leu, La Réunion")
        self.assertEqual(payload["event_name"], "Open de Comite #1")
        self.assertEqual(pages.official_payload(db, db.event, existing)[0]["location"], "Saint-Leu")

    def test_page_status_preserves_a_persisted_public_url_after_official_promotion(self):
        db = Database()
        payload = build_tournament_payload(current_oc1(), code="old-friendly-url")
        db.save(payload)
        status = pages.page_status(db, db.event)
        self.assertEqual(status, {"code": "old-friendly-url", "href": "/tournaments/old-friendly-url", "status": "AVAILABLE"})

    def test_official_legacy_cache_lookup_never_reuses_another_disciplines_code(self):
        db = Database()
        double_cache = {"code": "T99", "source_tournament_id": db.event["source_id"], "discipline": "DOUBLE"}
        with patch.object(pages, "load_tournament_cache", return_value={"tournaments": [double_cache]}):
            payload, _ = pages.official_payload(db, db.event)
        self.assertEqual(payload["code"], "oc1-2026-10-18")

    def test_truthy_empty_legacy_source_still_validates_the_official_podium(self):
        snapshot = read_fixture("oc1_published.json")
        snapshot["source"] = {"sourceId": "t_ssSW_4561", "matches": []}
        db = Database(snapshot)
        payload, _ = pages.official_payload(db, db.event)
        db.save(payload)
        corrected = current_oc1()
        final = next(match for match in corrected["matches"] if match["stage_code"] == "ko_4")
        final["home_score"], final["away_score"] = final["away_score"], final["home_score"]
        final["winner"] = final["away"] if final["winner"] == final["home"] else final["home"]
        with patch("app.services.ranking_nakka.collect_private", return_value=corrected):
            preview = pages.preview_refresh(db, payload["code"], "admin")
        self.assertFalse(preview["can_apply"])
        self.assertTrue(any("Palmarès" in warning for warning in preview["warnings"]))
        self.assertFalse(db.commits)


if __name__ == "__main__":
    unittest.main()
